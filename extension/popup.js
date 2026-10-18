// Popup: injects content.js into the active tab (activeTab + scripting), drives it
// through window.__slowedrvb, and stores effect settings in chrome.storage.local
// (content.js listens for changes, so sliders apply live).

var ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
var ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

var hasChrome = typeof chrome !== 'undefined' && chrome.tabs && chrome.scripting;
var settings = slowedrvbWithDefaults(null);
var tabId = null;
var tabState = { enabled: false, mediaCount: 0, playing: false, speedOnly: 0, suspended: false };

var $ = function (id) { return document.getElementById(id); };
var disc = $('disc'), statusEl = $('status'), powerBtn = $('btn-power'), playBtn = $('btn-play');
var controls = $('controls');

var SLIDERS = {
  rate:         function (v) { return v.toFixed(2); },
  reverbMix:    function (v) { return String(Math.round(v)); },
  bass:         function (v) { return v.toFixed(1); },
  reverbDecay:  function (v) { return v.toFixed(1); },
  eightDPeriod: function (v) { return v.toFixed(1); },
  pan:          function (v) { v = Math.round(v); return v === 0 ? 'C' : (v < 0 ? 'L ' : 'R ') + Math.abs(v); },
  volume:       function (v) { return String(Math.round(v)); }
};

function setStatus(text, className) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (className ? ' ' + className : '');
}

// ---- settings <-> UI ----
function renderSettings() {
  Object.keys(SLIDERS).forEach(function (key) {
    var input = $(key);
    if (document.activeElement !== input) input.value = settings[key];
    $(key + '-value').textContent = SLIDERS[key](settings[key]);
  });
  var btn8d = $('btn-8d');
  btn8d.textContent = settings.eightD ? 'on' : 'off';
  btn8d.classList.toggle('active', settings.eightD);
  btn8d.setAttribute('aria-pressed', String(settings.eightD));
  $('eightd-speed').hidden = !settings.eightD;
  $('pan-section').classList.toggle('disabled', settings.eightD);
  if (settings.eightD) $('pan-value').textContent = '8D';
  document.documentElement.style.setProperty('--rotation-duration', (1.8 / Math.max(0.05, settings.rate)) + 's');
}

var saveFrame = null;
function saveSettings() {
  renderSettings();
  if (!hasChrome || saveFrame) return;
  // coalesce slider drags to one write per frame
  saveFrame = requestAnimationFrame(function () {
    saveFrame = null;
    chrome.storage.local.set({ settings: settings });
  });
}

Object.keys(SLIDERS).forEach(function (key) {
  $(key).addEventListener('input', function (e) {
    settings[key] = parseFloat(e.target.value);
    saveSettings();
  });
});

$('btn-8d').addEventListener('click', function () {
  settings.eightD = !settings.eightD;
  saveSettings();
});

$('btn-reset').addEventListener('click', function () {
  settings = slowedrvbWithDefaults(null);
  saveSettings();
});

$('btn-advanced').addEventListener('click', function () {
  var adv = $('advanced');
  var open = adv.hidden;
  adv.hidden = !open;
  this.textContent = open ? 'hide advanced ▴' : 'show advanced ▾';
  this.setAttribute('aria-expanded', String(open));
});

// ---- talking to the tab ----
// runs fn inside every frame's content script and merges the per-frame states
async function runInTab(method, arg) {
  var results = await chrome.scripting.executeScript({
    target: { tabId: tabId, allFrames: true },
    func: function (m, a) { return window.__slowedrvb ? window.__slowedrvb[m](a) : null; },
    args: [method, arg === undefined ? null : arg]
  });
  var merged = { enabled: false, mediaCount: 0, playing: false, speedOnly: 0, suspended: false };
  results.forEach(function (r) {
    var s = r && r.result;
    if (!s) return;
    merged.enabled = merged.enabled || s.enabled;
    merged.mediaCount += s.mediaCount;
    merged.playing = merged.playing || s.playing;
    merged.speedOnly += s.speedOnly;
    merged.suspended = merged.suspended || s.suspended;
  });
  return merged;
}

function renderTabState() {
  var s = tabState;
  powerBtn.disabled = false;
  powerBtn.classList.toggle('active', s.enabled);
  powerBtn.setAttribute('aria-pressed', String(s.enabled));
  powerBtn.textContent = s.enabled ? 'turn off' : 'slow + reverb this tab';
  playBtn.disabled = s.mediaCount === 0;
  playBtn.innerHTML = s.playing ? ICON_PAUSE : ICON_PLAY;
  disc.classList.toggle('spinning', s.enabled && s.playing);

  if (!s.enabled) {
    if (s.mediaCount === 0) setStatus('no audio or video on this page yet — start something playing, then press the button.');
    else setStatus('ready — press the button to slow + reverb this tab.');
  } else if (s.suspended) {
    setStatus('click anywhere on the page once so chrome lets the audio through.', 'error');
  } else if (s.mediaCount && s.speedOnly === s.mediaCount) {
    setStatus('slowed — this site blocks effects on its audio, so reverb and bass are off here.', 'error');
  } else if (s.mediaCount === 0) {
    setStatus('on — waiting for audio or video to play.', 'ready');
  } else {
    setStatus('slowed + reverbed. reloading the page turns it off.', 'ready');
  }
}

async function refresh() {
  try {
    tabState = await runInTab('state');
    renderTabState();
  } catch (e) { /* tab navigated away; the next tick retries */ }
}

powerBtn.addEventListener('click', async function () {
  powerBtn.disabled = true;
  try {
    tabState = await runInTab('setEnabled', !tabState.enabled);
  } catch (e) {
    setStatus('lost the tab — reopen the popup.', 'error');
  }
  renderTabState();
});

playBtn.addEventListener('click', async function () {
  try { tabState = await runInTab('togglePlay'); } catch (e) {}
  renderTabState();
});

async function init() {
  renderSettings();
  playBtn.innerHTML = ICON_PLAY;

  if (!hasChrome) {   // opened as a plain page (store screenshots / local preview)
    $('track-name').textContent = 'slowed + reverb';
    tabState = { enabled: true, mediaCount: 1, playing: true, speedOnly: 0, suspended: false };
    renderTabState();
    return;
  }

  var got = await chrome.storage.local.get('settings');
  settings = slowedrvbWithDefaults(got.settings);
  renderSettings();

  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  var tab = tabs[0];
  if (!tab) return;
  tabId = tab.id;
  $('track-name').textContent = tab.title || '';

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: ['settings.js', 'content.js']
    });
  } catch (e) {
    controls.classList.add('disabled');
    setStatus("chrome doesn't let extensions run on this page. open a music or video site and try again.", 'error');
    return;
  }

  await refresh();
  setInterval(refresh, 1000);
}

init();

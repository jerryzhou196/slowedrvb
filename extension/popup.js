// Popup: injects content.js into every frame of the active tab (activeTab + scripting)
// and reads/updates that tab's state through window.__slowedrvb. State is per tab,
// so a fresh tab starts neutral and "reset" turns everything off.

// ---- first-paint benchmarking: open the popup, right-click → Inspect, read the console ----
// Times are ms since the popup document started loading (performance.now()). Each step is
// also a performance.mark, so it shows up in DevTools' Performance panel.
var DEBUG = true;
var timings = {};
function mark(name, detail) {
  timings[name] = Math.round(performance.now() * 10) / 10;
  try { performance.mark('slowedrvb:' + name); } catch (e) {}
  if (DEBUG) console.log('[slowedrvb] ' + timings[name].toFixed(1) + 'ms ' + name + (detail ? ' — ' + detail : ''));
}
mark('script start');

if (DEBUG && typeof PerformanceObserver !== 'undefined') {
  // first-paint = the dark background; first-contentful-paint = first visible text/graphics
  new PerformanceObserver(function (list) {
    list.getEntries().forEach(function (e) { timings[e.name] = Math.round(e.startTime * 10) / 10; console.log('[slowedrvb] ' + e.startTime.toFixed(1) + 'ms ' + e.name + ' (browser)'); });
  }).observe({ type: 'paint', buffered: true });
}

var $ = function (id) { return document.getElementById(id); };
var record = $('record'), arm = $('arm'), statusEl = $('status'), controls = $('controls');
var eightDBtn = $('eightD');

var hasChrome = typeof chrome !== 'undefined' && chrome.tabs && chrome.scripting;
var tabId = null;
var state = slowedrvbWithDefaults(null);

var FMT = {
  rate:         function (v) { return v.toFixed(2) + '×'; },
  reverbMix:    function (v) { return Math.round(v) + '%'; },
  bass:         function (v) { return '+' + v.toFixed(1) + ' dB'; },
  reverbDecay:  function (v) { return v.toFixed(1) + ' s'; },
  eightDPeriod: function (v) { return v.toFixed(1) + ' s'; },
  pan:          function (v) { v = Math.round(v); return v === 0 ? 'C' : (v < 0 ? 'L ' : 'R ') + Math.abs(v); },
  volume:       function (v) { return Math.round(v) + '%'; }
};

function paint(playing) {
  Object.keys(FMT).forEach(function (k) {
    var el = $(k);
    if (document.activeElement !== el) el.value = state[k];
    $(k + 'Out').textContent = FMT[k](state[k]);
    var pct = ((state[k] - el.min) / (el.max - el.min)) * 100;
    el.style.setProperty('--fill', pct + '%');
  });
  eightDBtn.textContent = state.eightD ? 'on' : 'off';
  eightDBtn.setAttribute('aria-checked', String(state.eightD));
  $('orbit').hidden = !state.eightD;
  $('panCtl').classList.toggle('disabled', state.eightD);
  if (state.eightD) $('panOut').textContent = '8D';

  // record spins faster/slower with the rate (33⅓ rpm ≈ 1.8 s per turn)
  record.style.animationDuration = (1.8 / Math.max(0.05, state.rate)) + 's';
  if (playing !== undefined) {
    record.classList.toggle('playing', playing);
    arm.style.setProperty('--arm-rot', playing ? '24deg' : '8deg');
  }
}

function showStatus(info) {
  if (!info.mediaCount) statusEl.textContent = 'no audio or video found on this page yet';
  else if (info.suspended) statusEl.textContent = 'click anywhere on the page once to let the effects through';
  else if (info.claimed) statusEl.textContent = 'another audio extension (or an older copy of this one) holds this tab\'s audio. turn it off, then reload the page';
  else if (info.speedOnly) statusEl.textContent = 'speed works here; reverb & bass are blocked by this site';
  else statusEl.textContent = '';
}

// runs window.__slowedrvb(next) in every frame and merges the results
async function call(next) {
  var results = await chrome.scripting.executeScript({
    target: { tabId: tabId, allFrames: true },
    func: function (s) { return window.__slowedrvb ? window.__slowedrvb(s) : null; },
    args: [next || null]
  });
  return merge(results);
}

function merge(results) {
  var frames = results.map(function (r) { return r.result; }).filter(Boolean);
  // prefer the frame that actually holds media (e.g. an embedded player)
  var main = frames.filter(function (f) { return f.mediaCount > 0; })[0] || frames[0];
  return {
    state: main && main.state,
    mediaCount: frames.reduce(function (n, f) { return n + f.mediaCount; }, 0),
    playing: frames.some(function (f) { return f.playing; }),
    speedOnly: frames.reduce(function (n, f) { return n + f.speedOnly; }, 0),
    claimed: frames.reduce(function (n, f) { return n + (f.claimed || 0); }, 0),
    suspended: frames.some(function (f) { return f.suspended; })
  };
}

// coalesce slider drags to one tab update per frame
var pending = null;
function push() {
  paint();
  if (!hasChrome || pending) return;
  pending = requestAnimationFrame(async function () {
    pending = null;
    try {
      var info = await call(state);
      paint(info.playing);
      showStatus(info);
    } catch (e) { /* tab navigated away */ }
  });
}

Object.keys(FMT).forEach(function (k) {
  $(k).addEventListener('input', function (e) {
    state[k] = parseFloat(e.target.value);
    push();
  });
});

document.querySelectorAll('[data-preset]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    state = slowedrvbWithDefaults(Object.assign({}, state, SLOWEDRVB_PRESETS[btn.dataset.preset]));
    push();
  });
});

eightDBtn.addEventListener('click', function () {
  state.eightD = !state.eightD;
  push();
});

$('more').addEventListener('click', function () {
  var extras = $('extras');
  var open = extras.hidden;
  extras.hidden = !open;
  this.textContent = open ? 'less ▴' : 'more ▾';
  this.setAttribute('aria-expanded', String(open));
  if (open) extras.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// The popup stays hidden (html.loading) until the tab's real state is painted, so
// it never flashes the neutral defaults; the arm skips its swing on that first paint.
var revealed = false;
function reveal(reason) {
  if (revealed) return;
  revealed = true;
  document.documentElement.classList.remove('loading');
  mark('revealed', reason);
  requestAnimationFrame(function () {
    // the frame after this rAF is the first one on screen with the real state
    requestAnimationFrame(function () {
      document.documentElement.classList.remove('no-anim');
      mark('first real paint');
      if (DEBUG) {
        // let the paint observer catch up, then print the whole timeline at once
        setTimeout(function () { console.table(timings); }, 0);
      }
    });
  });
}
// never leave the popup blank if the page is slow to answer
setTimeout(function () { if (!revealed) { paint(false); reveal('fallback: tab took >500ms'); } }, 500);

(async function init() {
  if (!hasChrome) {   // opened as a plain page (store screenshots / local preview)
    state = slowedrvbWithDefaults(SLOWEDRVB_PRESETS.slowed);
    paint(true);
    reveal('preview page, no chrome APIs');
    return;
  }

  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tabs[0] && tabs[0].id;
  mark('tabs.query done', 'tab ' + tabId + ' ' + (tabs[0] && tabs[0].url ? tabs[0].url.split('/').slice(0, 3).join('/') : '(no url access)'));
  try {
    // injecting returns content.js's last expression: each frame's current state
    var results = await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: ['settings.js', 'content.js']
    });
    var info = merge(results);
    mark('inject + state returned', results.length + ' frame(s), ' + info.mediaCount + ' media, rate ' + (info.state ? info.state.rate : '?'));
    if (info.state) state = slowedrvbWithDefaults(info.state);
    paint(info.playing);
    showStatus(info);
    mark('state painted');
    reveal('tab state');
    // keep the record in sync with play/pause while the popup is open
    setInterval(async function () {
      try {
        var i = await call(null);
        paint(i.playing);
        showStatus(i);
      } catch (e) {}
    }, 1000);
  } catch (e) {
    mark('inject failed', e && e.message);
    paint(false);
    controls.classList.add('disabled');
    $('presets').classList.add('disabled');
    statusEl.textContent = "chrome doesn't allow extensions on this page";
    reveal('page not scriptable');
  }
})();

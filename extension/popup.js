// Popup: injects content.js into every frame of the active tab (activeTab + scripting)
// and reads/updates that tab's state through window.__slowedrvb. State is per tab,
// so a fresh tab starts neutral and "reset" turns everything off.

// ---- open-latency tracing ----
// Every step of opening the popup is recorded by trace.js (ms since the popup document
// started loading) and kept across opens; see debug.html (Shift+D in the popup).
// DEBUG also echoes each step to the console and adds performance.marks for DevTools.
var DEBUG = true;
var trace = window.slowedrvbTrace;
function mark(name, data, opts) {
  var t = trace.mark(name, data, opts);
  try { performance.mark('slowedrvb:' + name); } catch (e) {}
  if (DEBUG) console.log('[slowedrvb] ' + t.toFixed(1) + 'ms ' + name + (data !== undefined ? ' — ' + JSON.stringify(data) : ''));
}
mark('popup.js start');

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
  trace.fact('revealReason', reason);
  mark('revealed', reason);
  requestAnimationFrame(function () {
    mark('rAF after reveal');
    // the frame after this rAF is the first one on screen with the real state
    requestAnimationFrame(function () {
      document.documentElement.classList.remove('no-anim');
      mark('first real paint', undefined, { save: true });
      if (DEBUG) setTimeout(function () { console.table(trace.trace.marks); }, 0);
    });
  });
}
// never leave the popup blank if the page is slow to answer. Always record when the
// timer actually fired: firing well after 500ms means Chrome was throttling the popup.
var FALLBACK_MS = 500;
setTimeout(function () {
  mark('fallback timer fired', { lateByMs: Math.round(trace.now() - FALLBACK_MS) });
  if (!revealed) { paint(false); reveal('fallback: tab took >' + FALLBACK_MS + 'ms'); }
}, FALLBACK_MS);

// Shift+D: open the trace viewer
document.addEventListener('keydown', function (e) {
  if (e.shiftKey && (e.key === 'D' || e.key === 'd') && hasChrome) {
    chrome.tabs.create({ url: chrome.runtime.getURL('debug.html') });
  }
});

mark('popup.js setup done');

(async function init() {
  if (!hasChrome) {   // opened as a plain page (store screenshots / local preview)
    state = slowedrvbWithDefaults(SLOWEDRVB_PRESETS.slowed);
    paint(true);
    reveal('preview page, no chrome APIs');
    return;
  }

  mark('tabs.query start');
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tabs[0] && tabs[0].id;
  var origin = tabs[0] && tabs[0].url ? tabs[0].url.split('/').slice(0, 3).join('/') : '(no url access)';
  trace.fact('origin', origin);
  trace.fact('tabStatus', tabs[0] && tabs[0].status);   // 'loading' tabs can be slow to inject
  trace.fact('tabAudible', !!(tabs[0] && tabs[0].audible));
  mark('tabs.query done', { tab: tabId, origin: origin });
  try {
    // injecting returns content.js's last expression: each frame's current state
    mark('inject start');
    var results = await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: ['settings.js', 'content.js']
    });
    var info = merge(results);
    // how each frame spent its time (measured inside the page by content.js)
    var frames = results.map(function (r) {
      var p = r.result && r.result.perf;
      return p ? { frame: r.frameId, fresh: p.fresh, scriptMs: p.scriptMs, sinceFrameLoadMs: p.sinceFrameLoadMs, mediaCount: r.result.mediaCount } : { frame: r.frameId, noResult: true };
    });
    trace.fact('frames', frames);
    trace.fact('mediaCount', info.mediaCount);
    trace.fact('reinjected', frames.some(function (f) { return f.fresh === false; }));
    mark('inject + state returned', { frames: results.length, media: info.mediaCount, rate: info.state ? info.state.rate : null });
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
    trace.fact('injectError', e && e.message);
    mark('inject failed', e && e.message, { save: true });
    paint(false);
    controls.classList.add('disabled');
    $('presets').classList.add('disabled');
    statusEl.textContent = "chrome doesn't allow extensions on this page";
    reveal('page not scriptable');
  }
})();

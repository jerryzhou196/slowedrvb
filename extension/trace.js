// Per-open trace recorder for debugging popup latency. Loaded first in popup.html.
//
// Every popup open becomes one trace: timestamped marks (ms since the popup document
// started loading), plus facts about the open. Traces go into a ring buffer in the
// extension's own localStorage, so they survive the popup closing and need no
// DevTools (which itself slows the popup down). View them at debug.html (Shift+D in
// the popup).
//
// Recording is on for unpacked/dev installs only; store installs carry update_url.
(function () {
  var KEY = 'slowedrvb.traces';
  var LAST_OPEN_KEY = 'slowedrvb.lastOpenAt';
  var FORCE_KEY = 'slowedrvb.traceForce';
  var MAX = 200;

  var manifest = {};
  try { manifest = chrome.runtime.getManifest(); } catch (e) {}
  var enabled = false;
  try { enabled = !manifest.update_url || localStorage.getItem(FORCE_KEY) === '1'; } catch (e) {}

  var now = function () { return Math.round(performance.now() * 10) / 10; };

  var lastOpenAt = null;
  try { lastOpenAt = Number(localStorage.getItem(LAST_OPEN_KEY)) || null; } catch (e) {}
  var openedAt = Math.round(performance.timeOrigin);
  try { localStorage.setItem(LAST_OPEN_KEY, String(openedAt)); } catch (e) {}

  var trace = {
    id: openedAt + '-' + Math.random().toString(36).slice(2, 6),
    openedAt: openedAt,                       // epoch ms the popup document started
    sincePrevOpenMs: lastOpenAt ? openedAt - lastOpenAt : null,   // cold vs warm signal
    version: manifest.version || null,
    marks: [],                                // [{ name, t, data }]
    facts: {},
    visibility: [{ state: document.visibilityState, t: now() }],
    errors: [],
    longTasks: [],
    complete: false                           // true once pagehide fires (popup closed cleanly)
  };

  // where the document's own loading time went: the navigation itself and each file
  // (popup.css, settings.js, popup.js…), as start → end ms
  function collectLoading() {
    try {
      var nav = performance.getEntriesByType('navigation')[0];
      if (nav) {
        trace.navigation = {
          responseEnd: Math.round(nav.responseEnd), domInteractive: Math.round(nav.domInteractive),
          domContentLoaded: Math.round(nav.domContentLoadedEventEnd), loadEnd: Math.round(nav.loadEventEnd)
        };
      }
      trace.resources = performance.getEntriesByType('resource').map(function (r) {
        return { file: r.name.split('/').pop(), start: Math.round(r.startTime), end: Math.round(r.responseEnd) };
      });
    } catch (e) {}
  }

  function save() {
    if (!enabled) return;
    collectLoading();
    try {
      var all = JSON.parse(localStorage.getItem(KEY) || '[]');
      var i = all.findIndex(function (t) { return t.id === trace.id; });
      if (i >= 0) all[i] = trace; else all.push(trace);
      if (all.length > MAX) all = all.slice(all.length - MAX);
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch (e) {}
  }

  var api = {
    enabled: enabled,
    trace: trace,
    now: now,
    // mark(name, data?, { save: true } to persist right away)
    mark: function (name, data, opts) {
      var m = { name: name, t: now() };
      if (data !== undefined) m.data = data;
      trace.marks.push(m);
      if (opts && opts.save) save();
      return m.t;
    },
    fact: function (key, value) { trace.facts[key] = value; },
    save: save
  };
  window.slowedrvbTrace = api;

  api.mark('trace.js start');
  api.fact('cpus', navigator.hardwareConcurrency);

  // Did the event loop run late? A setTimeout(0) that fires long after it was set means
  // the popup was busy or Chrome was throttling it (hidden pages get throttled timers).
  var probeSet = now();
  setTimeout(function () { api.fact('timeout0LagMs', Math.round(now() - probeSet)); }, 0);

  document.addEventListener('DOMContentLoaded', function () { api.mark('DOMContentLoaded'); });
  window.addEventListener('load', function () { api.mark('load'); });
  document.addEventListener('visibilitychange', function () {
    trace.visibility.push({ state: document.visibilityState, t: now() });
  });

  if (typeof PerformanceObserver !== 'undefined') {
    try {
      new PerformanceObserver(function (list) {
        // the browser reports when it actually painted; record that time, not when we heard
        list.getEntries().forEach(function (e) {
          trace.marks.push({ name: 'browser ' + e.name, t: Math.round(e.startTime * 10) / 10 });
        });
      }).observe({ type: 'paint', buffered: true });
    } catch (e) {}
    try {
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (e) {
          trace.longTasks.push({ t: Math.round(e.startTime), ms: Math.round(e.duration) });
        });
      }).observe({ type: 'longtask', buffered: true });
    } catch (e) {}
  }

  window.addEventListener('error', function (e) {
    trace.errors.push({ t: now(), msg: String(e.message || e.error), at: (e.filename || '').split('/').pop() + ':' + e.lineno });
    save();
  });
  window.addEventListener('unhandledrejection', function (e) {
    trace.errors.push({ t: now(), msg: 'unhandled rejection: ' + String(e.reason && e.reason.message || e.reason) });
    save();
  });

  // The popup closing is the last thing we can see. pagehide fires reliably on close,
  // and localStorage writes are synchronous, so the final trace lands.
  window.addEventListener('pagehide', function () {
    api.mark('pagehide (closed)');
    trace.complete = true;
    trace.lifetimeMs = now();
    try { trace.facts.heapMB = Math.round(performance.memory.usedJSHeapSize / 1048576); } catch (e) {}
    save();
  });

  save();
})();

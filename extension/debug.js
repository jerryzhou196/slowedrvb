// Trace viewer for popup opens recorded by trace.js (same extension origin, so it
// reads the same localStorage).

var KEY = 'slowedrvb.traces';
var COLD_AFTER_MS = 60 * 1000;

// waterfall phases, in order: [label, css color var, start mark, end mark]
var PHASES = [
  ['chrome → popup js', '--p-load',   null,                     'trace.js start'],
  ['load css + html',   '--p-parse', 'trace.js start',         'settings.js start'],
  ['load popup.js',     '--p-js',    'settings.js start',      'popup.js start'],
  ['popup.js setup',    '--p-setup', 'popup.js start',         'tabs.query start'],
  ['tabs.query',         '--p-query', 'tabs.query start',       'tabs.query done'],
  ['inject into tab',    '--p-inject', 'inject start',          'inject + state returned'],
  ['paint state',        '--p-paint', 'inject + state returned', 'revealed'],
  ['reveal → on screen', '--p-screen', 'revealed',              'first real paint']
];

var $ = function (id) { return document.getElementById(id); };
var traces = [];
var open = {};

function load() {
  try { traces = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { traces = []; }
  traces.sort(function (a, b) { return b.openedAt - a.openedAt; });
}

function markTime(t, name) {
  for (var i = 0; i < t.marks.length; i++) if (t.marks[i].name === name) return t.marks[i].t;
  return null;
}

function phaseSpans(t) {
  return PHASES.map(function (p) {
    var a = p[2] ? markTime(t, p[2]) : 0;
    var b = markTime(t, p[3]);
    return (a == null || b == null) ? null : { start: a, ms: Math.max(0, b - a) };
  });
}

function total(t) { return markTime(t, 'first real paint'); }
function isCold(t) { return t.sincePrevOpenMs == null || t.sincePrevOpenMs > COLD_AFTER_MS; }

function flags(t, newest) {
  var out = [];
  var reason = t.facts.revealReason || '';
  if (/fallback/.test(reason)) out.push(['fallback reveal', 'bad']);
  var late = t.marks.filter(function (m) { return m.name === 'fallback timer fired'; })[0];
  if (late && late.data && late.data.lateByMs > 100) out.push(['timer +' + late.data.lateByMs + 'ms late', 'warn']);
  if (t.facts.injectError) out.push(['inject failed', 'bad']);
  if (t.errors && t.errors.length) out.push([t.errors.length + ' error(s)', 'bad']);
  if (!t.complete && !newest) out.push(['no close recorded', 'warn']);
  if (t.facts.tabStatus === 'loading') out.push(['tab loading', 'warn']);
  if (t.facts.reinjected) out.push(['reinjected', '']);
  if (t.longTasks && t.longTasks.length) out.push([t.longTasks.length + ' long task(s)', 'warn']);
  if (t.facts.timeout0LagMs > 50) out.push(['event loop +' + t.facts.timeout0LagMs + 'ms', 'warn']);
  return out;
}

function pct(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function filtered() {
  var origin = $('origin').value, temp = $('temp').value;
  return traces.filter(function (t) {
    if (origin && t.facts.origin !== origin) return false;
    if (temp === 'cold' && !isCold(t)) return false;
    if (temp === 'warm' && isCold(t)) return false;
    return true;
  });
}

function fmt(ms) { return ms == null ? '–' : Math.round(ms) + ''; }

function renderStats(list) {
  var rows = PHASES.map(function (p, i) {
    var v = list.map(function (t) { var s = phaseSpans(t)[i]; return s && s.ms; })
      .filter(function (x) { return x != null; }).sort(function (a, b) { return a - b; });
    return { label: p[0], color: p[1], n: v.length, p50: pct(v, 0.5), p90: pct(v, 0.9), max: v[v.length - 1] };
  });
  var tot = list.map(total).filter(function (x) { return x != null; }).sort(function (a, b) { return a - b; });
  rows.push({ label: 'total to real paint', n: tot.length, p50: pct(tot, 0.5), p90: pct(tot, 0.9), max: tot[tot.length - 1], total: true });

  // the phase with the worst p90 is where to look first
  var worst = rows.slice(0, -1).reduce(function (a, b) { return (b.p90 || 0) > (a.p90 || 0) ? b : a; });

  var html = '<tr><th>phase</th><th class="num">n</th><th class="num">p50 ms</th><th class="num">p90 ms</th><th class="num">max ms</th></tr>';
  rows.forEach(function (r) {
    var mark = r === worst && r.p90 ? ' class="num slow"' : ' class="num"';
    html += '<tr><td>' + (r.color ? '<i style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;background:var(' + r.color + ')"></i>' : '') +
      (r.total ? '<b>' + r.label + '</b>' : r.label) + '</td><td class="num">' + r.n + '</td><td class="num">' + fmt(r.p50) +
      '</td><td' + mark + '>' + fmt(r.p90) + '</td><td class="num">' + fmt(r.max) + '</td></tr>';
  });
  $('stats').innerHTML = html;
}

function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

function renderOpens(list) {
  if (!list.length) {
    $('opens').innerHTML = '<tr><td class="empty">no traces yet. open the popup a few times on different tabs, then refresh.</td></tr>';
    return;
  }
  var scale = Math.max(800, Math.max.apply(null, list.map(function (t) { return total(t) || markTime(t, 'revealed') || 0; })));
  var html = '<tr><th>opened</th><th>site</th><th></th><th class="num">total ms</th><th>waterfall (0–' + Math.round(scale) + 'ms, white = 500ms fallback)</th><th>flags</th></tr>';
  list.forEach(function (t, idx) {
    var spans = phaseSpans(t);
    var bars = spans.map(function (s, i) {
      if (!s) return '';
      return '<span style="left:' + (s.start / scale * 100) + '%;width:' + Math.max(0.3, s.ms / scale * 100) + '%;background:var(' + PHASES[i][1] + ')" title="' + PHASES[i][0] + ': ' + Math.round(s.ms) + 'ms"></span>';
    }).join('') + '<span class="tick" style="left:' + (500 / scale * 100) + '%" title="500ms fallback"></span>';
    var f = flags(t, idx === 0 && t === traces[0]).map(function (x) { return '<span class="flag ' + x[1] + '">' + esc(x[0]) + '</span>'; }).join('');
    var when = new Date(t.openedAt).toLocaleTimeString();
    html += '<tr class="row" data-id="' + esc(t.id) + '"><td>' + when + '</td><td>' + esc((t.facts.origin || '').replace(/^https?:\/\//, '')) + '</td><td>' +
      (isCold(t) ? '<span class="flag warn">cold</span>' : '<span class="flag">warm</span>') + '</td><td class="num">' + fmt(total(t)) +
      '</td><td><div class="wf">' + bars + '</div></td><td>' + f + '</td></tr>';
    if (open[t.id]) {
      var lines = t.marks.map(function (m) { return (m.t.toFixed(1) + 'ms').padStart(10) + '  ' + m.name + (m.data !== undefined ? '  ' + JSON.stringify(m.data) : ''); });
      html += '<tr class="detail"><td colspan="6">' + esc(lines.join('\n') + '\n\nfacts: ' + JSON.stringify(t.facts, null, 1) +
        '\nvisibility: ' + JSON.stringify(t.visibility) + (t.errors.length ? '\nerrors: ' + JSON.stringify(t.errors, null, 1) : '') +
        (t.longTasks.length ? '\nlong tasks: ' + JSON.stringify(t.longTasks) : '') +
        (t.navigation ? '\nnavigation: ' + JSON.stringify(t.navigation) : '') +
        (t.resources ? '\nfiles (start → end ms): ' + t.resources.map(function (r) { return r.file + ' ' + r.start + '→' + r.end; }).join(', ') : '') + '\nsince previous open: ' + fmt(t.sincePrevOpenMs) + 'ms, lifetime: ' + fmt(t.lifetimeMs) + 'ms') + '</td></tr>';
    }
  });
  $('opens').innerHTML = html;
}

function render() {
  var origins = {};
  traces.forEach(function (t) { if (t.facts.origin) origins[t.facts.origin] = (origins[t.facts.origin] || 0) + 1; });
  var sel = $('origin'), cur = sel.value;
  sel.innerHTML = '<option value="">all sites (' + traces.length + ')</option>' + Object.keys(origins).sort().map(function (o) {
    return '<option value="' + esc(o) + '">' + esc(o.replace(/^https?:\/\//, '')) + ' (' + origins[o] + ')</option>';
  }).join('');
  sel.value = cur;
  var list = filtered();
  renderStats(list);
  renderOpens(list);
}

$('legend').innerHTML = PHASES.map(function (p) { return '<span><i style="background:var(' + p[1] + ')"></i>' + p[0] + '</span>'; }).join('');

$('opens').addEventListener('click', function (e) {
  var row = e.target.closest('tr.row');
  if (!row) return;
  open[row.dataset.id] = !open[row.dataset.id];
  render();
});
$('refresh').addEventListener('click', function () { load(); render(); });
$('origin').addEventListener('change', render);
$('temp').addEventListener('change', render);

function payload() {
  return JSON.stringify({ exportedAt: new Date().toISOString(), userAgent: navigator.userAgent, traces: traces }, null, 1);
}
$('export').addEventListener('click', function () {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([payload()], { type: 'application/json' }));
  a.download = 'slowedrvb-traces-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
});
$('copy').addEventListener('click', function () {
  navigator.clipboard.writeText(payload()).then(
    function () { $('msg').textContent = 'copied ' + traces.length + ' traces'; },
    function () { $('msg').textContent = 'copy failed; use download'; });
});
$('clear').addEventListener('click', function () {
  if (!confirm('delete all ' + traces.length + ' recorded traces?')) return;
  localStorage.removeItem(KEY);
  load(); render();
});

// view an exported file (yours, someone else's, or tools/popup-bench output) without
// touching this install's own traces; refresh goes back to them
$('import').addEventListener('change', function () {
  var file = this.files[0];
  if (!file) return;
  file.text().then(function (text) {
    var data = JSON.parse(text);
    traces = (data.traces || data).slice().sort(function (a, b) { return b.openedAt - a.openedAt; });
    $('msg').textContent = 'viewing ' + traces.length + ' traces from ' + file.name + ' (refresh to go back)';
    render();
  }).catch(function (e) { $('msg').textContent = 'could not read that file: ' + e.message; });
});

// new opens land while this page is open (other tabs' popups write the same storage)
window.addEventListener('storage', function (e) { if (e.key === KEY) { load(); render(); } });

load();
render();

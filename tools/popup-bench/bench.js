// Opens the slowedrvb popup over and over in Chromium and reports how long each open
// took, using the same traces the popup records for debug.html.
//
//   npm install && npx playwright install chromium
//   node bench.js --runs 20 --url https://music.youtube.com/ --url https://example.com/
//   node bench.js --runs 10 --cold          # fresh browser for every open
//
// Options:
//   --runs N        opens per URL (default 10)
//   --url URL       tab to open the popup on; repeat for several (default: a local test page)
//   --cold          relaunch the browser before every open (measures first-open cost)
//   --gap MS        wait between warm opens (default 300)
//   --out FILE      write all traces as JSON (same format as debug.html's download)
//   --chrome PATH   use this Chromium/Chrome for Testing binary instead of Playwright's
//   --cpu-load N    keep N CPU cores busy during the run (tests the "busy machine" theory)
//
// Branded Chrome ignores --load-extension, so this uses Playwright's Chromium. A test
// copy of the extension gets host permissions so injection works without the user
// click that normally grants activeTab.

const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const EXT = path.resolve(__dirname, '../../extension');

function parseArgs(argv) {
  const o = { runs: 10, urls: [], cold: false, gap: 300, out: null, chrome: null, cpuLoad: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--runs') o.runs = Number(argv[++i]);
    else if (a === '--url') o.urls.push(argv[++i]);
    else if (a === '--cold') o.cold = true;
    else if (a === '--gap') o.gap = Number(argv[++i]);
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--chrome') o.chrome = argv[++i];
    else if (a === '--cpu-load') o.cpuLoad = Number(argv[++i]);
    else throw new Error('unknown option ' + a);
  }
  return o;
}

// a local page with one playing <audio>, so runs work offline
function startTestServer() {
  const sr = 8000, n = sr * 20, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(i / sr * 2 * Math.PI * 220) * 4000), 44 + i * 2);
  const server = http.createServer((req, res) => {
    if (req.url === '/t.wav') { res.writeHead(200, { 'content-type': 'audio/wav' }); return res.end(buf); }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>bench page</title><audio src="/t.wav" loop autoplay></audio>');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function testCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slowedrvb-bench-ext-'));
  fs.cpSync(EXT, dir, { recursive: true });
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  m.host_permissions = ['<all_urls>'];
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m));
  return dir;
}

async function launch(extDir, profileDir, chromePath) {
  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    executablePath: chromePath || undefined,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`,
      '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  let extId = null;
  for (let i = 0; i < 40 && !extId; i++) {
    const p = await ctx.newPage();
    await p.goto('chrome://extensions');
    extId = await p.evaluate(() => chrome.management.getAll().then((a) => a[0] && a[0].id)).catch(() => null);
    await p.close();
    if (!extId) await new Promise((r) => setTimeout(r, 250));
  }
  if (!extId) throw new Error('extension did not load');
  // an extension page to drive chrome.action / read the traces from. Keep it inert:
  // extension pages share one renderer thread with the popup, so a busy page here
  // (debug.html re-renders on every trace write) would slow the popup it measures.
  const helper = await ctx.newPage();
  await helper.goto(`chrome-extension://${extId}/settings.js`);
  return { ctx, extId, helper };
}

async function openOnce(session, tab) {
  await tab.bringToFront();
  // openPopup targets Chrome's last-focused window; if Chrome lost track of it (another
  // app took focus), ask for focus and try again once
  const tryOpen = () => session.helper.evaluate(() => chrome.action.openPopup().then(() => 'ok', (e) => e.message));
  let res = await tryOpen();
  if (res !== 'ok') {
    await session.helper.evaluate(async () => {
      const [win] = await chrome.windows.getAll({ windowTypes: ['normal'] });
      if (win) await chrome.windows.update(win.id, { focused: true });
    });
    await new Promise((r) => setTimeout(r, 300));
    res = await tryOpen();
  }
  if (res !== 'ok') return { error: res };
  // wait until the popup has painted its real state (or given up), then close it
  const done = await session.helper.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      const v = chrome.extension.getViews({ type: 'popup' })[0];
      const t = v && v.slowedrvbTrace && v.slowedrvbTrace.trace;
      if (t && t.marks.some((m) => m.name === 'first real paint' || m.name === 'inject failed')) { v.close(); return true; }
      await new Promise((r) => setTimeout(r, 100));
    }
    chrome.extension.getViews({ type: 'popup' }).forEach((v) => v.close());
    return false;
  });
  return { timedOut: !done };
}

async function readTraces(session) {
  return session.helper.evaluate(() => JSON.parse(localStorage.getItem('slowedrvb.traces') || '[]'));
}

function markTime(t, name) { const m = t.marks.find((x) => x.name === name); return m ? m.t : null; }
const PHASES = [
  ['chrome → popup js', null, 'trace.js start'],
  ['load css + html', 'trace.js start', 'settings.js start'],
  ['load popup.js', 'settings.js start', 'popup.js start'],
  ['popup.js setup', 'popup.js start', 'tabs.query start'],
  ['tabs.query', 'tabs.query start', 'tabs.query done'],
  ['inject into tab', 'inject start', 'inject + state returned'],
  ['paint state', 'inject + state returned', 'revealed'],
  ['reveal → on screen', 'revealed', 'first real paint'],
  ['TOTAL to real paint', null, 'first real paint'],
];
function summarize(traces, label) {
  const pct = (v, p) => v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : null;
  console.log(`\n${label}  (${traces.length} opens)`);
  console.log('phase'.padEnd(22) + 'p50'.padStart(8) + 'p90'.padStart(8) + 'max'.padStart(8));
  for (const [name, a, b] of PHASES) {
    const v = traces.map((t) => {
      const s = a ? markTime(t, a) : 0, e = markTime(t, b);
      return s == null || e == null ? null : e - s;
    }).filter((x) => x != null).sort((x, y) => x - y);
    const f = (x) => (x == null ? '–' : Math.round(x)).toString().padStart(8);
    console.log(name.padEnd(22) + f(pct(v, 0.5)) + f(pct(v, 0.9)) + f(v[v.length - 1]));
  }
  const fallbacks = traces.filter((t) => /fallback/.test(t.facts.revealReason || '')).length;
  const failed = traces.filter((t) => t.facts.injectError).length;
  if (fallbacks || failed) console.log(`fallback reveals: ${fallbacks}, inject failures: ${failed}`);
}

(async () => {
  const opts = parseArgs(process.argv);
  // busy-loop workers so the machine is under load while Chrome opens the popup
  const { Worker } = require('worker_threads');
  const burners = Array.from({ length: opts.cpuLoad }, () => new Worker('for (;;) {}', { eval: true }));
  const server = await startTestServer();
  const urls = opts.urls.length ? opts.urls : [`http://127.0.0.1:${server.address().port}/`];
  const extDir = testCopy();
  const all = [];

  for (const url of urls) {
    const perUrl = [];
    if (opts.cold) {
      for (let i = 0; i < opts.runs; i++) {
        const s = await launch(extDir, fs.mkdtempSync(path.join(os.tmpdir(), 'slowedrvb-bench-prof-')), opts.chrome);
        const tab = await s.ctx.newPage();
        await tab.goto(url, { waitUntil: 'load' }).catch(() => {});
        const r = await openOnce(s, tab);
        if (r.error) console.log(`run ${i + 1}: ${r.error}`);
        perUrl.push(...await readTraces(s));
        await s.ctx.close();
        process.stdout.write('.');
      }
    } else {
      const s = await launch(extDir, fs.mkdtempSync(path.join(os.tmpdir(), 'slowedrvb-bench-prof-')), opts.chrome);
      const tab = await s.ctx.newPage();
      await tab.goto(url, { waitUntil: 'load' }).catch(() => {});
      for (let i = 0; i < opts.runs; i++) {
        const r = await openOnce(s, tab);
        if (r.error) console.log(`run ${i + 1}: ${r.error}`);
        await new Promise((res) => setTimeout(res, opts.gap));
        process.stdout.write('.');
      }
      perUrl.push(...await readTraces(s));
      await s.ctx.close();
    }
    summarize(perUrl, `${url} ${opts.cold ? 'cold' : 'warm'}`);
    all.push(...perUrl);
  }

  if (opts.out) {
    fs.writeFileSync(opts.out, JSON.stringify({ exportedAt: new Date().toISOString(), source: 'bench', traces: all }, null, 1));
    console.log(`\nwrote ${all.length} traces to ${opts.out} (load them in debug.html with the same format)`);
  }
  burners.forEach((w) => w.terminate());
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });

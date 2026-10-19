# Debugging slow popup opens

Popup opens are intermittently slow: sometimes ~100ms, sometimes seconds. This setup
records every open, so a slow one can be explained after the fact without
having DevTools attached (DevTools itself slows the popup down).

## 1. Every open is traced (`extension/trace.js`)

`trace.js` loads first in `popup.html`. Each open gets a timeline of named marks, in ms since Chrome
started loading the popup:

| Mark | Meaning |
| --- | --- |
| `trace.js start` | first byte of popup JS ran, so Chrome has started the popup document |
| `settings.js start` | the HTML (with its inlined CSS) above the scripts is loaded |
| `popup.js start` / `popup.js setup done` | the main script loaded and wired up |
| `tabs.query start` → `done` | asking Chrome which tab is active |
| `inject start` → `inject + state returned` | `content.js` ran in every frame of the tab |
| `revealed` | the popup's content is made visible (reason: tab state, fallback, or page not scriptable) |
| `first real paint` | the frame after reveal, i.e. on screen |
| `browser first-paint` / `first-contentful-paint` | the browser's own paint timings |
| `fallback timer fired` | when the 500ms safety timer actually fired (`lateByMs` large means it was throttled) |
| `pagehide (closed)` | the popup closed; `lifetimeMs` is how long it was open |

It also records:

- **Facts:** site origin, tab loading status, per-frame injection cost measured inside the page, and whether the frame already had the engine.
- **Visibility:** when Chrome switched the popup from `hidden` to `visible`.
- **Other signals:** long tasks, JS errors, event-loop lag, the time since the previous open (cold vs warm), and navigation timing.

The traces live in a 200-entry ring buffer in the extension's own `localStorage`. Recording is
**only on for unpacked installs**: store installs have an `update_url` and record nothing unless
`localStorage['slowedrvb.traceForce'] = '1'` is set from the popup's DevTools.

## 2. Look at them (`extension/debug.html`)

Press **Shift+D** in the popup, or open `chrome-extension://<id>/debug.html`. It shows:

- **Phase table:** p50, p90 and max for each phase, with the worst p90 highlighted.
- **Per-open waterfall:** one bar per open, with a white tick at the 500ms fallback. Click a row for its raw timeline.
- **Flags:** fallback reveal, late timer, inject failed, errors, tab still loading, long tasks, no close recorded.
- **Filters:** by site, and cold vs warm opens.
- **Export:** "download json" / "copy json" to share a session; "view a json export" opens a file (including bench output) without touching your own traces.

## 3. Reproduce on demand (`tools/popup-bench`)

```bash
cd tools/popup-bench
npm install
npx playwright install chromium
```

Warm opens on a local test page:

```bash
node bench.js --runs 20
```

Opens on a real site:

```bash
node bench.js --runs 20 --url https://music.youtube.com/
```

A fresh browser for every open:

```bash
node bench.js --runs 10 --cold
```

The same run while every CPU core is busy:

```bash
node bench.js --runs 15 --cpu-load 10 --out loaded.json
```

The script loads a test copy of the extension in Playwright's Chromium. Branded Chrome ignores `--load-extension`.
It opens the real toolbar popup with `chrome.action.openPopup()`, waits for `first real paint`, closes
it, and prints per-phase percentiles from the same traces. Use `--out` to save them for `debug.html`.

## What it has shown so far (Oct 18, 2026, M-series Mac, 10 cores)

| Run | p50 | p90 | max |
| --- | --- | --- | --- |
| idle, warm | ~95ms | ~340ms | ~1.5s |
| all cores busy (`--cpu-load 10`) | ~450ms | **~62s** | **~91s** |

Under load, nearly all the time goes to *loading the popup's own HTML, CSS and JS*, before any of
our logic runs. During that time the document is still `hidden`. That matches Chrome running the
not-yet-shown popup at background priority, which a busy machine starves. Each file
(`settings.js`, `trace.js`, `popup.js`; the CSS is inlined) is a separate load the popup has to wait for.
Ideas to test next with this setup:

- Inline the CSS and JS so the popup is one file.
- Paint the shell before the tab state arrives.
- Compare against a popup with no scripts at all, to see how much of the tail is Chrome alone.

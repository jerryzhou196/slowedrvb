# Publishing the slowedrvb extension to the Chrome Web Store

Everything the store asks for is in this repo:

| What | Where |
| --- | --- |
| Upload zip | `npm run zip:extension` → `slowedrvb-extension.zip` |
| Icon (128×128) | `extension/icons/icon128.png` |
| Screenshot (1280×800) | `store/screenshot-1280x800.png` |
| Small promo tile (440×280) | `store/promo-tile-440x280.png` |
| Privacy policy | `https://slowedrvb.com/privacy.html` (deploy the site first) |

## 0. Try it locally first

1. Go to `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and pick the `extension/` folder.
3. Open a YouTube video, click the slowedrvb toolbar icon, then press **slow + reverb this tab**.

## 1. Register as a Chrome Web Store developer (one time)

1. Go to <https://chrome.google.com/webstore/devconsole> and sign in with the Google account that should own the listing.
2. Accept the developer agreement and pay the one-time **$5 registration fee**.
3. Under **Account**, set a publisher display name (for example `slowedrvb`) and verify your contact email. You can't publish until the email is verified.

## 2. Build the zip

```bash
npm run zip:extension
```

This zips the *contents* of `extension/` so that `manifest.json` sits at the root of the zip, which the store requires. Bump `"version"` in `extension/manifest.json` before every new upload.

## 3. Create the item

In the developer console, click **New item** and upload `slowedrvb-extension.zip`. Then fill in each tab.

### Store listing

- **Description** (paste):

  > Slow down any tab and drench it in reverb, like slowedrvb.com but for everything you're already listening to.
  >
  > • drag the playback rate down and the pitch drops like a real slowed record
  > • reverb mix and decay
  > • bass boost
  > • 8D audio (auto-sweep left ↔ right) and 3D pan
  > • works on YouTube, SoundCloud and most sites with an audio or video player
  >
  > Click the icon on a tab, press "slow + reverb this tab", and move the sliders. Settings are remembered. Reload the page to turn it off.
  >
  > Everything runs locally in your browser. No accounts, no tracking.

- **Category:** Entertainment (or Productivity → Tools)
- **Language:** English
- **Store icon:** `extension/icons/icon128.png`
- **Screenshots:** `store/screenshot-1280x800.png` (adding 2–4 more real ones taken on YouTube helps conversion)
- **Small promo tile:** `store/promo-tile-440x280.png`
- **Official URL / homepage:** `https://slowedrvb.com/`
- **Support URL:** `https://github.com/jzhou-otterai/slowedrvb/issues`

### Privacy practices

- **Single purpose:** "Applies slow-down, reverb, bass boost and spatial audio effects to audio and video playing in the current tab."
- **Permission justifications:**
  - `activeTab`: "Gives temporary access to the tab the user opens the popup on, so the effects only apply to that tab."
  - `scripting`: "Injects the audio-effects script into the current tab when the user opens the popup."
  - `storage`: "Remembers the user's slider settings (speed, reverb, bass, etc.) between uses."
- **Remote code:** No, I am not using remote code. (The popup loads a font from Google Fonts. That is a stylesheet, not code.)
- **Data usage:** leave every data type unchecked, then tick all three certifications (no selling, no unrelated use, no creditworthiness use).
- **Privacy policy URL:** `https://slowedrvb.com/privacy.html`

### Distribution

- **Visibility:** Public
- **Regions:** All regions
- **Payments:** Free

## 4. Submit for review

Click **Submit for review**. With only `activeTab` and no broad host permissions, reviews usually finish within a few days. You'll get an email when it's live.

## 5. Point the site banner at the listing

Once it's published, copy the listing URL (`https://chromewebstore.google.com/detail/<slug>/<id>`) and set `CHROME_EXTENSION_URL` near the top of `index.js`. The "add to chrome" banner on slowedrvb.com stays hidden until that constant is set, so it's safe to deploy the site before the listing is approved.

## Updating later

1. Bump `"version"` in `extension/manifest.json`.
2. Run `npm run zip:extension`.
3. In the developer console, open the item → **Package** → **Upload new package** → **Submit for review**.

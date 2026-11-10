# Soundcairn desktop

Electron app for macOS and Windows. The screens are one HTML page (`app/index.html`), shared with the Android app.

```bash
npm install
npm start            # run it
npm test             # helper and donation-config tests
npm run pack         # macOS app in dist/
npm run dist:win     # Windows installer in release/
```

Where it looks for yt-dlp, ffmpeg and ffprobe: `bin/` in this folder, the app's tools folder (shown in Settings), then your PATH.
On macOS, `bin/yt-dlp` can be a small launcher script or the official binary. The Windows build offers to download the tools on first run.

- `main.js` runs yt-dlp, `preload.js` exposes it to the page, `lib.js` builds the commands and parses the output.
- `app/donate.js` holds the support (UPI) details and is protected by `.github/CODEOWNERS`.

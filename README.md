# Notes

A clean, simple tabbed notepad, modeled on Windows Notepad. Installs from the
browser as its own app: no APK, no app store.

**Current version: 2.2.0**

**Open it:** https://aphantomstranger.github.io/Notepad/

## Install on your phone

1. Open the link above in Chrome on your Android phone.
2. Tap ⋮ (Chrome's menu) → **Install app**, or open Notes' own ⋮ menu and tap
   **Install app**.
3. Notes appears on your home screen with the pencil icon and opens full
   screen, like any other app. It works offline.

Updates arrive on their own: the next time you open the app online, it picks up
the latest version. Your notes are never touched by an update.

## Features

- One full-page sheet per tab; **+** opens a new sheet. Tabs are named after
  each sheet's first line.
- ⋮ menu:
  - **Change font size**: Small, Medium (default), Large, Extra large
  - **Delete sheet**: removes the open sheet, after asking
  - **Change color of sheet**: White with black text (default), Black with
    white text, or Lime pastel green with black text
- **Drawing sheets** for handwritten notes: tap the pen button in the top bar.
  - Three pens: super fine, regular, wide. Lines keep an even width.
  - **Eraser** removes any line it touches (a stylus's eraser end works too);
    **Undo** takes back the last line or the last erase.
  - **Invert** (half-circle button) flips between dark ink on a light page and
    light ink on a dark page, per drawing.
  - The page never runs out: scroll past your last line and keep writing.
  - A stylus draws and your finger scrolls. Until the app has seen a stylus, one
    finger draws and two fingers (landing together) scroll.
  - Built for continuous lines on real tablets: a stylus that loses contact for a
    split second carries on the same line, a hand resting on the screen doesn't
    cancel or scroll anything, palm-sized contacts are ignored, and every sample
    the screen reports is used on a low-latency canvas.
  - Ink saves the moment you lift the pen. Delete sheet and Change color of
    sheet work the same as on text sheets.
- Saves on every keystroke. Notes survive the app being swiped away, the phone
  restarting, and going offline.
- Normal copy, cut and paste, to and from other apps.

## Where notes are stored

On the phone, in the browser's storage for this site: text in `localStorage`,
drawings in IndexedDB (one record per stroke). Nothing
is sent anywhere. Uninstalling the app, or clearing Chrome's site data for
`aphantomstranger.github.io`, deletes your notes.

## What's in the repo

| Path | What it is |
| --- | --- |
| `index.html` | the whole app: markup, styles and script |
| `manifest.webmanifest` | app name, icon and colors that make it installable |
| `sw.js` | service worker: offline cache of the app files |
| `icons/` | pencil icon at 192, 512, apple-touch and favicon sizes |
| `pentest.html` | pen test page: shows what the browser receives from a stylus |
| `tests/e2e.js` | browser test suite |

Hosted by GitHub Pages from the root of `main`.

## Releasing a change

1. Edit `index.html`.
2. Bump the version in all three places: `VERSION` in `index.html` (plus its
   changelog comment), `CACHE` in `sw.js`, and the line at the top of this
   README. Changing `CACHE` is what makes installed copies drop the old files.
3. Run the tests, then push to `main`. Pages redeploys within a minute or two.

## Testing

```sh
npm i playwright-core
CHROME=/path/to/chrome node tests/e2e.js
```

106 checks: every-keystroke saving, survival of a killed app and a full browser
restart, tabs, copy/paste, every menu option, drawing (measured ink width per pen,
eraser, undo, contact-blip stitching, stylus vs finger vs palm vs resting hand,
endless scrolling, invert, colors, saving), the pen test page, install readiness,
offline load, and no page errors.

## If ink looks patchy on a device

Open `https://aphantomstranger.github.io/Notepad/pentest.html`, write a few words,
tap **Copy results** and send them along. It reports samples per second, the longest
gap between samples, contact drops, cancelled contacts, pressure and contact size.

## History

Versions 1.x were a native Android app (Kotlin). That project is preserved in the
`v1.0.1` tag and release.

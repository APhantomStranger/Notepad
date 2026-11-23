# Notes — a minimal Android notepad

![Build APK](https://github.com/APhantomStranger/Notepad/actions/workflows/build.yml/badge.svg)

**Current version: 1.0.1**

A clean, single-page-per-tab writing app modeled on Windows 11 Notepad.

## Install on your phone (easiest)

1. On your phone, open the [latest release](https://github.com/APhantomStranger/Notepad/releases/latest).
2. Download `Notes-vX.Y.Z.apk` and tap it. Allow "Install unknown apps" for
   your browser if asked.
3. Future releases install right over the top — your notes are kept, because
   every release is signed with the same key.

## Releasing a new version

1. Bump `versionCode` and `versionName` in `app/build.gradle`.
2. Commit, then tag and push: `git tag v1.0.2 && git push origin main --tags`.
3. GitHub Actions builds the signed APK and attaches it to a new release.

### About signing

APKs are signed with `app/ci-debug.keystore`, a fixed key committed to the
repo on purpose (password `android`). It is **not secret** — its only job is
to keep the signature identical across builds so updates install over the
existing app without wiping your notes.

To switch to a private key later, add these repo secrets under
Settings → Secrets and variables → Actions: `SIGNING_KEYSTORE_BASE64`
(base64 of your .jks), `SIGNING_STORE_PASSWORD`, `SIGNING_KEY_ALIAS`,
`SIGNING_KEY_PASSWORD`. Note: changing keys means uninstalling once
(back up your notes first), since Android won't update across signatures.

## Features

- One writing page per tab, with a **+** button in the top bar to add more.
- Overflow menu (⋮) with:
  - **Change font size** — Small / Medium (default) / Large / Extra large.
  - **Delete sheet** — removes the currently open sheet (with confirmation).
  - **Change color of sheet** — White (default) / Black / Lime pastel green.
- **Auto-save on every keystroke.** Content is written to `SharedPreferences`
  via `apply()`, which flushes to disk asynchronously but is guaranteed to
  complete before the process is killed. Extra saves fire on `onPause()` /
  `onDestroyView()` as a safety net.
- Standard Android text-selection: copy, cut, paste all work out of the box.
- Adaptive launcher icon: a diagonal pencil (yellow body, red eraser,
  black graphite tip) on a pale off-white background.

## Project layout

```
Notepad/
├── settings.gradle              # Root Gradle settings
├── build.gradle                 # Root project build script
├── gradle.properties            # Gradle/JVM options
├── README.md                    # You are here
└── app/
    ├── build.gradle             # App module build script
    ├── proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/example/notepad/
        │   ├── MainActivity.kt       # Toolbar, tabs, + button, menu handlers
        │   ├── NoteFragment.kt       # Single-sheet editor + auto-save
        │   ├── NotesPagerAdapter.kt  # ViewPager2 adapter
        │   └── NotesRepository.kt    # SharedPreferences persistence
        └── res/
            ├── drawable/             # + icon, pencil vector
            ├── layout/               # activity_main, fragment_note
            ├── menu/                 # Overflow menu
            ├── mipmap-*/             # Launcher icons (all densities)
            ├── values/               # strings, colors, themes
            └── xml/                  # Backup rules
```

## Build & install on your phone

You'll need **Android Studio** (Ladybug or newer works fine). Free download:
https://developer.android.com/studio

1. **Open the project.** File → Open → point at the `Notepad/` folder.
2. **Let Gradle sync.** First sync will download the Gradle wrapper, the
   Android build tools, and the dependencies listed in `app/build.gradle`.
   This takes a few minutes on first run.
3. **Enable USB debugging on your phone.**
   Settings → About phone → tap "Build number" 7 times → back out to
   Settings → System → Developer options → toggle **USB debugging** on.
4. **Plug in your phone** with a USB cable. Accept the "Allow USB debugging?"
   prompt on the device.
5. **Run.** Click the green ▶ Run button in Android Studio, pick your phone
   from the deployment target dropdown, and hit OK. Android Studio will
   build the APK, install it, and launch it.

### If you'd rather sideload an APK

After a successful build, the debug APK lives at:

```
app/build/outputs/apk/debug/app-debug.apk
```

Copy that to your phone, tap it in a file manager, and confirm "Install from
unknown sources". No signing setup required for a debug build.

## Notes on the design

- **Why SharedPreferences and not Room?** Notes are just strings keyed by a
  sheet UUID; there's no relational structure worth a database. Prefs are
  fast, transactional, and survive `kill -9`.
- **Why `apply()` and not `commit()`?** `apply()` writes on a background
  thread and won't stutter the UI while you type. Android holds the write
  lock across process death, so nothing is lost.
- **Kotlin 1.9 + AGP 8.2 + minSdk 24 + targetSdk 34.** Runs on Android 7.0
  and up. If your phone is older than that, lower `minSdk` in
  `app/build.gradle`.

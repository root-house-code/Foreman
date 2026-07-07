# Foreman — Android app

The native Android shell around the same renderer the desktop app runs. This is
to the phone what `electron/` is to Windows: the 21 pages, the store, the data
model, and the design system all come from the shared `dist/` bundle, and the
shell provides the platform integration around it.

## Architecture

Every file here has a direct desktop counterpart:

| Android | Desktop (Electron) | Role |
| --- | --- | --- |
| `MainActivity.kt` | `electron/main.cjs` | Shell: window, mode lifecycle, deep links, notifications, dialogs |
| `ForemanBridge.kt` + `assets/foreman-bridge.js` | `electron/preload.cjs` | The `window.foreman` renderer↔native API |
| `StorageStore.kt` | `electron/storageFile.cjs` + the store half of `main.cjs` | Authoritative in-memory store, per-key delta merges, atomic `data.json`/`images.json` writes, tiered backups |

The renderer detects the backend exactly as it does on desktop: the bridge sets
`window.foreman.hasNativeStorage`, which `lib/storage.js` treats like
`isElectron` — synchronous cache hydration at boot, per-key `{ updates, deletes }`
deltas on write. No web code forked; the seam is three small additions
(`lib/storage.js` detection, the service-worker guard in `src/main.jsx`, and the
"This Phone" card in `preferences-page.jsx`).

## Two modes

Chosen on first launch, switchable anytime in **Preferences → Integrations →
This Phone** (which calls back into the native chooser):

- **Standalone** — full Foreman on the phone. The SPA loads from APK assets via
  `WebViewAssetLoader`; data lives in
  `Android/data/com.foreman.app/files/Foreman/` as `data.json` + `images.json`
  with the same atomic temp+rename writes and hourly/daily/weekly backup
  retention as `Documents\Foreman` on Windows.
- **Connected** — the phone is a live window into the desktop host
  (hub-and-spoke, one source of truth). Tap "Paired with your desktop", scan
  the QR from the desktop's Preferences → Multi-Device Sharing, and the WebView
  loads the host URL; the SPA's own remote mode (SSE live updates, per-key
  delta writes) takes over unchanged. If the host is unreachable, a native
  screen says so honestly and offers retry / re-scan / standalone.

## Desktop parity map

| Desktop capability | Android equivalent |
| --- | --- |
| File storage + rolling backups | `StorageStore.kt` (standalone mode) |
| Export / import via native dialogs | Storage Access Framework, same `showSaveDialog`/`showOpenDialog`/`writeFile`/`readFile` promise shapes |
| OS notifications | Notification channel + runtime permission (API 33+) |
| `foreman://` deep links | `intent-filter`, delivered through the same `onDeepLink` callback |
| System tray | n/a — Android lifecycle; the store flushes on `onStop` so process death can't lose the debounce window |
| LAN **hosting** | Desktop-only by design (the phone is never the hub) |

Not ported (desktop doesn't have them either — both roadmap): item-level deep
links, auto-update.

## Building

```
npm run build          # repo root — produces dist/, which gets bundled into the APK
cd android
gradlew assembleDebug  # or open android/ in Android Studio
```

APK lands at `app/build/outputs/apk/debug/app-debug.apk`. Requires JDK 17 and
the Android SDK (platform 35); `local.properties` points at the SDK and is
machine-local. The `copyWebAssets` Gradle task syncs `../dist` into
`app/src/main/assets/www/` before every build and fails loudly if `dist/` is
missing.

Release builds are debug-signed for now (`signingConfig` in
`app/build.gradle.kts`) — swap in a real keystore before store distribution.

## Notes & known constraints

- **Cleartext HTTP** is enabled app-wide because connected mode talks to the
  desktop host over plain LAN HTTP (`http://192.168.x.x:8417`), the same as a
  phone browser today. Internet integrations (Groq, Nominatim, Discord worker)
  are HTTPS.
- **Reminders worker CORS**: standalone mode's origin is
  `https://appassets.androidplatform.net` — add it to `FOREMAN_ALLOWED_ORIGINS`
  in `worker/wrangler.toml` if you want Discord sync from a standalone phone.
- **Photos** attach through the system file picker (WebView
  `onShowFileChooser`); direct-to-camera capture is part of the roadmap's
  camera-first workflows, not v1.
- **Stale pairing**: if the desktop regenerates its pairing code, the SPA shows
  its pairing-required screen; re-scan via Preferences → This Phone (or the
  native error screen if the host is unreachable).
- Google Fonts load over the network as on desktop; offline standalone falls
  back to system fonts.

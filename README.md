# BEST4K Studio

Premium Windows desktop streaming studio. Electron + React + TypeScript with a real Node backend (SQLite, FFmpeg supervision, SSH/MediaMTX provisioning).

## Implemented (Phase 1 + 2)

- ✅ Project scaffold (Electron 32, Vite 5, React 18, TypeScript 5)
- ✅ SQLite schema + repositories (channels, servers, profiles, logs, settings)
- ✅ Secure secret storage (Electron `safeStorage` with AES-256-GCM fallback)
- ✅ FFmpeg command builder (HLS / RTMP push / MPEG-TS UDP, copy + transcode, headers, reconnect, live edge)
- ✅ Process supervisor: argv-array spawn, auto-restart with backoff, failover URL rotation, fps/bitrate parsing, log streaming
- ✅ Premium dark UI (black / gold / blue), 8 pages: Dashboard, Channels, Add-Channel Wizard (8 tabs), Servers, Profiles, Monitor, Logs, Settings
- ✅ SSH server manager: connection test, MediaMTX install script over SSH (RTMP 1935, HLS 8888, ufw rules)
- ✅ ClearKey paste parser (kid:key, kid=key, JSON `keys` arrays)
- ✅ GitHub Actions workflow that produces an NSIS installer on `windows-latest`

## Phase 3+ (config-only placeholders, clearly disabled)

- Logo overlay & blur boxes (config exists, runtime in Phase 5)
- Widevine / PlayReady (license URL + headers stored, runtime delivered later)
- Auto-updater (toggle visible, disabled until wired)

## Develop

```bash
npm install
npm run dev    # starts Vite (5173) + Electron main
```

## Build

```bash
npm run build           # compiles renderer + main + preload
npm run dist:win        # NSIS installer in release/ (run on Windows)
```

## Cross-platform note

You can develop on macOS, but the Windows installer must be built on Windows.
The included GitHub Actions workflow runs on `windows-latest` and uploads the `.exe` artifact (and creates a GitHub Release on tag pushes like `v0.1.0`).

## FFmpeg

The app looks for FFmpeg in this order:
1. Settings path (set via the Settings page)
2. Bundled `resources/ffmpeg/ffmpeg(.exe)` (drop a static build here for fully offline installs)
3. System `PATH`

## Security

- Renderer is sandboxed; no Node integration. All privileged work happens in main via typed IPC.
- FFmpeg is spawned with an argv array (no shell), so user-supplied URLs/headers cannot inject commands.
- Secrets (passwords, private keys, cookies) are encrypted at rest and masked in logs.
- Strict CSP in `index.html`.

## Project layout

```
src/
  main/          # Electron main: db, ffmpeg, processes, ssh, security
  preload/       # contextBridge bridge
  renderer/      # React UI
  shared/        # types, schemas, IPC contract
.github/workflows/build-windows.yml
```

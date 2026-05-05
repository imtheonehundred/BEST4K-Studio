# Build resources

Place a Windows app icon at `build/icon.ico` (256x256, multi-size ICO recommended).
electron-builder uses this for the installer and the bundled .exe.

If absent, electron-builder falls back to a default Electron icon — the app will still build and run.

# Installing BEST4K Studio on Windows

There are now **two downloads** in every release:

| File | Use this when… |
|---|---|
| `BEST4K-Studio-0.1.0-x64.exe` | normal install (Start Menu shortcut, uninstaller) |
| `BEST4K-Studio-0.1.0-x64.zip` | portable — unzip and run `BEST4K Studio.exe` directly |

## "Smart App Control blocked an app that may be unsafe"

This appears on Windows 11 machines where **Smart App Control (SAC)** is enabled (it's separate from regular SmartScreen).

The installer is unsigned because we don't yet ship a paid Authenticode certificate. You have three choices:

### Option 1 — Use the portable `.zip` (try this first)
1. Download `BEST4K-Studio-…-x64.zip`.
2. Right-click the zip → **Properties** → tick **Unblock** at the bottom → **OK**.
3. Extract the zip.
4. Double-click `BEST4K Studio.exe`.

If you still get blocked, continue to Option 2.

### Option 2 — Disable Smart App Control
> **One-way switch.** Once Smart App Control is off, Microsoft only re-enables it after a clean Windows reinstall. Regular SmartScreen still runs and protects you.

1. **Windows Security** → **App & browser control** → **Smart App Control settings**.
2. Switch to **Off**. Confirm.
3. Re-run the installer. SmartScreen will warn — click **More info** → **Run anyway**.

### Option 3 — Wait for a signed build
We're working toward a signed release. When the project ships with an Authenticode signature, this dialog goes away automatically and you won't have to do anything.

## Regular SmartScreen warning (no SAC)

If you don't have Smart App Control, you'll see a different blue dialog:
> *Windows protected your PC.*

Click **More info** → **Run anyway**. That's it.

## After installing

- App data and SQLite DB live at `%APPDATA%\BEST4K Studio\`.
- Default stream output folder is `%APPDATA%\BEST4K Studio\streams\` (changeable in Settings).
- FFmpeg is auto-detected from `PATH`. Set a custom path in **Settings → FFmpeg**.

// Auto-update wiring via electron-updater. We intentionally:
//  - never auto-download or auto-install (always ask the user)
//  - refuse to download/install while any channel is running (per spec)
//  - publish via GitHub Releases (provider inferred from package.json)

import { autoUpdater, UpdateInfo } from 'electron-updater';
import { BrowserWindow } from 'electron';
import { IPC } from '../../shared/ipc';
import { supervisor } from '../processes/supervisor';
import { logsRepo } from '../database/repositories';

let initialized = false;

function broadcast(payload: any) {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.eventUpdater, payload);
}

function anyChannelRunning(): boolean {
  return supervisor.list().some(s => s.status === 'running' || s.status === 'starting' || s.status === 'reconnecting');
}

export function initUpdater() {
  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('checking-for-update', () => broadcast({ type: 'checking' }));
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    logsRepo.insert(null, 'info', `Update available: ${info.version}`);
    broadcast({ type: 'available', version: info.version, releaseNotes: info.releaseNotes });
  });
  autoUpdater.on('update-not-available', () => broadcast({ type: 'none' }));
  autoUpdater.on('error', (e) => {
    logsRepo.insert(null, 'warn', `Updater error: ${e.message}`);
    broadcast({ type: 'error', message: e.message });
  });
  autoUpdater.on('download-progress', p => broadcast({ type: 'progress', percent: p.percent, bytesPerSecond: p.bytesPerSecond }));
  autoUpdater.on('update-downloaded', info => {
    logsRepo.insert(null, 'info', `Update downloaded: ${info.version}`);
    broadcast({ type: 'downloaded', version: info.version });
  });

  // Silent check 5s after start, then every 6h.
  setTimeout(() => { void check(); }, 5000);
  setInterval(() => { void check(); }, 6 * 60 * 60 * 1000);
}

export async function check() {
  try { return await autoUpdater.checkForUpdates(); }
  catch { return null; }
}

export async function download() {
  if (anyChannelRunning()) {
    return { ok: false, message: 'Stop all running channels before downloading the update.' };
  }
  try { await autoUpdater.downloadUpdate(); return { ok: true }; }
  catch (e: any) { return { ok: false, message: e?.message || String(e) }; }
}

export function install() {
  if (anyChannelRunning()) {
    return { ok: false, message: 'Stop all running channels before installing the update.' };
  }
  // isSilent=true, isForceRunAfter=true
  setTimeout(() => autoUpdater.quitAndInstall(true, true), 200);
  return { ok: true };
}

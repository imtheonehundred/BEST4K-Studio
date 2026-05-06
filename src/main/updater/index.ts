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
    // Truncate aggressively — electron-updater inlines the entire upstream
    // response body (HTML 404 page on missing release, 1KB+ XML, etc.) into
    // its Error.message, which floods the log table and makes the Logs and
    // Monitor pages unreadable. Keep just the headline.
    const raw = (e?.message || String(e)).split('\n')[0].trim();
    const short = raw.length > 200 ? raw.slice(0, 200) + '…' : raw;
    // Demote to debug so it doesn't appear in default log views — there is
    // nothing actionable for the user when the latest.yml isn't published yet.
    logsRepo.insert(null, 'debug', `Updater: ${short}`);
    broadcast({ type: 'error', message: short });
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

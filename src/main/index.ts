import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import os from 'node:os';
import { getDb } from './database';
import { channelsRepo, serversRepo, profilesRepo, logsRepo, settingsRepo } from './database/repositories';
import { ChannelInputSchema, ServerInputSchema } from '../shared/schemas';
import { IPC } from '../shared/ipc';
import { supervisor } from './processes/supervisor';
import { locateFfmpeg, probeFfmpegVersion } from './ffmpeg/locate';
import { testConnection, installMediaMtx, rtmpPublishUrl, hlsPlaybackUrl } from './ssh/client';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#0b0d12',
    title: 'BEST4K Studio',
    autoHideMenuBar: true,
    icon: process.platform === 'linux'
      ? path.join(process.resourcesPath || '', 'icon.png')
      : undefined,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

function broadcast(channel: string, payload: any) {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, payload);
  }
}

function wireSupervisorEvents() {
  supervisor.on('status', (e: any) => broadcast(IPC.eventChannelStatus, e));
  supervisor.on('log', (e: any) => broadcast(IPC.eventLog, e));
  supervisor.on('stats', (e: any) => broadcast(IPC.eventStats, e));
}

function registerIpc() {
  // Channels CRUD
  ipcMain.handle(IPC.channelsList, () => channelsRepo.list());
  ipcMain.handle(IPC.channelsGet, (_e, id: number) => channelsRepo.get(id));
  ipcMain.handle(IPC.channelsCreate, (_e, input) => {
    const parsed = ChannelInputSchema.parse(input);
    return channelsRepo.create(parsed as any);
  });
  ipcMain.handle(IPC.channelsUpdate, (_e, id: number, patch) => {
    return channelsRepo.update(id, patch);
  });
  ipcMain.handle(IPC.channelsDelete, (_e, id: number) => {
    supervisor.stop(id);
    channelsRepo.delete(id);
    return true;
  });
  ipcMain.handle(IPC.channelsDuplicate, (_e, id: number) => channelsRepo.duplicate(id));

  // Channels runtime
  ipcMain.handle(IPC.channelsStart, (_e, id: number) => {
    const c = channelsRepo.get(id);
    if (!c) throw new Error('Channel not found');
    return supervisor.start(c);
  });
  ipcMain.handle(IPC.channelsStop, (_e, id: number) => { supervisor.stop(id); return true; });
  ipcMain.handle(IPC.channelsStats, (_e, id: number) => supervisor.get(id));
  ipcMain.handle(IPC.channelsStatsAll, () => supervisor.list());

  // Servers
  ipcMain.handle(IPC.serversList, () => serversRepo.list().map(s => ({
    ...s, password: s.password ? '••••••' : undefined, privateKey: s.privateKey ? '(loaded)' : undefined,
  })));
  ipcMain.handle(IPC.serversCreate, (_e, input) => serversRepo.create(ServerInputSchema.parse(input) as any));
  ipcMain.handle(IPC.serversUpdate, (_e, id: number, patch) => serversRepo.update(id, patch));
  ipcMain.handle(IPC.serversDelete, (_e, id: number) => { serversRepo.delete(id); return true; });
  ipcMain.handle(IPC.serversTest, async (_e, id: number) => {
    const s = serversRepo.get(id);
    if (!s) throw new Error('Server not found');
    return testConnection(s);
  });
  ipcMain.handle(IPC.serversInstallMediaMtx, async (_e, id: number) => {
    const s = serversRepo.get(id);
    if (!s) throw new Error('Server not found');
    const r = await installMediaMtx(s);
    if (r.ok) serversRepo.setInstalled(id, true);
    return { ...r, rtmpPublishExample: rtmpPublishUrl(s, 'channel_slug'), hlsPlaybackExample: hlsPlaybackUrl(s, 'channel_slug') };
  });

  // Profiles
  ipcMain.handle(IPC.profilesList, () => profilesRepo.list());
  ipcMain.handle(IPC.profilesCreate, (_e, p) => profilesRepo.create(p));
  ipcMain.handle(IPC.profilesUpdate, (_e, id: number, p) => profilesRepo.update(id, p));
  ipcMain.handle(IPC.profilesDelete, (_e, id: number) => { profilesRepo.delete(id); return true; });

  // Logs
  ipcMain.handle(IPC.logsList, (_e, opts) => logsRepo.list(opts || {}));
  ipcMain.handle(IPC.logsClear, (_e, channelId?: number) => { logsRepo.clear(channelId); return true; });

  // Settings
  ipcMain.handle(IPC.settingsGet, () => settingsRepo.getAll());
  ipcMain.handle(IPC.settingsUpdate, (_e, patch) => settingsRepo.update(patch));

  // FFmpeg
  ipcMain.handle(IPC.ffmpegLocate, () => {
    const p = locateFfmpeg();
    return { path: p, version: p ? probeFfmpegVersion(p) : null };
  });
  ipcMain.handle(IPC.ffmpegSetPath, (_e, p: string) => settingsRepo.update({ ffmpegPath: p || null }));

  // System
  ipcMain.handle(IPC.systemPickFolder, async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle(IPC.systemPickFile, async (_e, filters?: Electron.FileFilter[]) => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'], filters });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle(IPC.systemOpenPath, (_e, p: string) => shell.openPath(p));
  ipcMain.handle(IPC.systemStats, () => ({
    platform: process.platform,
    arch: process.arch,
    cpus: os.cpus().length,
    totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
    freeMemMB: Math.round(os.freemem() / 1024 / 1024),
    loadAvg: os.loadavg ? os.loadavg() : [0, 0, 0],
    uptimeSec: Math.round(os.uptime()),
  }));
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.whenReady().then(() => {
  getDb(); // ensure schema migrated before anything else.
  registerIpc();
  wireSupervisorEvents();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  supervisor.stopAll();
});

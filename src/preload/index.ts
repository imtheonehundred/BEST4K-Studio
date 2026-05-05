import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';

const invoke = <T = any>(ch: string, ...args: any[]) => ipcRenderer.invoke(ch, ...args) as Promise<T>;

const api = {
  channels: {
    list: () => invoke(IPC.channelsList),
    get: (id: number) => invoke(IPC.channelsGet, id),
    create: (input: any) => invoke(IPC.channelsCreate, input),
    update: (id: number, patch: any) => invoke(IPC.channelsUpdate, id, patch),
    delete: (id: number) => invoke(IPC.channelsDelete, id),
    duplicate: (id: number) => invoke(IPC.channelsDuplicate, id),
    start: (id: number) => invoke(IPC.channelsStart, id),
    stop: (id: number) => invoke(IPC.channelsStop, id),
    stats: (id: number) => invoke(IPC.channelsStats, id),
    statsAll: () => invoke(IPC.channelsStatsAll),
  },
  servers: {
    list: () => invoke(IPC.serversList),
    create: (input: any) => invoke(IPC.serversCreate, input),
    update: (id: number, patch: any) => invoke(IPC.serversUpdate, id, patch),
    delete: (id: number) => invoke(IPC.serversDelete, id),
    test: (id: number) => invoke(IPC.serversTest, id),
    installMediaMtx: (id: number) => invoke(IPC.serversInstallMediaMtx, id),
  },
  profiles: {
    list: () => invoke(IPC.profilesList),
    create: (p: any) => invoke(IPC.profilesCreate, p),
    update: (id: number, p: any) => invoke(IPC.profilesUpdate, id, p),
    delete: (id: number) => invoke(IPC.profilesDelete, id),
  },
  logs: {
    list: (opts?: any) => invoke(IPC.logsList, opts),
    clear: (channelId?: number) => invoke(IPC.logsClear, channelId),
  },
  settings: {
    get: () => invoke(IPC.settingsGet),
    update: (patch: any) => invoke(IPC.settingsUpdate, patch),
  },
  ffmpeg: {
    locate: () => invoke(IPC.ffmpegLocate),
    setPath: (p: string) => invoke(IPC.ffmpegSetPath, p),
  },
  system: {
    pickFolder: () => invoke(IPC.systemPickFolder),
    pickFile: (filters?: any) => invoke(IPC.systemPickFile, filters),
    openPath: (p: string) => invoke(IPC.systemOpenPath, p),
    stats: () => invoke(IPC.systemStats),
  },
  on: (channel: 'channelStatus' | 'log' | 'stats', cb: (payload: any) => void) => {
    const map = {
      channelStatus: IPC.eventChannelStatus,
      log: IPC.eventLog,
      stats: IPC.eventStats,
    } as const;
    const handler = (_: any, payload: any) => cb(payload);
    ipcRenderer.on(map[channel], handler);
    return () => { ipcRenderer.removeListener(map[channel], handler); };
  },
};

contextBridge.exposeInMainWorld('api', api);

export type B4kApi = typeof api;

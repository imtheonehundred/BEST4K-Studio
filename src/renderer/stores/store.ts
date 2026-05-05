import { create } from 'zustand';
import type { Channel, ChannelRuntimeStats, Server, Profile, AppSettings, LogEntry } from '@shared/types';

interface State {
  channels: Channel[];
  servers: Server[];
  profiles: Profile[];
  settings: AppSettings | null;
  stats: Record<number, ChannelRuntimeStats>;
  logs: LogEntry[];
  ffmpegInfo: { path: string | null; version: string | null } | null;

  refreshChannels: () => Promise<void>;
  refreshServers: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshStats: () => Promise<void>;
  refreshFfmpeg: () => Promise<void>;
  refreshLogs: (channelId?: number, search?: string) => Promise<void>;

  applyStatusEvent: (e: { channelId: number; status: Channel['status'] }) => void;
  applyStatsEvent: (e: ChannelRuntimeStats) => void;
  applyLogEvent: (e: LogEntry) => void;
}

export const useStore = create<State>((set, get) => ({
  channels: [],
  servers: [],
  profiles: [],
  settings: null,
  stats: {},
  logs: [],
  ffmpegInfo: null,

  refreshChannels: async () => set({ channels: await window.api.channels.list() }),
  refreshServers: async () => set({ servers: await window.api.servers.list() }),
  refreshProfiles: async () => set({ profiles: await window.api.profiles.list() }),
  refreshSettings: async () => set({ settings: await window.api.settings.get() }),
  refreshFfmpeg: async () => set({ ffmpegInfo: await window.api.ffmpeg.locate() }),
  refreshStats: async () => {
    const all = await window.api.channels.statsAll();
    const map: Record<number, ChannelRuntimeStats> = {};
    for (const s of all) map[s.channelId] = s;
    set({ stats: map });
  },
  refreshLogs: async (channelId, search) => {
    const logs = await window.api.logs.list({ channelId, search, limit: 500 });
    set({ logs });
  },

  applyStatusEvent: (e) => {
    set(state => ({
      channels: state.channels.map(c => c.id === e.channelId ? { ...c, status: e.status } : c),
    }));
  },
  applyStatsEvent: (e) => {
    set(state => ({ stats: { ...state.stats, [e.channelId]: e } }));
  },
  applyLogEvent: (e) => {
    set(state => ({ logs: [e, ...state.logs].slice(0, 500) }));
  },
}));

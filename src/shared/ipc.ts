// Centralized IPC channel names. Both main and preload import from here.
export const IPC = {
  // Channels CRUD
  channelsList: 'channels:list',
  channelsGet: 'channels:get',
  channelsCreate: 'channels:create',
  channelsUpdate: 'channels:update',
  channelsDelete: 'channels:delete',
  channelsDuplicate: 'channels:duplicate',
  // Channels runtime
  channelsStart: 'channels:start',
  channelsStop: 'channels:stop',
  channelsStats: 'channels:stats',
  channelsStatsAll: 'channels:stats:all',
  // Servers
  serversList: 'servers:list',
  serversCreate: 'servers:create',
  serversUpdate: 'servers:update',
  serversDelete: 'servers:delete',
  serversTest: 'servers:test',
  serversInstallMediaMtx: 'servers:installMediaMtx',
  // Profiles
  profilesList: 'profiles:list',
  profilesCreate: 'profiles:create',
  profilesUpdate: 'profiles:update',
  profilesDelete: 'profiles:delete',
  // Logs
  logsList: 'logs:list',
  logsClear: 'logs:clear',
  // Settings
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  // FFmpeg
  ffmpegLocate: 'ffmpeg:locate',
  ffmpegSetPath: 'ffmpeg:setPath',
  ffmpegProbe: 'ffmpeg:probe',
  ffmpegEncoders: 'ffmpeg:encoders',
  ffmpegDownload: 'ffmpeg:download',
  ffmpegDownloadStatus: 'ffmpeg:download:status',
  eventFfmpegDownload: 'event:ffmpeg:download',
  // Updater
  updaterCheck: 'updater:check',
  updaterDownload: 'updater:download',
  updaterInstall: 'updater:install',
  eventUpdater: 'event:updater',
  // System
  systemPickFolder: 'system:pickFolder',
  systemPickFile: 'system:pickFile',
  systemOpenPath: 'system:openPath',
  systemOpenExternal: 'system:openExternal',
  systemStats: 'system:stats',
  // Events from main → renderer
  eventChannelStatus: 'event:channelStatus',
  eventLog: 'event:log',
  eventStats: 'event:stats',
} as const;

export type IpcChannel = typeof IPC[keyof typeof IPC];

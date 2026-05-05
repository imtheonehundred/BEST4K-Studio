// Shared types used across main and renderer.

export type InputType = 'hls' | 'mpegts' | 'rtmp' | 'rtsp' | 'mp4' | 'dash';

export type OutputMode = 'hls_local' | 'rtmp_push' | 'mpegts_local';

export type ChannelStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'reconnecting'
  | 'error';

export type DrmKind = 'none' | 'clearkey' | 'widevine' | 'playready';

export interface ChannelHeaders {
  userAgent?: string;
  referer?: string;
  origin?: string;
  cookie?: string;
  authorization?: string;
  custom?: Record<string, string>;
}

export interface ClearKeyPair {
  kid: string;
  key: string;
}

export interface DrmConfig {
  kind: DrmKind;
  clearkey?: ClearKeyPair[];
  // widevine/playready: user-supplied authorized config only.
  // `keys` accepts raw KID:KEY pairs the user is authorized to hold (e.g.
  // from their own license server). They are passed to FFmpeg as CENC keys.
  // `licenseUrl` + `headers` are stored for Phase 5 runtime license fetch.
  widevine?: { licenseUrl?: string; headers?: Record<string, string>; keys?: ClearKeyPair[] };
  playready?: { licenseUrl?: string; headers?: Record<string, string>; keys?: ClearKeyPair[] };
}

export interface ProcessingOptions {
  mode: 'copy' | 'transcode';
  scale?: '720p' | '480p' | 'source';
  videoBitrate?: string; // e.g. "2500k"
  audioBitrate?: string; // e.g. "128k"
  encoder?: 'auto' | 'libx264' | 'h264_nvenc' | 'h264_qsv' | 'h264_amf';
  logoOverlayPath?: string;
  textWatermark?: string;
  blurBox?: { x: number; y: number; w: number; h: number } | null;
  // Track index selection (mainly for multi-track DRM content where each
  // track has a different KID — pick the one whose KEY you possess).
  videoTrackIndex?: number | null;
  audioTrackIndex?: number | null;
  subtitleTrackIndex?: number | null; // -1 disables subs
}

export interface OutputOptions {
  mode: OutputMode;
  // hls_local
  hlsTime?: number;
  hlsListSize?: number;
  outputFolder?: string;
  // rtmp_push
  rtmpUrl?: string;
  rtmpKey?: string;
  // mpegts_local
  mpegtsPort?: number;
}

export interface Channel {
  id: number;
  slug: string;
  name: string;
  inputType: InputType;
  inputUrl: string;
  failoverUrls?: string[];
  headers?: ChannelHeaders;
  drm?: DrmConfig;
  processing: ProcessingOptions;
  output: OutputOptions;
  serverId?: number | null;
  status: ChannelStatus;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelInput {
  slug: string;
  name: string;
  inputType: InputType;
  inputUrl: string;
  failoverUrls?: string[];
  headers?: ChannelHeaders;
  drm?: DrmConfig;
  processing: ProcessingOptions;
  output: OutputOptions;
  serverId?: number | null;
}

export interface Server {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: 'password' | 'key';
  password?: string; // encrypted at rest
  privateKey?: string; // encrypted at rest
  domain?: string | null;
  installed: boolean;
  createdAt: string;
}

export interface ServerInput {
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: 'password' | 'key';
  password?: string;
  privateKey?: string;
  domain?: string | null;
}

export interface Profile {
  id: number;
  name: string;
  description: string;
  config: ProcessingOptions & { outputMode?: OutputMode };
  builtin: boolean;
}

export interface LogEntry {
  id: number;
  channelId: number | null;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  ts: string;
}

export interface AppSettings {
  ffmpegPath: string | null;
  defaultOutputFolder: string;
  theme: 'dark' | 'light';
  autoUpdate: boolean;
  maskSecrets: boolean;
}

export interface ChannelRuntimeStats {
  channelId: number;
  status: ChannelStatus;
  pid?: number;
  startedAt?: string;
  uptimeMs?: number;
  reconnectCount: number;
  lastBitrateKbps?: number;
  lastFps?: number;
  lastError?: string | null;
  generatedLinks?: { hls?: string; rtmp?: string; ts?: string };
}

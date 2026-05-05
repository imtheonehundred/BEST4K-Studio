import { z } from 'zod';

export const ClearKeyPairSchema = z.object({
  kid: z.string().regex(/^[0-9a-fA-F]{32}$/, 'KID must be 32 hex chars'),
  key: z.string().regex(/^[0-9a-fA-F]{32}$/, 'KEY must be 32 hex chars'),
});

export const HeadersSchema = z.object({
  userAgent: z.string().optional(),
  referer: z.string().optional(),
  origin: z.string().optional(),
  cookie: z.string().optional(),
  authorization: z.string().optional(),
  custom: z.record(z.string()).optional(),
});

export const DrmConfigSchema = z.object({
  kind: z.enum(['none', 'clearkey', 'widevine', 'playready']),
  clearkey: z.array(ClearKeyPairSchema).optional(),
  widevine: z.object({
    licenseUrl: z.string().url().optional(),
    headers: z.record(z.string()).optional(),
  }).optional(),
  playready: z.object({
    licenseUrl: z.string().url().optional(),
    headers: z.record(z.string()).optional(),
  }).optional(),
});

export const ProcessingSchema = z.object({
  mode: z.enum(['copy', 'transcode']),
  scale: z.enum(['720p', '480p', 'source']).optional(),
  videoBitrate: z.string().optional(),
  audioBitrate: z.string().optional(),
  encoder: z.enum(['auto', 'libx264', 'h264_nvenc', 'h264_qsv', 'h264_amf']).optional(),
  logoOverlayPath: z.string().optional(),
  textWatermark: z.string().optional(),
  blurBox: z.object({
    x: z.number(), y: z.number(), w: z.number(), h: z.number(),
  }).nullable().optional(),
});

export const OutputSchema = z.object({
  mode: z.enum(['hls_local', 'rtmp_push', 'mpegts_local']),
  hlsTime: z.number().int().positive().optional(),
  hlsListSize: z.number().int().positive().optional(),
  outputFolder: z.string().optional(),
  rtmpUrl: z.string().optional(),
  rtmpKey: z.string().optional(),
  mpegtsPort: z.number().int().min(1024).max(65535).optional(),
});

export const ChannelInputSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,40}$/i, 'slug must be alphanumeric, 2-41 chars'),
  name: z.string().min(1).max(120),
  inputType: z.enum(['hls', 'mpegts', 'rtmp', 'rtsp', 'mp4', 'dash']),
  inputUrl: z.string().min(3),
  failoverUrls: z.array(z.string()).optional(),
  headers: HeadersSchema.optional(),
  drm: DrmConfigSchema.optional(),
  processing: ProcessingSchema,
  output: OutputSchema,
  serverId: z.number().int().nullable().optional(),
});

export const ServerInputSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1),
  authMethod: z.enum(['password', 'key']),
  password: z.string().optional(),
  privateKey: z.string().optional(),
  domain: z.string().nullable().optional(),
});

export type ChannelInputT = z.infer<typeof ChannelInputSchema>;
export type ServerInputT = z.infer<typeof ServerInputSchema>;

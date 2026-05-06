// Build a sanitized FFmpeg argv array from a Channel definition.
// We never use the shell; the Supervisor spawns argv directly.

import type { Channel, ChannelHeaders } from '../../shared/types';
import path from 'node:path';
import fs from 'node:fs';
import { detectCapabilities } from './encoders';
import { getLocalHlsUrl, getLocalTsUrl } from '../server/localServer';

export interface BuiltCommand {
  args: string[];
  outputDir?: string;
  generatedLinks: { hls?: string; rtmp?: string; ts?: string };
}

const HLS_LIVE_INPUT_OPTS = [
  '-live_start_index', '-3',
  '-reconnect', '1',
  '-reconnect_streamed', '1',
  '-reconnect_at_eof', '1',
  '-reconnect_delay_max', '5',
  '-reconnect_on_http_error', '4xx,5xx',
  '-multiple_requests', '1',
  '-rw_timeout', '8000000',
  '-fflags', '+genpts+discardcorrupt+nobuffer',
  '-avoid_negative_ts', 'make_zero',
];

const DASH_LIVE_INPUT_OPTS = [
  '-reconnect', '1',
  '-reconnect_streamed', '1',
  '-reconnect_at_eof', '1',
  '-reconnect_delay_max', '5',
  '-reconnect_on_http_error', '4xx,5xx',
  '-multiple_requests', '1',
  '-rw_timeout', '8000000',
  '-fflags', '+genpts+discardcorrupt+nobuffer',
  '-avoid_negative_ts', 'make_zero',
];

const RECONNECT_OPTS = [
  '-reconnect', '1',
  '-reconnect_streamed', '1',
  '-reconnect_delay_max', '5',
  '-reconnect_on_http_error', '4xx,5xx',
  '-fflags', '+genpts+discardcorrupt',
];

function buildHeadersString(h?: ChannelHeaders): string | undefined {
  if (!h) return undefined;
  const lines: string[] = [];
  if (h.referer) lines.push(`Referer: ${h.referer}`);
  if (h.origin) lines.push(`Origin: ${h.origin}`);
  if (h.cookie) lines.push(`Cookie: ${h.cookie}`);
  if (h.authorization) lines.push(`Authorization: ${h.authorization}`);
  if (h.custom) for (const [k, v] of Object.entries(h.custom)) lines.push(`${k}: ${v}`);
  if (!lines.length) return undefined;
  return lines.join('\r\n') + '\r\n';
}

function inputProtocolOpts(c: Channel): string[] {
  const args: string[] = [];
  const h = c.headers;
  if (h?.userAgent) args.push('-user_agent', h.userAgent);
  const hdr = buildHeadersString(h);
  if (hdr) args.push('-headers', hdr);

  // Protocol whitelist: HLS needs `crypto` so AES-128 key URIs decrypt;
  // covering the common protocols used by manifests/segments.
  if (c.inputType === 'hls' || c.inputType === 'mp4') {
    args.push('-protocol_whitelist', 'file,http,https,tcp,tls,crypto,rtmp,rtp,udp');
  }
  // DASH demuxer: allow any segment extension (m4s, mp4, etc.) and accept
  // remote segments. Without this, segment loads silently fail.
  if (c.inputType === 'dash') {
    args.push('-allowed_extensions', 'ALL');
    // Some downstream builds support these for live edge tracking.
    args.push('-protocol_whitelist', 'file,http,https,tcp,tls,crypto');
  }

  if (c.inputType === 'hls') args.push(...HLS_LIVE_INPUT_OPTS);
  else if (c.inputType === 'dash') args.push(...DASH_LIVE_INPUT_OPTS);
  else if (['mpegts', 'rtmp', 'rtsp'].includes(c.inputType)) args.push(...RECONNECT_OPTS);
  if (c.inputType === 'rtsp') args.push('-rtsp_transport', 'tcp');

  return args;
}

function videoFilters(c: Channel): string | null {
  const p = c.processing;
  const filters: string[] = [];
  if (p.scale === '720p') filters.push('scale=-2:720');
  if (p.scale === '480p') filters.push('scale=-2:480');
  if (p.blurBox) {
    const { x, y, w, h } = p.blurBox;
    // Crop, blur, overlay back.
    filters.push(`split[base][b];[b]crop=${w}:${h}:${x}:${y},boxblur=20[bb];[base][bb]overlay=${x}:${y}`);
  }
  if (p.textWatermark) {
    const safe = p.textWatermark.replace(/['"\\:]/g, ' ');
    filters.push(`drawtext=text='${safe}':fontcolor=white@0.6:fontsize=18:x=10:y=10:box=1:boxcolor=black@0.4:boxborderw=4`);
  }
  return filters.length ? filters.join(',') : null;
}

export function getAuthorizedKeys(c: Channel) {
  return c.drm?.kind === 'clearkey' ? c.drm.clearkey :
    c.drm?.kind === 'widevine' ? c.drm.widevine?.keys :
    c.drm?.kind === 'playready' ? c.drm.playready?.keys :
    undefined;
}

function chooseEncoder(req: string | undefined, autoPreferred?: string): string {
  switch (req) {
    case 'h264_nvenc':
    case 'h264_qsv':
    case 'h264_amf':
    case 'libx264':
      return req;
    case 'auto':
    default:
      return autoPreferred || 'libx264';
  }
}

export function buildCommand(c: Channel, opts: { outputRoot: string; autoEncoder?: string }): BuiltCommand {
  const args: string[] = [];
  args.push('-hide_banner', '-nostdin', '-loglevel', 'info', '-stats');
  args.push(...inputProtocolOpts(c));

  // CENC decryption — input option, must precede -i.
  //
  // We probe FFmpeg's actual help output (capability cache) and ONLY emit
  // the flags this binary supports. Unknown options would otherwise cause
  // FFmpeg to error out before opening the input.
  //
  // Priority order:
  //   1. -decryption_keys "KID=KEY[:KID=KEY...]"  — multi-KID dict (FFmpeg
  //      8.x+). Best for content with separate keys per track.
  //   2. -decryption_key <hex>                    — single key, universal
  //      (mov demuxer, works on FFmpeg 4.x onward). DASH segments are
  //      fragments delegated to mov, so this path covers DASH+CENC too.
  //   3. -cenc_decryption_key <hex>               — downstream (gyan.dev
  //      / btbn) builds add this. Sent for DASH inputs only when present.
  const keys = getAuthorizedKeys(c);
  if (keys?.length && c.inputType !== 'hls') {
    const caps = detectCapabilities();
    if (keys.length > 1 && caps.hasDecryptionKeysDict) {
      const dict = keys.map(k => `${k.kid}=${k.key}`).join(':');
      args.push('-decryption_keys', dict);
    } else if (caps.hasDecryptionKey) {
      args.push('-decryption_key', keys[0].key);
    }
    if (c.inputType === 'dash' && caps.hasCencDecryptionKey) {
      args.push('-cenc_decryption_key', keys[0].key);
    }
  }

  args.push('-i', c.inputUrl);

  const filter = videoFilters(c);
  const isCopy = c.processing.mode === 'copy' && !filter && !c.processing.logoOverlayPath;

  if (c.processing.logoOverlayPath && fs.existsSync(c.processing.logoOverlayPath)) {
    args.push('-i', c.processing.logoOverlayPath);
  }

  // Track index maps. When the user has selected a specific track (because
  // they have the matching key for that track only, common in multi-KID DRM
  // content), we explicitly map it. The `?` suffix makes the map optional
  // so FFmpeg won't fail when the track is absent.
  const tv = c.processing.videoTrackIndex;
  const ta = c.processing.audioTrackIndex;
  const ts = c.processing.subtitleTrackIndex;
  const hasOverlay = !!c.processing.logoOverlayPath && fs.existsSync(c.processing.logoOverlayPath);
  // If we'll insert a -filter_complex/-vf below, mapping happens there.
  if (!hasOverlay && tv != null && tv >= 0) args.push('-map', `0:v:${tv}?`);
  if (ta != null && ta >= 0) args.push('-map', `0:a:${ta}?`);
  if (ts != null && ts >= 0) args.push('-map', `0:s:${ts}?`);
  if (ts === -1) args.push('-sn');

  if (isCopy) {
    args.push('-c', 'copy');
  } else {
    const encoder = chooseEncoder(c.processing.encoder, opts.autoEncoder);
    args.push('-c:v', encoder);
    if (encoder === 'libx264') args.push('-preset', 'veryfast', '-tune', 'zerolatency');
    if (c.processing.videoBitrate) args.push('-b:v', c.processing.videoBitrate, '-maxrate', c.processing.videoBitrate, '-bufsize', '4M');
    args.push('-c:a', 'aac');
    if (c.processing.audioBitrate) args.push('-b:a', c.processing.audioBitrate);
    args.push('-pix_fmt', 'yuv420p');
    args.push('-g', '60', '-sc_threshold', '0');
    if (c.processing.logoOverlayPath && fs.existsSync(c.processing.logoOverlayPath)) {
      const base = filter ? `[0:v]${filter}[v0];[v0][1:v]overlay=W-w-20:20[v]` : `[0:v][1:v]overlay=W-w-20:20[v]`;
      args.push('-filter_complex', base, '-map', '[v]', '-map', '0:a?');
    } else if (filter) {
      args.push('-vf', filter);
    }
  }

  const generatedLinks: BuiltCommand['generatedLinks'] = {};
  let outputDir: string | undefined;

  if (c.output.mode === 'hls_local') {
    const dir = path.join(c.output.outputFolder || opts.outputRoot, c.slug);
    fs.mkdirSync(dir, { recursive: true });
    outputDir = dir;
    // Better defaults for VLC live playback:
    //  - longer window (40s @ 4s segments × 10) gives players room to breathe
    //  - program_date_time tells VLC where the live edge is
    //  - omit_endlist keeps the playlist marked as live across short gaps
    //  - allow_cache 0 disables HTTP cache hints (we serve from local FS, but
    //    if the user proxies via a server, this matters)
    //  - dropped append_list because on supervisor restart it left orphan
    //    segment numbers that VLC treated as gaps and froze
    const hlsTime = c.output.hlsTime ?? 4;
    const hlsListSize = c.output.hlsListSize ?? 10;
    // Output-side resilience: regenerate PTS so input timestamp jumps
    // don't propagate (was causing VLC freeze ~30s on rolling DASH live);
    // async resampling so audio drift doesn't drop frames.
    args.push(
      '-fflags', '+genpts',
      '-async', '1',
      '-f', 'hls',
      '-hls_time', String(hlsTime),
      '-hls_list_size', String(hlsListSize),
      '-hls_flags', 'delete_segments+independent_segments+program_date_time+omit_endlist',
      '-hls_delete_threshold', '1',
      '-hls_allow_cache', '0',
      '-hls_segment_type', 'mpegts',
      '-hls_start_number_source', 'epoch',
      '-hls_segment_filename', path.join(dir, 'segment_%05d.ts'),
      path.join(dir, 'index.m3u8'),
    );
    // The generated link points at our local HTTP server, NOT a file path.
    // VLC follows live HLS over HTTP correctly (re-fetches the playlist each
    // segment cycle). With file:// VLC reads once and freezes after ~30s.
    generatedLinks.hls = getLocalHlsUrl(c.slug);
  } else if (c.output.mode === 'rtmp_push') {
    if (!c.output.rtmpUrl) throw new Error('RTMP URL is required for rtmp_push');
    let url = c.output.rtmpUrl.trim();
    if (c.output.rtmpKey) {
      url = url.replace(/\/$/, '') + '/' + c.output.rtmpKey;
    }
    args.push('-f', 'flv', url);
    generatedLinks.rtmp = url;
  } else if (c.output.mode === 'mpegts_local') {
    // Two outputs: a local file for the HTTP server to stream, and (optional)
    // UDP if a port was set so external receivers can subscribe.
    const dir = path.join(c.output.outputFolder || opts.outputRoot, c.slug);
    fs.mkdirSync(dir, { recursive: true });
    outputDir = dir;
    const tsFile = path.join(dir, `${c.slug}.ts`);
    args.push('-f', 'mpegts', tsFile);
    generatedLinks.ts = getLocalTsUrl(c.slug);
    if (c.output.mpegtsPort) {
      // Tee won't work mid-pipeline cleanly with the HTTP file path here, so
      // we keep UDP as a future option. For now the local file + HTTP route
      // is what VLC consumes.
    }
  }

  return { args, outputDir, generatedLinks };
}

// Exported for tests / debugging.
export const _internal = { buildHeadersString, videoFilters };

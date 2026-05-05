// Source probing via ffprobe. Returns codec/resolution/duration/encryption
// hints to surface to the user before they run a channel.

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { locateFfmpeg } from './locate';
import type { ChannelHeaders } from '../../shared/types';

export interface ProbeResult {
  ok: boolean;
  format?: { name?: string; longName?: string; bitrate?: number; duration?: number | null };
  video?: { codec?: string; width?: number; height?: number; fps?: number };
  audio?: { codec?: string; channels?: number; sampleRate?: number };
  drm?: { encrypted: boolean; scheme?: string; kid?: string };
  raw?: any;
  error?: string;
}

function ffprobePath(): string | null {
  const ff = locateFfmpeg();
  if (!ff) return null;
  // ffprobe is shipped beside ffmpeg in static builds.
  const dir = path.dirname(ff);
  const bin = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  const candidate = path.join(dir, bin);
  return fs.existsSync(candidate) ? candidate : null;
}

function buildHeaderArgs(h?: ChannelHeaders): string[] {
  const args: string[] = [];
  if (h?.userAgent) args.push('-user_agent', h.userAgent);
  const lines: string[] = [];
  if (h?.referer) lines.push(`Referer: ${h.referer}`);
  if (h?.origin) lines.push(`Origin: ${h.origin}`);
  if (h?.cookie) lines.push(`Cookie: ${h.cookie}`);
  if (h?.authorization) lines.push(`Authorization: ${h.authorization}`);
  if (h?.custom) for (const [k, v] of Object.entries(h.custom)) lines.push(`${k}: ${v}`);
  if (lines.length) args.push('-headers', lines.join('\r\n') + '\r\n');
  return args;
}

export function probeSource(url: string, headers?: ChannelHeaders, timeoutMs = 10000): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const probe = ffprobePath();
    if (!probe) return resolve({ ok: false, error: 'ffprobe not found (install FFmpeg suite)' });

    const args = [
      '-hide_banner', '-loglevel', 'error',
      '-rw_timeout', '8000000',  // 8s I/O timeout
      ...buildHeaderArgs(headers),
      '-show_format', '-show_streams', '-print_format', 'json',
      url,
    ];

    const child = spawn(probe, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, timeoutMs);
    child.on('error', e => { clearTimeout(timer); resolve({ ok: false, error: e.message }); });
    child.on('exit', () => {
      clearTimeout(timer);
      if (!out.trim()) return resolve({ ok: false, error: err.trim() || 'no output from ffprobe' });
      try {
        const json = JSON.parse(out);
        const v = (json.streams || []).find((s: any) => s.codec_type === 'video');
        const a = (json.streams || []).find((s: any) => s.codec_type === 'audio');
        const drmStream = (json.streams || []).find((s: any) => s.codec_tag_string?.includes('encv') || s.codec_tag_string?.includes('enca') || s.tags?.encryption);
        const fpsRaw = v?.avg_frame_rate || v?.r_frame_rate;
        let fps: number | undefined;
        if (fpsRaw && /^\d+\/\d+$/.test(fpsRaw)) {
          const [n, d] = fpsRaw.split('/').map(Number); if (d) fps = n / d;
        }
        resolve({
          ok: true,
          format: {
            name: json.format?.format_name,
            longName: json.format?.format_long_name,
            bitrate: json.format?.bit_rate ? Number(json.format.bit_rate) : undefined,
            duration: json.format?.duration ? Number(json.format.duration) : null,
          },
          video: v ? { codec: v.codec_name, width: v.width, height: v.height, fps } : undefined,
          audio: a ? { codec: a.codec_name, channels: a.channels, sampleRate: a.sample_rate ? Number(a.sample_rate) : undefined } : undefined,
          drm: { encrypted: !!drmStream, scheme: drmStream?.codec_tag_string, kid: drmStream?.tags?.kid },
          raw: json,
        });
      } catch (e: any) {
        resolve({ ok: false, error: `parse error: ${e.message}; stderr: ${err.slice(0, 300)}` });
      }
    });
  });
}

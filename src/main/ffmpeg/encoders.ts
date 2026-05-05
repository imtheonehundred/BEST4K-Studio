// Detect which H.264 encoders this FFmpeg build supports. Used by the
// command builder when the user sets encoder=auto, and surfaced in Settings.

import { spawn } from 'node:child_process';
import { locateFfmpeg } from './locate';

export interface EncoderInfo {
  available: string[];     // every H.264 encoder reported by ffmpeg
  preferred: string;       // best one we'd pick for `encoder=auto`
  hardware: string[];      // subset that's hardware-accelerated
}

let cache: EncoderInfo | null = null;

export function detectEncoders(force = false): Promise<EncoderInfo> {
  if (cache && !force) return Promise.resolve(cache);
  return new Promise((resolve) => {
    const ff = locateFfmpeg();
    if (!ff) return resolve({ available: [], preferred: 'libx264', hardware: [] });
    const child = spawn(ff, ['-hide_banner', '-encoders'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { out += d.toString(); });
    child.on('error', () => resolve({ available: ['libx264'], preferred: 'libx264', hardware: [] }));
    child.on('exit', () => {
      const candidates = ['h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_videotoolbox', 'h264_vaapi', 'libx264'];
      const available = candidates.filter(c => new RegExp(`^\\s*V[\\.\\w]*\\s+${c}\\b`, 'm').test(out));
      const hardware = available.filter(c => c !== 'libx264');
      // Preference order: NVENC > QSV > AMF > VideoToolbox > VAAPI > libx264.
      const preferred = available[0] || 'libx264';
      cache = { available: available.length ? available : ['libx264'], preferred, hardware };
      resolve(cache);
    });
  });
}

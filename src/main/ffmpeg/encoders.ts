// Detect which H.264 encoders this FFmpeg build supports. Used by the
// command builder when the user sets encoder=auto, and surfaced in Settings.

import { spawn, spawnSync } from 'node:child_process';
import { locateFfmpeg } from './locate';

export interface EncoderInfo {
  available: string[];     // every H.264 encoder reported by ffmpeg
  preferred: string;       // best one we'd pick for `encoder=auto`
  hardware: string[];      // subset that's hardware-accelerated
}

export interface CapabilityInfo {
  hasDecryptionKey: boolean;        // -decryption_key   (mov demuxer, mp4/cmaf)
  hasDecryptionKeysDict: boolean;   // -decryption_keys  (mov demuxer, multi-KID)
  hasCencDecryptionKey: boolean;    // -cenc_decryption_key  (DASH demuxer)
  hasCencDecryptionKeys: boolean;   // -cenc_decryption_keys (DASH demuxer, multi-KID)
  hasReconnectOnHttpError: boolean; // -reconnect_on_http_error
  hasDashDemuxer: boolean;          // dash demuxer (libxml2 build)
}

let cache: EncoderInfo | null = null;
let capCache: CapabilityInfo | null = null;

// Synchronous capability probe. Runs once per session, caches result.
// We pick the right CENC flag at command-build time based on this.
export function detectCapabilities(force = false): CapabilityInfo {
  if (capCache && !force) return capCache;
  const ff = locateFfmpeg();
  const empty: CapabilityInfo = {
    hasDecryptionKey: false, hasDecryptionKeysDict: false,
    hasCencDecryptionKey: false, hasCencDecryptionKeys: false,
    hasReconnectOnHttpError: false, hasDashDemuxer: false,
  };
  if (!ff) return capCache = empty;

  // mov demuxer help → -decryption_key / -decryption_keys (for plain mp4/cmaf)
  const movHelp = spawnSync(ff, ['-hide_banner', '-h', 'demuxer=mov'], { encoding: 'utf8', timeout: 4000 });
  const movOut = (movHelp.stdout || '') + (movHelp.stderr || '');
  // dash demuxer help → -cenc_decryption_key / -cenc_decryption_keys (for DASH)
  // These are SEPARATE from the mov ones — the dash demuxer doesn't accept
  // -decryption_key, the mov demuxer doesn't accept -cenc_decryption_key.
  const dashHelp = spawnSync(ff, ['-hide_banner', '-h', 'demuxer=dash'], { encoding: 'utf8', timeout: 4000 });
  const dashOut = (dashHelp.stdout || '') + (dashHelp.stderr || '');
  const demuxers = spawnSync(ff, ['-hide_banner', '-demuxers'], { encoding: 'utf8', timeout: 4000 });
  const protoHelp = spawnSync(ff, ['-hide_banner', '-h', 'protocol=https'], { encoding: 'utf8', timeout: 4000 });
  const protoOut = (protoHelp.stdout || '') + (protoHelp.stderr || '');

  capCache = {
    hasDecryptionKey: /-decryption_key\b/.test(movOut),
    hasDecryptionKeysDict: /-decryption_keys\b/.test(movOut),
    hasCencDecryptionKey: /-cenc_decryption_key\b/.test(dashOut),
    hasCencDecryptionKeys: /-cenc_decryption_keys\b/.test(dashOut),
    hasReconnectOnHttpError: /-reconnect_on_http_error\b/.test(protoOut),
    hasDashDemuxer: /^\s*D\s+dash\b/m.test(demuxers.stdout || ''),
  };
  return capCache;
}

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

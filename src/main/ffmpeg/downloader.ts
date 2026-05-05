// Downloads the BtbN FFmpeg-Builds gpl-shared release on first run.
//
// Why BtbN: weekly-rebuilt master, includes libxml2 (DASH demuxer), all H.264
// hardware encoders, DRM-related options (-decryption_key, -decryption_keys),
// libsrt, libssh, x264, x265, AV1, and ships ffprobe alongside.
//
// We download once into userData/ffmpeg/ and remember the path. Subsequent
// launches use the cached binary. Users can manually re-trigger via Settings.

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { app } from 'electron';
import { spawn } from 'node:child_process';
import extractZip from 'extract-zip';

export interface DownloadProgress {
  phase: 'metadata' | 'download' | 'extract' | 'verify' | 'done' | 'error';
  bytesReceived?: number;
  totalBytes?: number;
  percent?: number;
  message?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
}

export type ProgressCb = (p: DownloadProgress) => void;

const BTBN_LATEST_API = 'https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest';

function ffmpegDir(): string {
  return path.join(app.getPath('userData'), 'ffmpeg');
}

function binaryNames() {
  const ext = process.platform === 'win32' ? '.exe' : '';
  return { ffmpeg: 'ffmpeg' + ext, ffprobe: 'ffprobe' + ext };
}

// Returns existing binary paths if a previous download is intact.
export function existingDownload(): { ffmpeg: string; ffprobe: string } | null {
  const dir = ffmpegDir();
  const { ffmpeg, ffprobe } = binaryNames();
  // Walk shallow; the BtbN zip extracts into <dir>/ffmpeg-master-latest-.../bin/
  const candidates: string[] = [
    path.join(dir, 'bin'),
    dir,
  ];
  // include subdirectories
  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        candidates.push(path.join(dir, entry.name, 'bin'));
        candidates.push(path.join(dir, entry.name));
      }
    }
  }
  for (const c of candidates) {
    const ff = path.join(c, ffmpeg);
    const fp = path.join(c, ffprobe);
    if (fs.existsSync(ff) && fs.existsSync(fp)) return { ffmpeg: ff, ffprobe: fp };
  }
  return null;
}

function pickAsset(assets: Array<{ name: string; browser_download_url: string; size: number }>): { url: string; name: string; size: number } | null {
  const plat = process.platform;
  const arch = process.arch;
  const isArm = arch === 'arm64';
  const wantWin = plat === 'win32';
  const wantLinux = plat === 'linux';
  // BtbN naming: ffmpeg-master-latest-{win64|linuxarm64|linux64}-gpl-shared.zip
  // (linux is .tar.xz, but they also ship .zip variants for some)
  const target = wantWin
    ? (arch === 'x64' ? 'win64-gpl-shared.zip' : 'winarm64-gpl-shared.zip')
    : wantLinux
      ? (isArm ? 'linuxarm64-gpl-shared.tar.xz' : 'linux64-gpl-shared.tar.xz')
      : null; // BtbN doesn't ship macOS

  if (!target) return null;
  const match = assets.find(a => a.name.endsWith(target));
  if (!match) return null;
  return { url: match.browser_download_url, name: match.name, size: match.size };
}

async function fetchLatestRelease(): Promise<any> {
  const res = await fetch(BTBN_LATEST_API, {
    headers: { 'User-Agent': 'BEST4K-Studio', 'Accept': 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.json();
}

async function downloadFile(url: string, dest: string, expectedSize: number, onProgress: ProgressCb): Promise<void> {
  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'BEST4K-Studio' } });
  if (!res.ok || !res.body) throw new Error(`download ${url} → HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || expectedSize;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const file = fs.createWriteStream(dest);
  let received = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    file.write(value);
    received += value.byteLength;
    onProgress({ phase: 'download', bytesReceived: received, totalBytes: total, percent: total ? (received / total) * 100 : 0 });
  }
  await new Promise<void>((resolve, reject) => file.end((err: Error | null | undefined) => err ? reject(err) : resolve()));
  const stat = fs.statSync(dest);
  if (expectedSize && Math.abs(stat.size - expectedSize) > 1024) {
    throw new Error(`download size mismatch: got ${stat.size}, expected ${expectedSize}`);
  }
}

async function extractTarXz(archive: string, destDir: string): Promise<void> {
  // tar is available on macOS/Linux; on Windows the archive type is .zip.
  await new Promise<void>((resolve, reject) => {
    const child = spawn('tar', ['-xJf', archive, '-C', destDir], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`tar exit ${code}`)));
  });
}

export async function downloadFfmpeg(onProgress: ProgressCb = () => {}): Promise<{ ffmpeg: string; ffprobe: string }> {
  try {
    onProgress({ phase: 'metadata', message: 'Querying latest BtbN FFmpeg release…' });
    const release = await fetchLatestRelease();
    const asset = pickAsset(release.assets || []);
    if (!asset) throw new Error(`No BtbN asset for ${process.platform}/${process.arch}`);

    const dir = ffmpegDir();
    fs.mkdirSync(dir, { recursive: true });
    const archivePath = path.join(dir, asset.name);

    onProgress({ phase: 'download', bytesReceived: 0, totalBytes: asset.size, percent: 0, message: `Downloading ${asset.name}…` });
    await downloadFile(asset.url, archivePath, asset.size, onProgress);

    onProgress({ phase: 'extract', message: 'Extracting…' });
    if (asset.name.endsWith('.zip')) {
      await extractZip(archivePath, { dir });
    } else if (asset.name.endsWith('.tar.xz')) {
      await extractTarXz(archivePath, dir);
    } else {
      throw new Error(`Unknown archive format: ${asset.name}`);
    }
    try { fs.unlinkSync(archivePath); } catch {}

    onProgress({ phase: 'verify', message: 'Verifying binaries…' });
    const found = existingDownload();
    if (!found) throw new Error('Extracted archive but ffmpeg/ffprobe not found');

    if (process.platform !== 'win32') {
      try { fs.chmodSync(found.ffmpeg, 0o755); fs.chmodSync(found.ffprobe, 0o755); } catch {}
    }

    onProgress({ phase: 'done', ffmpegPath: found.ffmpeg, ffprobePath: found.ffprobe, message: 'Ready.' });
    return found;
  } catch (e: any) {
    onProgress({ phase: 'error', message: e?.message || String(e) });
    throw e;
  }
}

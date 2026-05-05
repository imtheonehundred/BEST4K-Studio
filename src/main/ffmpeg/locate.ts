// Locate ffmpeg on disk. We try (in order): explicit setting, ffmpeg-static
// (bundled with the app), bundled resource, system PATH.
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { settingsRepo } from '../database/repositories';

function ffmpegStaticPath(): string | null {
  try {
    // ffmpeg-static exports a string path. In packaged app, the binary lives
    // under app.asar.unpacked, so we rewrite the path accordingly.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const raw: string | null = require('ffmpeg-static');
    if (!raw) return null;
    const fixed = raw.replace('app.asar', 'app.asar.unpacked');
    return fs.existsSync(fixed) ? fixed : (fs.existsSync(raw) ? raw : null);
  } catch { return null; }
}

function bundledPath(): string {
  const isWin = process.platform === 'win32';
  const exe = isWin ? 'ffmpeg.exe' : 'ffmpeg';
  const dev = path.join(process.cwd(), 'resources', 'ffmpeg', exe);
  const prod = path.join(process.resourcesPath || '', 'resources', 'ffmpeg', exe);
  return fs.existsSync(prod) ? prod : dev;
}

function whichSystem(): string | null {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'where' : 'which';
  const r = spawnSync(cmd, ['ffmpeg'], { encoding: 'utf8' });
  if (r.status === 0 && r.stdout) {
    const first = r.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
    if (first && fs.existsSync(first)) return first;
  }
  return null;
}

export function locateFfmpeg(): string | null {
  const s = settingsRepo.getAll();
  if (s.ffmpegPath && fs.existsSync(s.ffmpegPath)) return s.ffmpegPath;
  const fromStatic = ffmpegStaticPath();
  if (fromStatic) return fromStatic;
  const bundled = bundledPath();
  if (fs.existsSync(bundled)) return bundled;
  return whichSystem();
}

export function probeFfmpegVersion(binPath: string): string | null {
  const r = spawnSync(binPath, ['-version'], { encoding: 'utf8' });
  if (r.status === 0 && r.stdout) {
    const m = r.stdout.match(/ffmpeg version (\S+)/);
    return m ? m[1] : r.stdout.split('\n')[0];
  }
  return null;
}

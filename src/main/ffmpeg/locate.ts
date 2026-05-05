// Locate ffmpeg on disk. We try (in order): explicit setting, bundled resource, system PATH.
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import { spawnSync } from 'node:child_process';
import { settingsRepo } from '../database/repositories';

function bundledPath(): string {
  const isWin = process.platform === 'win32';
  const exe = isWin ? 'ffmpeg.exe' : 'ffmpeg';
  // electron-builder copies extraResources into resources/. In dev, look in ./resources.
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

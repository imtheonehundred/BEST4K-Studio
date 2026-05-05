// Spawns and supervises FFmpeg processes per channel.
// - argv-array spawn (no shell) → no command injection
// - Restarts on crash with exponential backoff (capped)
// - Parses stderr for fps/bitrate/speed
// - Emits status + stats events to renderer

import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { Channel, ChannelRuntimeStats } from '../../shared/types';
import { buildCommand } from '../ffmpeg/commandBuilder';
import { locateFfmpeg } from '../ffmpeg/locate';
import { detectEncoders } from '../ffmpeg/encoders';
import { channelsRepo, logsRepo, settingsRepo } from '../database/repositories';
import { maskString } from '../security/mask';

interface RuntimeRecord {
  channelId: number;
  proc?: ChildProcess;
  startedAt?: number;
  reconnectCount: number;
  desiredRunning: boolean;
  lastBitrateKbps?: number;
  lastFps?: number;
  lastError?: string | null;
  generatedLinks?: ChannelRuntimeStats['generatedLinks'];
  backoffMs: number;
  failoverIndex: number;
  restartTimer?: NodeJS.Timeout;
  // Sliding window of recent HTTP-error timestamps so we can detect a burst
  // (rolling-window live source pulled too far back) and force a clean
  // restart instead of letting FFmpeg spin on 404s.
  httpErrorTimes: number[];
}

class Supervisor extends EventEmitter {
  private records = new Map<number, RuntimeRecord>();

  list(): ChannelRuntimeStats[] {
    return [...this.records.values()].map(r => this.snapshot(r));
  }

  get(channelId: number): ChannelRuntimeStats | null {
    const r = this.records.get(channelId);
    return r ? this.snapshot(r) : null;
  }

  start(channel: Channel) {
    const existing = this.records.get(channel.id);
    if (existing?.proc && !existing.proc.killed) {
      this.log(channel.id, 'info', 'Already running.');
      return this.snapshot(existing);
    }
    const rec: RuntimeRecord = existing ?? {
      channelId: channel.id,
      reconnectCount: 0,
      desiredRunning: true,
      backoffMs: 1000,
      failoverIndex: 0,
      httpErrorTimes: [],
    };
    rec.desiredRunning = true;
    this.records.set(channel.id, rec);
    this.spawnOnce(channel, rec);
    return this.snapshot(rec);
  }

  stop(channelId: number) {
    const rec = this.records.get(channelId);
    if (!rec) return;
    rec.desiredRunning = false;
    if (rec.restartTimer) { clearTimeout(rec.restartTimer); rec.restartTimer = undefined; }
    if (rec.proc && !rec.proc.killed) {
      try { rec.proc.kill('SIGTERM'); } catch {}
      setTimeout(() => { try { rec.proc?.kill('SIGKILL'); } catch {} }, 4000);
    }
    channelsRepo.setStatus(channelId, 'stopped', null);
    this.emitStatus(channelId, 'stopped');
    this.log(channelId, 'info', 'Stopped by user.');
  }

  stopAll() {
    for (const id of this.records.keys()) this.stop(id);
  }

  private async spawnOnce(channel: Channel, rec: RuntimeRecord) {
    const ffmpeg = locateFfmpeg();
    if (!ffmpeg) {
      rec.lastError = 'FFmpeg not found. Set the FFmpeg path in Settings.';
      channelsRepo.setStatus(channel.id, 'error', rec.lastError);
      this.emitStatus(channel.id, 'error');
      this.log(channel.id, 'error', rec.lastError);
      return;
    }

    const settings = settingsRepo.getAll();
    let activeChannel = channel;

    // Apply failover URL rotation.
    if (rec.failoverIndex > 0 && channel.failoverUrls && channel.failoverUrls[rec.failoverIndex - 1]) {
      activeChannel = { ...channel, inputUrl: channel.failoverUrls[rec.failoverIndex - 1] };
      this.log(channel.id, 'warn', `Using failover URL #${rec.failoverIndex}`);
    }

    let built;
    try {
      const encInfo = await detectEncoders().catch(() => ({ preferred: 'libx264' as string }));
      built = buildCommand(activeChannel, { outputRoot: settings.defaultOutputFolder, autoEncoder: encInfo.preferred });
    } catch (e: any) {
      rec.lastError = e.message;
      channelsRepo.setStatus(channel.id, 'error', e.message);
      this.emitStatus(channel.id, 'error');
      this.log(channel.id, 'error', `Build failed: ${e.message}`);
      return;
    }

    rec.generatedLinks = built.generatedLinks;
    this.log(channel.id, 'info', `Spawning: ffmpeg ${maskString(built.args.join(' '))}`);

    const proc = spawn(ffmpeg, built.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    rec.proc = proc;
    rec.startedAt = Date.now();
    channelsRepo.setStatus(channel.id, 'starting', null);
    this.emitStatus(channel.id, 'starting');

    let startedConfirmed = false;
    const startedTimer = setTimeout(() => {
      if (!startedConfirmed && !proc.killed) {
        startedConfirmed = true;
        channelsRepo.setStatus(channel.id, 'running', null);
        this.emitStatus(channel.id, 'running');
        rec.backoffMs = 1000; // reset backoff after successful start
      }
    }, 3000);

    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      // parse fps/bitrate
      const fpsM = text.match(/fps=\s*([\d.]+)/);
      const brM = text.match(/bitrate=\s*([\d.]+)\s*kbits\/s/);
      if (fpsM) rec.lastFps = parseFloat(fpsM[1]);
      if (brM) rec.lastBitrateKbps = parseFloat(brM[1]);
      this.emitStats(channel.id);

      // log lines (mask + classify)
      for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        const masked = maskString(t);
        const isHttpErr = /HTTP error 4\d\d|Failed to open fragment|404 Not Found/i.test(t);
        const level = (isHttpErr || /error|failed|invalid|403|connection refused/i.test(t)) ? 'error' : 'info';
        this.log(channel.id, level as any, masked);

        if (isHttpErr) {
          const now = Date.now();
          rec.httpErrorTimes.push(now);
          // keep only the last 30s of errors
          rec.httpErrorTimes = rec.httpErrorTimes.filter(ts => now - ts < 30000);
          // 8+ HTTP errors in 30s → live edge desync; force a clean restart
          // so we re-fetch the manifest at the current live edge instead
          // of spinning on segments that already rolled off the CDN.
          if (rec.httpErrorTimes.length >= 8 && rec.proc && !rec.proc.killed) {
            this.log(channel.id, 'warn', `HTTP error burst (${rec.httpErrorTimes.length} in 30s) — forcing clean restart`);
            rec.httpErrorTimes = [];
            try { rec.proc.kill('SIGTERM'); } catch {}
          }
        }
      }
    });

    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) this.log(channel.id, 'debug', maskString(text));
    });

    proc.on('error', (err) => {
      rec.lastError = err.message;
      this.log(channel.id, 'error', `Process error: ${err.message}`);
    });

    proc.on('exit', (code, signal) => {
      clearTimeout(startedTimer);
      rec.proc = undefined;
      this.log(channel.id, 'info', `Exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);

      if (!rec.desiredRunning) {
        channelsRepo.setStatus(channel.id, 'stopped', null);
        this.emitStatus(channel.id, 'stopped');
        return;
      }

      // Auto-restart with backoff and failover rotation.
      rec.reconnectCount += 1;
      rec.failoverIndex = (rec.failoverIndex + 1) % ((channel.failoverUrls?.length ?? 0) + 1);
      channelsRepo.setStatus(channel.id, 'reconnecting', `Exit ${code}`);
      this.emitStatus(channel.id, 'reconnecting');
      const wait = rec.backoffMs;
      rec.backoffMs = Math.min(rec.backoffMs * 2, 30000);
      this.log(channel.id, 'warn', `Reconnect in ${wait}ms (attempt ${rec.reconnectCount})`);
      rec.restartTimer = setTimeout(() => {
        const fresh = channelsRepo.get(channel.id);
        if (fresh && rec.desiredRunning) this.spawnOnce(fresh, rec);
      }, wait);
    });
  }

  private snapshot(rec: RuntimeRecord): ChannelRuntimeStats {
    const status = rec.proc ? 'running' : (rec.desiredRunning ? 'reconnecting' : 'stopped');
    return {
      channelId: rec.channelId,
      status: status as any,
      pid: rec.proc?.pid,
      startedAt: rec.startedAt ? new Date(rec.startedAt).toISOString() : undefined,
      uptimeMs: rec.startedAt ? Date.now() - rec.startedAt : undefined,
      reconnectCount: rec.reconnectCount,
      lastBitrateKbps: rec.lastBitrateKbps,
      lastFps: rec.lastFps,
      lastError: rec.lastError,
      generatedLinks: rec.generatedLinks,
    };
  }

  private emitStatus(channelId: number, status: string) {
    this.emit('status', { channelId, status });
  }
  private emitStats(channelId: number) {
    const r = this.records.get(channelId);
    if (r) this.emit('stats', this.snapshot(r));
  }
  private log(channelId: number | null, level: 'info' | 'warn' | 'error' | 'debug', message: string) {
    try { logsRepo.insert(channelId, level, message); } catch {}
    this.emit('log', { channelId, level, message, ts: new Date().toISOString() });
  }
}

export const supervisor = new Supervisor();

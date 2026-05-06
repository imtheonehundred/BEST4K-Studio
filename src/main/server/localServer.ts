// Local HTTP server that serves the HLS / TS outputs that FFmpeg writes to disk.
//
// CRITICAL: VLC behaves very differently when opening a playlist via HTTP vs.
// via a file path. With file:// VLC reads the .m3u8 once, parses the listed
// segments, and stops following the live edge — playback freezes after ~30s
// when the initial segments are exhausted. With HTTP, VLC re-fetches the
// playlist on every segment cycle and follows the live edge naturally.
//
// This is the same approach the reference IPTV_Stream project uses.

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import { settingsRepo } from '../database/repositories';

const MIME: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts':   'video/mp2t',
  '.m4s':  'video/iso.segment',
  '.mp4':  'video/mp4',
  '.aac':  'audio/aac',
};

let server: http.Server | null = null;
const PORT = 9088;

function defaultOutputRoot(): string {
  const s = settingsRepo.getAll();
  return s.defaultOutputFolder || path.join(app.getPath('userData'), 'streams');
}

export function getLocalBaseUrl(): string {
  return `http://127.0.0.1:${PORT}`;
}

export function getLocalHlsUrl(slug: string): string {
  return `${getLocalBaseUrl()}/live/${encodeURIComponent(slug)}.m3u8`;
}

export function getLocalTsUrl(slug: string): string {
  return `${getLocalBaseUrl()}/live/${encodeURIComponent(slug)}.ts`;
}

function safeJoin(root: string, ...parts: string[]): string | null {
  const resolved = path.resolve(root, ...parts);
  if (!resolved.startsWith(path.resolve(root))) return null;
  return resolved;
}

function send(res: http.ServerResponse, status: number, body: string, contentType = 'text/plain') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function sendFile(res: http.ServerResponse, filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const ct = MIME[ext] || 'application/octet-stream';
  let stat: fs.Stats;
  try { stat = fs.statSync(filePath); } catch { return send(res, 404, 'Not found'); }
  res.writeHead(200, {
    'Content-Type': ct,
    'Content-Length': String(stat.size),
    'Cache-Control': ext === '.m3u8' ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3',
    'Access-Control-Allow-Origin': '*',
  });
  fs.createReadStream(filePath).pipe(res);
}

export function startLocalServer() {
  if (server) return;
  server = http.createServer((req, res) => {
    const root = defaultOutputRoot();
    const url = new URL(req.url || '/', getLocalBaseUrl());
    const parts = url.pathname.split('/').filter(Boolean);

    // /live/<slug>.m3u8 → outputs/<slug>/index.m3u8
    if (parts[0] === 'live' && parts[1]?.endsWith('.m3u8')) {
      const slug = path.basename(decodeURIComponent(parts[1]), '.m3u8');
      const target = safeJoin(root, slug, 'index.m3u8');
      if (!target || !fs.existsSync(target)) return send(res, 404, `No HLS playlist for "${slug}" yet.`);
      return sendFile(res, target);
    }

    // /live/<slug>.ts → outputs/<slug>/<slug>.ts (mpegts_local channels)
    if (parts[0] === 'live' && parts[1]?.endsWith('.ts')) {
      const slug = path.basename(decodeURIComponent(parts[1]), '.ts');
      const target = safeJoin(root, slug, `${slug}.ts`);
      if (!target || !fs.existsSync(target)) return send(res, 404, `No TS stream for "${slug}" yet.`);
      return sendFile(res, target);
    }

    // /outputs/<slug>/<segment>.ts — direct static access used by VLC for
    // segment fetches referenced from the playlist.
    if (parts[0] === 'outputs' && parts.length >= 2) {
      const target = safeJoin(root, ...parts.slice(1).map(decodeURIComponent));
      if (!target || !fs.existsSync(target)) return send(res, 404, 'Not found');
      return sendFile(res, target);
    }

    // / and /health
    if (parts.length === 0 || parts[0] === 'health') {
      return send(res, 200, 'BEST4K Studio local server OK');
    }

    send(res, 404, 'Not found');
  });
  server.on('error', (err) => {
    // Port collision is the common case — log once and continue.
    // The renderer will still show the channel link; user can change port.
    console.error('Local server error:', err);
  });
  server.listen(PORT, '127.0.0.1');
}

export function stopLocalServer() {
  if (server) { server.close(); server = null; }
}

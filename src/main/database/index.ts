import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });
  const dbPath = path.join(userData, 'best4k.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      input_type TEXT NOT NULL,
      input_url TEXT NOT NULL,
      failover_urls TEXT,
      headers TEXT,
      drm TEXT,
      processing TEXT NOT NULL,
      output TEXT NOT NULL,
      server_id INTEGER,
      status TEXT NOT NULL DEFAULT 'stopped',
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 22,
      username TEXT NOT NULL,
      auth_method TEXT NOT NULL,
      password_enc TEXT,
      private_key_enc TEXT,
      domain TEXT,
      installed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      config TEXT NOT NULL,
      builtin INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      ts TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_logs_channel_ts ON logs(channel_id, ts DESC);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const count = d.prepare('SELECT COUNT(*) as c FROM profiles WHERE builtin = 1').get() as { c: number };
  if (count.c === 0) {
    const seed = d.prepare('INSERT INTO profiles (name, description, config, builtin) VALUES (?,?,?,1)');
    const profiles = [
      { name: 'Copy Only', desc: 'Stream copy, no re-encode (lowest CPU).', cfg: { mode: 'copy' } },
      { name: '720p HLS', desc: 'Transcode to 720p libx264 + AAC, HLS output.', cfg: { mode: 'transcode', scale: '720p', encoder: 'auto', videoBitrate: '2500k', audioBitrate: '128k', outputMode: 'hls_local' } },
      { name: '480p Low CPU', desc: '480p libx264 veryfast for low-power machines.', cfg: { mode: 'transcode', scale: '480p', encoder: 'libx264', videoBitrate: '1200k', audioBitrate: '96k' } },
      { name: 'RTMP Push', desc: 'Copy mode with RTMP push to remote server.', cfg: { mode: 'copy', outputMode: 'rtmp_push' } },
      { name: 'Logo Overlay', desc: 'Transcode + logo overlay (top-right).', cfg: { mode: 'transcode', scale: '720p', encoder: 'auto', videoBitrate: '2500k', logoOverlayPath: '' } },
      { name: 'Sports Mode', desc: 'High-bitrate 720p60 for fast motion.', cfg: { mode: 'transcode', scale: '720p', encoder: 'auto', videoBitrate: '4500k', audioBitrate: '160k' } },
    ];
    for (const p of profiles) seed.run(p.name, p.desc, JSON.stringify(p.cfg));
  }

  const defaults: Record<string, string> = {
    ffmpegPath: '',
    defaultOutputFolder: path.join(app.getPath('userData'), 'streams'),
    theme: 'dark',
    autoUpdate: 'true',
    maskSecrets: 'true',
  };
  const ins = d.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)');
  for (const [k, v] of Object.entries(defaults)) ins.run(k, v);
}

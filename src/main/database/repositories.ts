import { getDb } from './index';
import type {
  Channel, ChannelInput, ChannelStatus, Server, ServerInput, Profile, LogEntry, AppSettings,
} from '../../shared/types';
import { encryptSecret, decryptSecret } from '../security/crypto';

function rowToChannel(r: any): Channel {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    inputType: r.input_type,
    inputUrl: r.input_url,
    failoverUrls: r.failover_urls ? JSON.parse(r.failover_urls) : [],
    headers: r.headers ? JSON.parse(r.headers) : undefined,
    drm: r.drm ? JSON.parse(r.drm) : undefined,
    processing: JSON.parse(r.processing),
    output: JSON.parse(r.output),
    serverId: r.server_id ?? null,
    status: r.status as ChannelStatus,
    lastError: r.last_error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const channelsRepo = {
  list(): Channel[] {
    return getDb().prepare('SELECT * FROM channels ORDER BY id DESC').all().map(rowToChannel);
  },
  get(id: number): Channel | null {
    const r = getDb().prepare('SELECT * FROM channels WHERE id = ?').get(id);
    return r ? rowToChannel(r) : null;
  },
  getBySlug(slug: string): Channel | null {
    const r = getDb().prepare('SELECT * FROM channels WHERE slug = ?').get(slug);
    return r ? rowToChannel(r) : null;
  },
  create(input: ChannelInput): Channel {
    const stmt = getDb().prepare(`
      INSERT INTO channels (slug, name, input_type, input_url, failover_urls, headers, drm, processing, output, server_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `);
    const info = stmt.run(
      input.slug, input.name, input.inputType, input.inputUrl,
      JSON.stringify(input.failoverUrls ?? []),
      input.headers ? JSON.stringify(input.headers) : null,
      input.drm ? JSON.stringify(input.drm) : null,
      JSON.stringify(input.processing),
      JSON.stringify(input.output),
      input.serverId ?? null,
    );
    return this.get(Number(info.lastInsertRowid))!;
  },
  update(id: number, patch: Partial<ChannelInput>): Channel {
    const cur = this.get(id);
    if (!cur) throw new Error(`Channel ${id} not found`);
    const merged = { ...cur, ...patch } as Channel;
    getDb().prepare(`
      UPDATE channels SET slug=?, name=?, input_type=?, input_url=?, failover_urls=?, headers=?, drm=?, processing=?, output=?, server_id=?, updated_at=datetime('now')
      WHERE id=?
    `).run(
      merged.slug, merged.name, merged.inputType, merged.inputUrl,
      JSON.stringify(merged.failoverUrls ?? []),
      merged.headers ? JSON.stringify(merged.headers) : null,
      merged.drm ? JSON.stringify(merged.drm) : null,
      JSON.stringify(merged.processing),
      JSON.stringify(merged.output),
      merged.serverId ?? null,
      id,
    );
    return this.get(id)!;
  },
  delete(id: number): void {
    getDb().prepare('DELETE FROM channels WHERE id = ?').run(id);
  },
  setStatus(id: number, status: ChannelStatus, lastError?: string | null): void {
    getDb().prepare(`UPDATE channels SET status=?, last_error=?, updated_at=datetime('now') WHERE id=?`)
      .run(status, lastError ?? null, id);
  },
  duplicate(id: number): Channel {
    const c = this.get(id);
    if (!c) throw new Error(`Channel ${id} not found`);
    let newSlug = `${c.slug}-copy`;
    let i = 1;
    while (this.getBySlug(newSlug)) { i++; newSlug = `${c.slug}-copy${i}`; }
    return this.create({ ...c, slug: newSlug, name: `${c.name} (copy)` } as any);
  },
};

function rowToServer(r: any): Server {
  return {
    id: r.id,
    name: r.name,
    host: r.host,
    port: r.port,
    username: r.username,
    authMethod: r.auth_method,
    password: r.password_enc ? decryptSecret(r.password_enc) : undefined,
    privateKey: r.private_key_enc ? decryptSecret(r.private_key_enc) : undefined,
    domain: r.domain,
    installed: !!r.installed,
    createdAt: r.created_at,
  };
}

export const serversRepo = {
  list(): Server[] {
    return getDb().prepare('SELECT * FROM servers ORDER BY id DESC').all().map(rowToServer);
  },
  get(id: number): Server | null {
    const r = getDb().prepare('SELECT * FROM servers WHERE id = ?').get(id);
    return r ? rowToServer(r) : null;
  },
  create(input: ServerInput): Server {
    const info = getDb().prepare(`
      INSERT INTO servers (name, host, port, username, auth_method, password_enc, private_key_enc, domain)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      input.name, input.host, input.port, input.username, input.authMethod,
      input.password ? encryptSecret(input.password) : null,
      input.privateKey ? encryptSecret(input.privateKey) : null,
      input.domain ?? null,
    );
    return this.get(Number(info.lastInsertRowid))!;
  },
  update(id: number, patch: Partial<ServerInput>): Server {
    const cur = this.get(id);
    if (!cur) throw new Error(`Server ${id} not found`);
    const m = { ...cur, ...patch };
    getDb().prepare(`
      UPDATE servers SET name=?, host=?, port=?, username=?, auth_method=?, password_enc=?, private_key_enc=?, domain=?
      WHERE id=?
    `).run(
      m.name, m.host, m.port, m.username, m.authMethod,
      m.password ? encryptSecret(m.password) : null,
      m.privateKey ? encryptSecret(m.privateKey) : null,
      m.domain ?? null,
      id,
    );
    return this.get(id)!;
  },
  delete(id: number) { getDb().prepare('DELETE FROM servers WHERE id = ?').run(id); },
  setInstalled(id: number, installed: boolean) {
    getDb().prepare('UPDATE servers SET installed=? WHERE id=?').run(installed ? 1 : 0, id);
  },
};

export const profilesRepo = {
  list(): Profile[] {
    return getDb().prepare('SELECT * FROM profiles ORDER BY builtin DESC, id ASC').all().map((r: any) => ({
      id: r.id, name: r.name, description: r.description,
      config: JSON.parse(r.config), builtin: !!r.builtin,
    }));
  },
  create(p: Omit<Profile, 'id' | 'builtin'>): Profile {
    const info = getDb().prepare('INSERT INTO profiles (name, description, config, builtin) VALUES (?,?,?,0)')
      .run(p.name, p.description, JSON.stringify(p.config));
    return this.list().find(x => x.id === Number(info.lastInsertRowid))!;
  },
  update(id: number, p: Partial<Omit<Profile, 'id' | 'builtin'>>): Profile {
    const cur = getDb().prepare('SELECT * FROM profiles WHERE id=?').get(id) as any;
    if (!cur) throw new Error(`Profile ${id} not found`);
    if (cur.builtin) throw new Error('Cannot edit builtin profile');
    getDb().prepare('UPDATE profiles SET name=?, description=?, config=? WHERE id=?')
      .run(p.name ?? cur.name, p.description ?? cur.description, JSON.stringify(p.config ?? JSON.parse(cur.config)), id);
    return this.list().find(x => x.id === id)!;
  },
  delete(id: number) {
    const cur = getDb().prepare('SELECT builtin FROM profiles WHERE id=?').get(id) as any;
    if (cur?.builtin) throw new Error('Cannot delete builtin profile');
    getDb().prepare('DELETE FROM profiles WHERE id=?').run(id);
  },
};

export const logsRepo = {
  insert(channelId: number | null, level: LogEntry['level'], message: string) {
    getDb().prepare('INSERT INTO logs (channel_id, level, message) VALUES (?,?,?)').run(channelId, level, message);
  },
  list(opts: { channelId?: number | null; limit?: number; search?: string } = {}): LogEntry[] {
    const { channelId, limit = 500, search } = opts;
    const where: string[] = [];
    const args: any[] = [];
    if (typeof channelId === 'number') { where.push('channel_id = ?'); args.push(channelId); }
    if (search) { where.push('message LIKE ?'); args.push(`%${search}%`); }
    const sql = `SELECT * FROM logs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`;
    args.push(limit);
    return getDb().prepare(sql).all(...args).map((r: any) => ({
      id: r.id, channelId: r.channel_id, level: r.level, message: r.message, ts: r.ts,
    }));
  },
  clear(channelId?: number) {
    if (typeof channelId === 'number') getDb().prepare('DELETE FROM logs WHERE channel_id=?').run(channelId);
    else getDb().prepare('DELETE FROM logs').run();
  },
  pruneOld(keepRows = 50000) {
    getDb().prepare('DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT ?)').run(keepRows);
  },
};

export const settingsRepo = {
  getAll(): AppSettings {
    const rows = getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const m = Object.fromEntries(rows.map(r => [r.key, r.value]));
    return {
      ffmpegPath: m.ffmpegPath || null,
      defaultOutputFolder: m.defaultOutputFolder || '',
      theme: (m.theme as 'dark' | 'light') || 'dark',
      autoUpdate: m.autoUpdate === 'true',
      maskSecrets: m.maskSecrets !== 'false',
    };
  },
  update(patch: Partial<AppSettings>): AppSettings {
    const ins = getDb().prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    const map: Record<string, string> = {};
    if (patch.ffmpegPath !== undefined) map.ffmpegPath = patch.ffmpegPath ?? '';
    if (patch.defaultOutputFolder !== undefined) map.defaultOutputFolder = patch.defaultOutputFolder;
    if (patch.theme !== undefined) map.theme = patch.theme;
    if (patch.autoUpdate !== undefined) map.autoUpdate = String(patch.autoUpdate);
    if (patch.maskSecrets !== undefined) map.maskSecrets = String(patch.maskSecrets);
    for (const [k, v] of Object.entries(map)) ins.run(k, v);
    return this.getAll();
  },
};

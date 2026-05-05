import React, { useState } from 'react';
import { useStore } from '../stores/store';
import { Modal } from '../components/Modal';
import type { ServerInput } from '@shared/types';

export function Servers() {
  const { servers, refreshServers } = useStore();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const onTest = async (id: number) => {
    setBusy(id); setResult(null);
    try {
      const r = await window.api.servers.test(id);
      setResult(`${r.ok ? '✓' : '✗'} ${r.message}`);
    } finally { setBusy(null); }
  };
  const onInstall = async (id: number) => {
    if (!confirm('This will install MediaMTX, FFmpeg dependencies, and open firewall ports if ufw is present. Continue?')) return;
    setBusy(id); setResult(null);
    try {
      const r = await window.api.servers.installMediaMtx(id);
      setResult(`${r.ok ? '✓ Installed.' : '✗ Install failed: ' + r.message}\nRTMP: ${r.rtmpPublishExample}\nHLS: ${r.hlsPlaybackExample}`);
      await refreshServers();
    } finally { setBusy(null); }
  };
  const onDelete = async (id: number) => {
    if (!confirm('Delete this server?')) return;
    await window.api.servers.delete(id); await refreshServers();
  };

  return (
    <div>
      <div className="toolbar">
        <div className="grow" />
        <button className="primary" onClick={() => setCreating(true)}>+ Add Server</button>
      </div>

      {result && <div className="card" style={{ marginBottom: 14 }}><pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>{result}</pre></div>}

      {servers.length === 0 ? (
        <div className="empty"><div className="title">No servers yet</div><div className="hint">Add a Linux VPS to push streams via RTMP and serve HLS.</div></div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="b4k">
            <thead><tr><th>Name</th><th>Host</th><th>Auth</th><th>Status</th><th>RTMP / HLS</th><th></th></tr></thead>
            <tbody>
              {servers.map(s => (
                <tr key={s.id}>
                  <td><div style={{ fontWeight: 600 }}>{s.name}</div><div style={{ fontSize: 11, color: 'var(--fg-2)' }}>{s.username}@{s.domain || s.host}:{s.port}</div></td>
                  <td>{s.host}</td>
                  <td><span className="tag">{s.authMethod}</span></td>
                  <td>{s.installed ? <span className="badge running"><span className="dot" />Installed</span> : <span className="badge stopped"><span className="dot" />Not installed</span>}</td>
                  <td>
                    {s.installed ? (
                      <>
                        <div className="code-pill">rtmp://{s.domain || s.host}:1935/live/&lt;slug&gt;</div>
                        <div className="code-pill" style={{ marginTop: 4 }}>http://{s.domain || s.host}:8888/&lt;slug&gt;/index.m3u8</div>
                      </>
                    ) : '—'}
                  </td>
                  <td className="actions">
                    <div className="row-actions">
                      <button className="sm" disabled={busy === s.id} onClick={() => onTest(s.id)}>Test</button>
                      <button className="primary sm" disabled={busy === s.id} onClick={() => onInstall(s.id)}>Install MediaMTX</button>
                      <button className="danger sm" onClick={() => onDelete(s.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && <ServerForm onClose={() => setCreating(false)} onSaved={async () => { setCreating(false); await refreshServers(); }} />}
    </div>
  );
}

function ServerForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<ServerInput>({
    name: '', host: '', port: 22, username: 'root', authMethod: 'password', password: '', privateKey: '', domain: '',
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true); setErr(null);
    try { await window.api.servers.create(data); onSaved(); }
    catch (e: any) { setErr(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  return (
    <Modal open title="Add Server" onClose={onClose} footer={
      <>
        {err && <span style={{ color: 'var(--red)', marginRight: 'auto', fontSize: 12 }}>{err}</span>}
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={saving || !data.name || !data.host || !data.username} onClick={save}>{saving ? 'Saving…' : 'Create'}</button>
      </>
    }>
      <div className="cols-2">
        <label className="field"><span>Name</span><input value={data.name} onChange={e => setData({ ...data, name: e.target.value })} /></label>
        <label className="field"><span>Domain (optional)</span><input value={data.domain ?? ''} onChange={e => setData({ ...data, domain: e.target.value })} placeholder="stream.example.com" /></label>
        <label className="field"><span>Host (IP or hostname)</span><input value={data.host} onChange={e => setData({ ...data, host: e.target.value })} /></label>
        <label className="field"><span>Port</span><input type="number" value={data.port} onChange={e => setData({ ...data, port: Number(e.target.value) })} /></label>
        <label className="field"><span>Username</span><input value={data.username} onChange={e => setData({ ...data, username: e.target.value })} /></label>
        <label className="field"><span>Auth</span>
          <select value={data.authMethod} onChange={e => setData({ ...data, authMethod: e.target.value as any })}>
            <option value="password">Password</option>
            <option value="key">Private Key</option>
          </select>
        </label>
      </div>
      {data.authMethod === 'password' ? (
        <label className="field"><span>Password</span><input type="password" value={data.password} onChange={e => setData({ ...data, password: e.target.value })} /></label>
      ) : (
        <label className="field"><span>Private Key (paste PEM)</span><textarea value={data.privateKey} onChange={e => setData({ ...data, privateKey: e.target.value })} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" /></label>
      )}
    </Modal>
  );
}

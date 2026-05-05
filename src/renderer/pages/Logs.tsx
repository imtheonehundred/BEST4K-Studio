import React, { useEffect, useState } from 'react';
import { useStore } from '../stores/store';

export function Logs() {
  const { channels, logs, refreshLogs } = useStore();
  const [channelId, setChannelId] = useState<number | ''>('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    void refreshLogs(channelId === '' ? undefined : Number(channelId), search || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, search]);

  const clear = async () => {
    if (!confirm('Clear all logs?' + (channelId ? ' (only this channel)' : ''))) return;
    await window.api.logs.clear(channelId === '' ? undefined : Number(channelId));
    await refreshLogs(channelId === '' ? undefined : Number(channelId), search || undefined);
  };

  return (
    <div>
      <div className="toolbar">
        <select value={channelId} onChange={e => setChannelId(e.target.value === '' ? '' : Number(e.target.value))} style={{ maxWidth: 240 }}>
          <option value="">All channels</option>
          {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="grow" />
        <button onClick={() => refreshLogs(channelId === '' ? undefined : Number(channelId), search || undefined)}>Refresh</button>
        <button className="danger" onClick={clear}>Clear</button>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table className="b4k">
          <thead><tr><th>Time</th><th>Channel</th><th>Level</th><th>Message</th></tr></thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--fg-2)', padding: 30 }}>No logs.</td></tr>
            ) : logs.map(l => {
              const ch = channels.find(c => c.id === l.channelId);
              return (
                <tr key={l.id}>
                  <td style={{ color: 'var(--fg-2)', fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{l.ts}</td>
                  <td>{ch?.name ?? '—'}</td>
                  <td><span className={`tag ${l.level === 'error' ? '' : 'blue'}`} style={{ color: l.level === 'error' ? 'var(--red)' : undefined }}>{l.level}</span></td>
                  <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }}>{l.message}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useStore } from '../stores/store';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { ChannelWizard } from './ChannelWizard';
import type { Channel } from '@shared/types';

export function Channels() {
  const { channels, stats, refreshChannels, refreshStats } = useStore();
  const [editing, setEditing] = useState<Channel | null>(null);
  const [creating, setCreating] = useState(false);

  const onStart = async (c: Channel) => {
    await window.api.channels.start(c.id);
    await refreshChannels();
    await refreshStats();
  };
  const onStop = async (c: Channel) => {
    await window.api.channels.stop(c.id);
    await refreshChannels();
    await refreshStats();
  };
  const onDelete = async (c: Channel) => {
    if (!confirm(`Delete channel "${c.name}"? This cannot be undone.`)) return;
    await window.api.channels.delete(c.id);
    await refreshChannels();
  };
  const onDuplicate = async (c: Channel) => {
    await window.api.channels.duplicate(c.id);
    await refreshChannels();
  };
  const onOpenLink = async (path: string) => { await window.api.system.openPath(path); };

  return (
    <div>
      <div className="toolbar">
        <div className="grow">
          <input placeholder="Search channels…" disabled title="Filtering coming next iteration" />
        </div>
        <button className="primary" onClick={() => setCreating(true)}>+ Add Channel</button>
      </div>

      {channels.length === 0 ? (
        <div className="empty">
          <div className="title">No channels yet</div>
          <div className="hint">Click "Add Channel" to create your first stream pipeline.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="b4k">
            <thead>
              <tr>
                <th>Name</th>
                <th>Input</th>
                <th>Output</th>
                <th>Status</th>
                <th>Generated Link</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {channels.map(c => {
                const s = stats[c.id];
                const status = s?.status ?? c.status;
                const link = s?.generatedLinks?.hls || s?.generatedLinks?.rtmp || s?.generatedLinks?.ts || '—';
                const running = status === 'running' || status === 'starting' || status === 'reconnecting';
                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--fg-2)' }}>{c.slug}</div>
                    </td>
                    <td>
                      <span className="tag">{c.inputType.toUpperCase()}</span>
                      <span style={{ fontSize: 11, color: 'var(--fg-2)' }}>{c.inputUrl.slice(0, 50)}{c.inputUrl.length > 50 ? '…' : ''}</span>
                    </td>
                    <td>
                      <span className="tag blue">{c.output.mode}</span>
                      <span className="tag">{c.processing.mode}</span>
                    </td>
                    <td><StatusBadge status={status} /></td>
                    <td>
                      {link !== '—' ? (
                        <span className="code-pill" title={link}>{link}</span>
                      ) : <span style={{ color: 'var(--fg-2)' }}>—</span>}
                    </td>
                    <td className="actions">
                      <div className="row-actions">
                        {!running ? (
                          <button className="primary sm" onClick={() => onStart(c)}>Start</button>
                        ) : (
                          <button className="danger sm" onClick={() => onStop(c)}>Stop</button>
                        )}
                        {link !== '—' && link.endsWith('.m3u8') && (
                          <button className="sm" onClick={() => onOpenLink(link.replace(/\/index\.m3u8$/, ''))}>Open</button>
                        )}
                        <button className="sm" onClick={() => setEditing(c)}>Edit</button>
                        <button className="sm" onClick={() => onDuplicate(c)}>Duplicate</button>
                        <button className="danger sm" onClick={() => onDelete(c)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <ChannelWizard
          existing={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={async () => { setCreating(false); setEditing(null); await refreshChannels(); }}
        />
      )}
    </div>
  );
}

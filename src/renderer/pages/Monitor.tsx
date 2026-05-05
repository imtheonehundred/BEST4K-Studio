import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../stores/store';

export function Monitor() {
  const { channels, stats } = useStore();
  const [selected, setSelected] = useState<number | null>(null);
  const [tail, setTail] = useState<{ ts: string; level: string; message: string }[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const off = window.api.on('log', (e: any) => {
      if (selected === null || e.channelId === selected) {
        setTail(prev => [...prev.slice(-200), e]);
      }
    });
    setTail([]);
    return off;
  }, [selected]);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [tail]);

  const running = channels.filter(c => {
    const s = stats[c.id]?.status ?? c.status;
    return s === 'running' || s === 'starting' || s === 'reconnecting';
  });

  return (
    <div className="cols-2">
      <div className="card">
        <h3>Live Processes</h3>
        {running.length === 0 ? (
          <div className="empty"><div className="title">No live processes</div><div className="hint">Start a channel to see live FFmpeg metrics.</div></div>
        ) : (
          <table className="b4k">
            <thead><tr><th>Channel</th><th>PID</th><th>FPS</th><th>Bitrate</th><th>Reconnects</th><th>Uptime</th><th></th></tr></thead>
            <tbody>
              {running.map(c => {
                const s = stats[c.id];
                const uptime = s?.uptimeMs ? formatUptime(s.uptimeMs) : '—';
                return (
                  <tr key={c.id} style={{ cursor: 'pointer', background: selected === c.id ? 'rgba(79,140,255,.05)' : undefined }} onClick={() => setSelected(c.id)}>
                    <td>{c.name}</td>
                    <td>{s?.pid ?? '—'}</td>
                    <td>{s?.lastFps?.toFixed(1) ?? '—'}</td>
                    <td>{s?.lastBitrateKbps?.toFixed(0) ?? '—'}</td>
                    <td>{s?.reconnectCount ?? 0}</td>
                    <td>{uptime}</td>
                    <td><button className="sm danger" onClick={(ev) => { ev.stopPropagation(); window.api.channels.stop(c.id); }}>Stop</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h3>Live FFmpeg Output {selected !== null && <span style={{ fontSize: 12, color: 'var(--fg-2)' }}>— filtered to channel #{selected}</span>}</h3>
        <div className="row" style={{ marginBottom: 8 }}>
          <button className="sm" onClick={() => setSelected(null)}>Show all</button>
          <button className="sm" onClick={() => setTail([])}>Clear</button>
        </div>
        <div className="log-stream" ref={ref}>
          {tail.length === 0 ? <div className="log-line debug">Waiting for output…</div> :
            tail.map((l, i) => <div key={i} className={`log-line ${l.level}`}>[{(l.ts || '').slice(11, 19)}] {l.message}</div>)}
        </div>
      </div>
    </div>
  );
}

function formatUptime(ms: number) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

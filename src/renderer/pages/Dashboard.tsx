import React, { useEffect, useState } from 'react';
import { useStore } from '../stores/store';

export function Dashboard() {
  const { channels, servers, stats, logs } = useStore();
  const [sys, setSys] = useState<any>(null);

  useEffect(() => {
    const tick = async () => setSys(await window.api.system.stats());
    void tick();
    const t = setInterval(tick, 3000);
    return () => clearInterval(t);
  }, []);

  const active = channels.filter(c => c.status === 'running' || c.status === 'starting').length;
  const stopped = channels.filter(c => c.status === 'stopped').length;
  const errored = channels.filter(c => c.status === 'error').length;
  const installed = servers.filter(s => s.installed).length;

  const memUsedPct = sys ? Math.max(0, Math.round((1 - sys.freeMemMB / sys.totalMemMB) * 100)) : null;

  return (
    <div>
      <div className="kpi-grid">
        <div className="card kpi green">
          <div className="label">Active Channels</div>
          <div className="value">{active}</div>
          <div className="sub">of {channels.length} total</div>
        </div>
        <div className="card kpi">
          <div className="label">Stopped</div>
          <div className="value">{stopped}</div>
          <div className="sub">idle channels</div>
        </div>
        <div className="card kpi red">
          <div className="label">Errored</div>
          <div className="value">{errored}</div>
          <div className="sub">need attention</div>
        </div>
        <div className="card kpi blue">
          <div className="label">Servers Installed</div>
          <div className="value">{installed}</div>
          <div className="sub">of {servers.length} VPS connected</div>
        </div>
        <div className="card kpi gold">
          <div className="label">CPU Cores</div>
          <div className="value">{sys?.cpus ?? '—'}</div>
          <div className="sub">load: {sys?.loadAvg?.[0]?.toFixed(2) ?? '—'}</div>
        </div>
        <div className="card kpi">
          <div className="label">Memory</div>
          <div className="value">{memUsedPct !== null ? `${memUsedPct}%` : '—'}</div>
          <div className="sub">{sys ? `${(sys.totalMemMB - sys.freeMemMB) | 0} / ${sys.totalMemMB} MB` : 'collecting…'}</div>
        </div>
      </div>

      <div className="spacer" />
      <div className="cols-2">
        <div className="card">
          <h3>Live Channel Stats</h3>
          {Object.values(stats).length === 0 ? (
            <div className="empty"><div className="title">No active channels</div><div className="hint">Start a channel from the Channels page.</div></div>
          ) : (
            <table className="b4k">
              <thead><tr><th>Channel</th><th>Status</th><th>FPS</th><th>Bitrate</th><th>Reconnects</th></tr></thead>
              <tbody>
                {Object.values(stats).map(s => {
                  const c = channels.find(x => x.id === s.channelId);
                  return (
                    <tr key={s.channelId}>
                      <td>{c?.name ?? `#${s.channelId}`}</td>
                      <td>{s.status}</td>
                      <td>{s.lastFps?.toFixed(1) ?? '—'}</td>
                      <td>{s.lastBitrateKbps ? `${s.lastBitrateKbps.toFixed(0)} kbps` : '—'}</td>
                      <td>{s.reconnectCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3>Recent Logs</h3>
          <div className="log-stream">
            {logs.length === 0
              ? <div className="log-line debug">No recent logs.</div>
              : logs.slice(0, 100).map(l => (
                  <div key={l.id ?? `${l.ts}-${Math.random()}`} className={`log-line ${l.level}`}>
                    [{(l.ts || '').slice(11, 19)}] {l.message}
                  </div>
                ))}
          </div>
        </div>
      </div>
    </div>
  );
}

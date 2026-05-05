import React from 'react';
import { useStore } from '../stores/store';

export function Profiles() {
  const { profiles } = useStore();
  return (
    <div>
      <div className="toolbar">
        <div className="grow" />
        <button disabled title="Custom profile creation arrives in Phase 5">+ Custom Profile</button>
      </div>
      <div className="kpi-grid">
        {profiles.map(p => (
          <div key={p.id} className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>{p.name}</h3>
              {p.builtin && <span className="tag gold">Built-in</span>}
            </div>
            <div style={{ color: 'var(--fg-1)', fontSize: 12, margin: '8px 0 12px' }}>{p.description}</div>
            <pre style={{ background: '#04060a', borderRadius: 6, padding: 8, fontSize: 11, color: 'var(--fg-1)', margin: 0 }}>
              {JSON.stringify(p.config, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

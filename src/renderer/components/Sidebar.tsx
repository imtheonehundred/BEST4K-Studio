import React from 'react';
import logoUrl from '../assets/logo.png';

export type Page = 'dashboard' | 'channels' | 'servers' | 'profiles' | 'monitor' | 'logs' | 'settings';

const ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◆' },
  { id: 'channels', label: 'Channels', icon: '⛁' },
  { id: 'servers', label: 'Servers', icon: '☁' },
  { id: 'profiles', label: 'Profiles', icon: '✦' },
  { id: 'monitor', label: 'Monitor', icon: '◉' },
  { id: 'logs', label: 'Logs', icon: '≡' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

interface Props {
  current: Page;
  onChange: (p: Page) => void;
}

export function Sidebar({ current, onChange }: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <img src={logoUrl} alt="BEST4K Studio" className="brand-logo" />
        <div className="tag">Premium Streaming Suite</div>
      </div>
      <nav className="nav">
        {ITEMS.map(item => (
          <div
            key={item.id}
            className={`item ${current === item.id ? 'active' : ''}`}
            onClick={() => onChange(item.id)}
          >
            <span className="ico">{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </nav>
      <div className="footer">v0.1.0 — Phase 1+2</div>
    </aside>
  );
}

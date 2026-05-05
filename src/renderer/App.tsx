import React, { useEffect, useState } from 'react';
import { Sidebar, Page } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Channels } from './pages/Channels';
import { Servers } from './pages/Servers';
import { Profiles } from './pages/Profiles';
import { Monitor } from './pages/Monitor';
import { Logs } from './pages/Logs';
import { Settings } from './pages/Settings';
import { useStore } from './stores/store';

const TITLES: Record<Page, string> = {
  dashboard: 'Dashboard',
  channels: 'Channels',
  servers: 'Servers',
  profiles: 'Profiles',
  monitor: 'Monitor',
  logs: 'Logs',
  settings: 'Settings',
};

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const store = useStore();

  useEffect(() => {
    if (store.settings?.theme) {
      document.documentElement.dataset.theme = store.settings.theme;
    }
  }, [store.settings?.theme]);

  useEffect(() => {
    void store.refreshChannels();
    void store.refreshServers();
    void store.refreshProfiles();
    void store.refreshSettings();
    void store.refreshFfmpeg();
    void store.refreshStats();

    const off1 = window.api.on('channelStatus', e => {
      store.applyStatusEvent(e);
      void store.refreshStats();
    });
    const off2 = window.api.on('stats', e => store.applyStatsEvent(e));
    const off3 = window.api.on('log', e => store.applyLogEvent(e));

    const t = setInterval(() => { void store.refreshStats(); }, 2000);
    return () => { off1(); off2(); off3(); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      <Sidebar current={page} onChange={setPage} />
      <main className="main">
        <header className="topbar">
          <h1>{TITLES[page]}</h1>
          <div className="actions">
            <span className="tag blue">{store.ffmpegInfo?.path ? `FFmpeg ${store.ffmpegInfo.version || 'detected'}` : 'FFmpeg not found'}</span>
          </div>
        </header>
        <div className="content">
          {page === 'dashboard' && <Dashboard />}
          {page === 'channels' && <Channels />}
          {page === 'servers' && <Servers />}
          {page === 'profiles' && <Profiles />}
          {page === 'monitor' && <Monitor />}
          {page === 'logs' && <Logs />}
          {page === 'settings' && <Settings />}
        </div>
      </main>
    </div>
  );
}

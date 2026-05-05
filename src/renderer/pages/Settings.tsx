import React, { useState } from 'react';
import { useStore } from '../stores/store';

export function Settings() {
  const { settings, ffmpegInfo, refreshSettings, refreshFfmpeg } = useStore();
  const [pickedFfmpeg, setPickedFfmpeg] = useState<string>('');

  if (!settings) return <div className="empty">Loading…</div>;

  const update = async (patch: any) => { await window.api.settings.update(patch); await refreshSettings(); };

  const pickFfmpeg = async () => {
    const p = await window.api.system.pickFile([{ name: 'FFmpeg', extensions: ['exe', ''] }]);
    if (p) {
      setPickedFfmpeg(p);
      await window.api.ffmpeg.setPath(p);
      await refreshSettings();
      await refreshFfmpeg();
    }
  };

  const pickFolder = async () => {
    const p = await window.api.system.pickFolder();
    if (p) await update({ defaultOutputFolder: p });
  };

  return (
    <div className="cols-2">
      <div className="card">
        <h3>FFmpeg</h3>
        <div className="row" style={{ marginBottom: 10 }}>
          <input value={settings.ffmpegPath || pickedFfmpeg || ''} placeholder="(auto-detected)" readOnly />
          <button onClick={pickFfmpeg}>Browse…</button>
          <button onClick={refreshFfmpeg}>Re-detect</button>
        </div>
        <div className="note">
          {ffmpegInfo?.path ? `✓ Found: ${ffmpegInfo.path} (${ffmpegInfo.version || 'unknown version'})` : '⚠ Not found. Install FFmpeg or set the path manually.'}
        </div>
      </div>

      <div className="card">
        <h3>Output</h3>
        <label className="field"><span>Default Output Folder</span>
          <div className="row">
            <input value={settings.defaultOutputFolder} onChange={e => update({ defaultOutputFolder: e.target.value })} />
            <button onClick={pickFolder}>Browse…</button>
          </div>
        </label>
      </div>

      <div className="card">
        <h3>Appearance</h3>
        <label className="field"><span>Theme</span>
          <select value={settings.theme} onChange={e => update({ theme: e.target.value })}>
            <option value="dark">Dark (default)</option>
            <option value="light" disabled>Light (coming later)</option>
          </select>
        </label>
      </div>

      <div className="card">
        <h3>Privacy & Updates</h3>
        <label className="field"><span>Auto-update</span>
          <select value={String(settings.autoUpdate)} onChange={e => update({ autoUpdate: e.target.value === 'true' })} disabled title="Auto-updater is wired in Phase 5">
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </label>
        <label className="field"><span>Mask secrets in UI/logs</span>
          <select value={String(settings.maskSecrets)} onChange={e => update({ maskSecrets: e.target.value === 'true' })}>
            <option value="true">Always</option>
            <option value="false">Never (not recommended)</option>
          </select>
        </label>
      </div>
    </div>
  );
}

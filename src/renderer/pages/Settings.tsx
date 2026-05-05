import React, { useEffect, useState } from 'react';
import { useStore } from '../stores/store';

export function Settings() {
  const { settings, ffmpegInfo, refreshSettings, refreshFfmpeg } = useStore();
  const [pickedFfmpeg, setPickedFfmpeg] = useState<string>('');
  const [encoders, setEncoders] = useState<any>(null);
  const [updateState, setUpdateState] = useState<{ checking?: boolean; status?: string; version?: string; percent?: number; error?: string }>({});

  useEffect(() => { void window.api.ffmpeg.encoders().then(setEncoders); }, [ffmpegInfo?.path]);
  useEffect(() => {
    const off = window.api.on('updater', (e: any) => {
      if (e.type === 'checking') setUpdateState({ checking: true, status: 'Checking…' });
      else if (e.type === 'available') setUpdateState({ status: 'available', version: e.version });
      else if (e.type === 'none') setUpdateState({ status: 'none' });
      else if (e.type === 'progress') setUpdateState(s => ({ ...s, status: 'downloading', percent: e.percent }));
      else if (e.type === 'downloaded') setUpdateState({ status: 'downloaded', version: e.version });
      else if (e.type === 'error') setUpdateState({ status: 'error', error: e.message });
    });
    return off;
  }, []);

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
            <option value="light">Light</option>
          </select>
        </label>
      </div>

      <div className="card">
        <h3>Hardware Encoders</h3>
        {encoders ? (
          <>
            <div className="row wrap" style={{ marginBottom: 8 }}>
              {encoders.available.map((e: string) => (
                <span key={e} className={`tag ${e === encoders.preferred ? 'gold' : ''}`}>{e}{e === encoders.preferred ? ' (auto)' : ''}</span>
              ))}
            </div>
            <div className="note">
              When the channel encoder is set to <code>auto</code>, the channel uses <code>{encoders.preferred}</code>.
              {encoders.hardware.length === 0 && ' No hardware encoders detected — falls back to libx264 (CPU).'}
            </div>
          </>
        ) : <div className="note">Detecting…</div>}
      </div>

      <div className="card">
        <h3>Updates</h3>
        <div className="row" style={{ marginBottom: 10 }}>
          <button onClick={async () => { setUpdateState({ checking: true, status: 'Checking…' }); await window.api.updater.check(); }}
            disabled={updateState.checking}>Check for updates</button>
          {updateState.status === 'available' && (
            <button className="primary" onClick={async () => {
              const r = await window.api.updater.download();
              if (!r.ok) setUpdateState({ status: 'error', error: r.message });
            }}>Download {updateState.version}</button>
          )}
          {updateState.status === 'downloaded' && (
            <button className="gold" onClick={async () => {
              const r = await window.api.updater.install();
              if (!r.ok) setUpdateState({ status: 'error', error: r.message });
            }}>Install &amp; Restart</button>
          )}
        </div>
        {updateState.status === 'none' && <div className="note">You're on the latest version.</div>}
        {updateState.status === 'available' && <div className="note">Version {updateState.version} is available.</div>}
        {updateState.status === 'downloading' && <div className="note">Downloading… {updateState.percent?.toFixed(1)}%</div>}
        {updateState.status === 'downloaded' && <div className="note">{updateState.version} downloaded — ready to install. Stop running channels first.</div>}
        {updateState.status === 'error' && <div className="note error">{updateState.error}</div>}
      </div>

      <div className="card">
        <h3>Privacy</h3>
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

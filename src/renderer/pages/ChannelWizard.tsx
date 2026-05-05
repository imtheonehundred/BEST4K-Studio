import React, { useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import type { Channel, ChannelInput, ClearKeyPair, DrmKind, InputType, OutputMode } from '@shared/types';
import { parseClearKeyText } from '@shared/clearkey';
import { useStore } from '../stores/store';

const TABS = ['General', 'Input', 'Headers/Auth', 'DRM', 'Processing', 'Output', 'Server Push', 'Review'] as const;
type Tab = typeof TABS[number];

interface Props {
  existing: Channel | null;
  onClose: () => void;
  onSaved: () => void;
}

const emptyInput = (): ChannelInput => ({
  slug: '',
  name: '',
  inputType: 'hls',
  inputUrl: '',
  failoverUrls: [],
  headers: { custom: {} },
  drm: { kind: 'none' },
  processing: { mode: 'copy', scale: 'source', encoder: 'auto' },
  output: { mode: 'hls_local', hlsTime: 3, hlsListSize: 6 },
  serverId: null,
});

export function ChannelWizard({ existing, onClose, onSaved }: Props) {
  const { servers } = useStore();
  const [tab, setTab] = useState<Tab>('General');
  const [data, setData] = useState<ChannelInput>(() => existing ? toInput(existing) : emptyInput());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [clearKeyText, setClearKeyText] = useState('');
  const [clearKeyErrors, setClearKeyErrors] = useState<string[]>([]);

  const set = <K extends keyof ChannelInput>(key: K, value: ChannelInput[K]) => setData(d => ({ ...d, [key]: value }));

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      if (existing) await window.api.channels.update(existing.id, data);
      else await window.api.channels.create(data);
      onSaved();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };


  return (
    <Modal open title={existing ? `Edit Channel: ${existing.name}` : 'Add Channel'} onClose={onClose}
      footer={
        <>
          {error && <span style={{ color: 'var(--red)', marginRight: 'auto', fontSize: 12 }}>{error}</span>}
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={saving || !data.slug || !data.name || !data.inputUrl} onClick={submit}>
            {saving ? 'Saving…' : (existing ? 'Save' : 'Create')}
          </button>
        </>
      }>
      <div className="tabs" style={{ padding: 0, marginBottom: 16 }}>
        {TABS.map(t => (
          <div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</div>
        ))}
      </div>

      {tab === 'General' && (
        <div className="cols-2">
          <label className="field"><span>Name</span>
            <input value={data.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Sports HD 720p" />
          </label>
          <label className="field"><span>Slug</span>
            <input value={data.slug} onChange={e => set('slug', e.target.value.replace(/[^a-z0-9_-]/gi, '_'))} placeholder="sports_hd" />
          </label>
        </div>
      )}

      {tab === 'Input' && (
        <div>
          <div className="cols-2">
            <label className="field"><span>Type</span>
              <select value={data.inputType} onChange={e => set('inputType', e.target.value as InputType)}>
                <option value="hls">HLS (m3u8)</option>
                <option value="mpegts">MPEG-TS URL</option>
                <option value="rtmp">RTMP</option>
                <option value="rtsp">RTSP</option>
                <option value="mp4">MP4 file</option>
                <option value="dash">DASH (mpd)</option>
              </select>
            </label>
            <label className="field"><span>Source URL</span>
              <input value={data.inputUrl} onChange={e => set('inputUrl', e.target.value)} placeholder="https://example.com/stream.m3u8" />
            </label>
          </div>
          <label className="field"><span>Failover URLs (one per line, used in rotation on disconnect)</span>
            <textarea value={(data.failoverUrls || []).join('\n')}
              onChange={e => set('failoverUrls', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))} />
          </label>
        </div>
      )}

      {tab === 'Headers/Auth' && (
        <div>
          <div className="cols-2">
            <label className="field"><span>User-Agent</span>
              <input value={data.headers?.userAgent ?? ''} onChange={e => set('headers', { ...data.headers, userAgent: e.target.value })} />
            </label>
            <label className="field"><span>Referer</span>
              <input value={data.headers?.referer ?? ''} onChange={e => set('headers', { ...data.headers, referer: e.target.value })} />
            </label>
            <label className="field"><span>Origin</span>
              <input value={data.headers?.origin ?? ''} onChange={e => set('headers', { ...data.headers, origin: e.target.value })} />
            </label>
            <label className="field"><span>Authorization</span>
              <input value={data.headers?.authorization ?? ''} onChange={e => set('headers', { ...data.headers, authorization: e.target.value })} placeholder="Bearer ey…" />
            </label>
          </div>
          <label className="field"><span>Cookie</span>
            <input value={data.headers?.cookie ?? ''} onChange={e => set('headers', { ...data.headers, cookie: e.target.value })} placeholder="key=value; key2=value2" />
          </label>
          <div className="note">Secrets are masked in logs and stored encrypted at rest.</div>
        </div>
      )}

      {tab === 'DRM' && (
        <div>
          <label className="field"><span>DRM Type</span>
            <select value={data.drm?.kind ?? 'none'} onChange={e => set('drm', { ...data.drm, kind: e.target.value as DrmKind })}>
              <option value="none">None</option>
              <option value="clearkey">ClearKey (KID:KEY)</option>
              <option value="widevine">Widevine</option>
              <option value="playready">PlayReady</option>
            </select>
          </label>

          {data.drm?.kind === 'clearkey' && (
            <KeyPairEditor
              keys={data.drm.clearkey ?? []}
              onChange={keys => set('drm', { ...data.drm, kind: 'clearkey', clearkey: keys })}
              text={clearKeyText} setText={setClearKeyText}
              errors={clearKeyErrors} setErrors={setClearKeyErrors}
              footnote="First key is passed to FFmpeg via -decryption_key for inline DASH/CENC decryption."
            />
          )}

          {data.drm?.kind === 'widevine' && (
            <>
              <div className="note warn">
                <strong>Authorized use only.</strong> BEST4K Studio does <em>not</em> bypass Widevine.
                You may paste raw KID:KEY pairs you obtained legitimately (your own license server,
                test content, partner feed) — they decrypt CENC bytes the same way ClearKey does.
                Runtime license-server integration is Phase 5.
              </div>
              <KeyPairEditor
                keys={data.drm.widevine?.keys ?? []}
                onChange={keys => set('drm', { ...data.drm, kind: 'widevine', widevine: { ...data.drm?.widevine, keys } })}
                text={clearKeyText} setText={setClearKeyText}
                errors={clearKeyErrors} setErrors={setClearKeyErrors}
                footnote="First key is passed to FFmpeg via -decryption_key."
              />
              <div className="cols-2" style={{ marginTop: 12 }}>
                <label className="field"><span>License URL (Phase 5)</span>
                  <input value={data.drm.widevine?.licenseUrl ?? ''}
                    onChange={e => set('drm', { ...data.drm, kind: 'widevine', widevine: { ...data.drm?.widevine, licenseUrl: e.target.value } })}
                    placeholder="https://license.example.com/widevine" />
                </label>
              </div>
            </>
          )}

          {data.drm?.kind === 'playready' && (
            <>
              <div className="note warn">
                <strong>Authorized use only.</strong> Same model as Widevine — paste raw KID:KEY pairs
                if you've obtained them legitimately. License-acquisition is Phase 5.
              </div>
              <KeyPairEditor
                keys={data.drm.playready?.keys ?? []}
                onChange={keys => set('drm', { ...data.drm, kind: 'playready', playready: { ...data.drm?.playready, keys } })}
                text={clearKeyText} setText={setClearKeyText}
                errors={clearKeyErrors} setErrors={setClearKeyErrors}
                footnote="First key is passed to FFmpeg via -decryption_key."
              />
              <div className="cols-2" style={{ marginTop: 12 }}>
                <label className="field"><span>License URL (Phase 5)</span>
                  <input value={data.drm.playready?.licenseUrl ?? ''}
                    onChange={e => set('drm', { ...data.drm, kind: 'playready', playready: { ...data.drm?.playready, licenseUrl: e.target.value } })}
                    placeholder="https://license.example.com/playready" />
                </label>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'Processing' && (
        <div>
          <div className="cols-2">
            <label className="field"><span>Mode</span>
              <select value={data.processing.mode} onChange={e => set('processing', { ...data.processing, mode: e.target.value as any })}>
                <option value="copy">Copy (no re-encode)</option>
                <option value="transcode">Transcode</option>
              </select>
            </label>
            <label className="field"><span>Scale</span>
              <select value={data.processing.scale ?? 'source'} disabled={data.processing.mode === 'copy'}
                onChange={e => set('processing', { ...data.processing, scale: e.target.value as any })}>
                <option value="source">Source</option>
                <option value="720p">720p</option>
                <option value="480p">480p</option>
              </select>
            </label>
            <label className="field"><span>Encoder</span>
              <select value={data.processing.encoder ?? 'auto'} disabled={data.processing.mode === 'copy'}
                onChange={e => set('processing', { ...data.processing, encoder: e.target.value as any })}>
                <option value="auto">Auto (libx264 fallback)</option>
                <option value="libx264">libx264 (CPU)</option>
                <option value="h264_nvenc">NVENC (NVIDIA)</option>
                <option value="h264_qsv">QSV (Intel)</option>
                <option value="h264_amf">AMF (AMD)</option>
              </select>
            </label>
            <label className="field"><span>Video Bitrate</span>
              <input value={data.processing.videoBitrate ?? ''} disabled={data.processing.mode === 'copy'}
                onChange={e => set('processing', { ...data.processing, videoBitrate: e.target.value })} placeholder="2500k" />
            </label>
            <label className="field"><span>Audio Bitrate</span>
              <input value={data.processing.audioBitrate ?? ''} disabled={data.processing.mode === 'copy'}
                onChange={e => set('processing', { ...data.processing, audioBitrate: e.target.value })} placeholder="128k" />
            </label>
            <label className="field"><span>Text Watermark</span>
              <input value={data.processing.textWatermark ?? ''} disabled={data.processing.mode === 'copy'}
                onChange={e => set('processing', { ...data.processing, textWatermark: e.target.value })} placeholder="© BEST4K" />
            </label>
          </div>
          <div className="note">Logo overlay & blur boxes require Transcode mode and are wired in Phase 5.</div>
        </div>
      )}

      {tab === 'Output' && (
        <div>
          <label className="field"><span>Output Mode</span>
            <select value={data.output.mode} onChange={e => set('output', { ...data.output, mode: e.target.value as OutputMode })}>
              <option value="hls_local">Local HLS (.m3u8)</option>
              <option value="rtmp_push">RTMP Push (to server)</option>
              <option value="mpegts_local">MPEG-TS UDP</option>
            </select>
          </label>
          {data.output.mode === 'hls_local' && (
            <div className="cols-2">
              <label className="field"><span>HLS segment time (s)</span>
                <input type="number" value={data.output.hlsTime ?? 3} onChange={e => set('output', { ...data.output, hlsTime: Number(e.target.value) })} />
              </label>
              <label className="field"><span>HLS list size</span>
                <input type="number" value={data.output.hlsListSize ?? 6} onChange={e => set('output', { ...data.output, hlsListSize: Number(e.target.value) })} />
              </label>
              <label className="field" style={{ gridColumn: '1 / -1' }}><span>Output folder (optional, defaults to app folder)</span>
                <div className="row">
                  <input value={data.output.outputFolder ?? ''} onChange={e => set('output', { ...data.output, outputFolder: e.target.value })} placeholder="(default)" />
                  <button className="sm" onClick={async () => { const p = await window.api.system.pickFolder(); if (p) set('output', { ...data.output, outputFolder: p }); }}>Browse…</button>
                </div>
              </label>
            </div>
          )}
          {data.output.mode === 'rtmp_push' && (
            <div className="cols-2">
              <label className="field"><span>RTMP URL</span>
                <input value={data.output.rtmpUrl ?? ''} onChange={e => set('output', { ...data.output, rtmpUrl: e.target.value })} placeholder="rtmp://host/live" />
              </label>
              <label className="field"><span>Stream Key (appended)</span>
                <input value={data.output.rtmpKey ?? ''} onChange={e => set('output', { ...data.output, rtmpKey: e.target.value })} placeholder="channel_slug" />
              </label>
            </div>
          )}
          {data.output.mode === 'mpegts_local' && (
            <label className="field"><span>UDP Port</span>
              <input type="number" value={data.output.mpegtsPort ?? 9000} onChange={e => set('output', { ...data.output, mpegtsPort: Number(e.target.value) })} />
            </label>
          )}
        </div>
      )}

      {tab === 'Server Push' && (
        <div>
          <label className="field"><span>Push Target Server</span>
            <select value={data.serverId ?? ''} onChange={e => set('serverId', e.target.value ? Number(e.target.value) : null)}>
              <option value="">None (local output only)</option>
              {servers.map(s => <option key={s.id} value={s.id}>{s.name} — {s.host}{s.installed ? ' ✓' : ''}</option>)}
            </select>
          </label>
          {data.serverId && (
            <div className="note">When Output mode is RTMP Push, leave the URL blank to auto-fill from this server. (Auto-fill arrives in Phase 3 wiring.)</div>
          )}
        </div>
      )}

      {tab === 'Review' && (
        <div>
          <pre style={{ background: 'var(--log-bg)', padding: 14, borderRadius: 8, fontSize: 12, color: 'var(--fg-1)', overflow: 'auto', border: '1px solid var(--line)' }}>
{JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </Modal>
  );
}

function toInput(c: Channel): ChannelInput {
  return {
    slug: c.slug, name: c.name, inputType: c.inputType, inputUrl: c.inputUrl,
    failoverUrls: c.failoverUrls ?? [], headers: c.headers ?? {}, drm: c.drm ?? { kind: 'none' },
    processing: c.processing, output: c.output, serverId: c.serverId ?? null,
  };
}

interface KeyPairEditorProps {
  keys: ClearKeyPair[];
  onChange: (keys: ClearKeyPair[]) => void;
  text: string; setText: (s: string) => void;
  errors: string[]; setErrors: (e: string[]) => void;
  footnote: string;
}

function KeyPairEditor({ keys, onChange, text, setText, errors, setErrors, footnote }: KeyPairEditorProps) {
  const parse = () => {
    const r = parseClearKeyText(text);
    setErrors(r.errors);
    if (r.ok.length) onChange(r.ok);
  };
  const removeAt = (i: number) => onChange(keys.filter((_, idx) => idx !== i));
  return (
    <>
      <label className="field"><span>Paste KID:KEY pairs</span>
        <textarea value={text} onChange={e => setText(e.target.value)}
          placeholder={'kid:key\nkid=key\nor JSON: {"keys":[{"kid":"...","k":"..."}]}'} />
      </label>
      <div className="row">
        <button className="sm primary" onClick={parse}>Parse</button>
        {keys.length > 0 && <button className="sm danger" onClick={() => onChange([])}>Clear all</button>}
      </div>
      {errors.length > 0 && <div className="note error" style={{ marginTop: 10 }}>{errors.join(' • ')}</div>}
      {keys.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <table className="b4k">
            <thead><tr><th>KID</th><th>KEY (masked)</th><th></th></tr></thead>
            <tbody>
              {keys.map((p, i) => (
                <tr key={i}>
                  <td><code>{p.kid}</code></td>
                  <td><code>{p.key.slice(0, 4)}…{p.key.slice(-2)}</code></td>
                  <td className="actions"><button className="sm danger" onClick={() => removeAt(i)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="note" style={{ marginTop: 10 }}>{footnote} Use only with content you are authorized to decrypt.</div>
    </>
  );
}

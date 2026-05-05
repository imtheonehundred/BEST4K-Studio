// Thin ssh2 wrapper for testing connections and running install scripts.
import { Client, ConnectConfig } from 'ssh2';
import type { Server } from '@shared/types';

export interface RunResult {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}

function buildConnectConfig(server: Server): ConnectConfig {
  const cfg: ConnectConfig = {
    host: server.host,
    port: server.port || 22,
    username: server.username,
    readyTimeout: 15000,
  };
  if (server.authMethod === 'password') cfg.password = server.password;
  else cfg.privateKey = server.privateKey;
  return cfg;
}

export function connect(server: Server): Promise<Client> {
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on('ready', () => resolve(c));
    c.on('error', err => reject(err));
    c.connect(buildConnectConfig(server));
  });
}

export function runRemote(client: Client, command: string): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = '', stderr = '';
      stream.on('data', (d: Buffer) => { stdout += d.toString(); });
      stream.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      stream.on('close', (code: number | null, signal: string | null) => {
        resolve({ code, signal, stdout, stderr });
      });
    });
  });
}

export async function testConnection(server: Server): Promise<{ ok: boolean; message: string }> {
  let client: Client | null = null;
  try {
    client = await connect(server);
    const r = await runRemote(client, 'uname -a; whoami');
    if ((r.code ?? 0) === 0) return { ok: true, message: r.stdout.trim() };
    return { ok: false, message: r.stderr || `exit ${r.code}` };
  } catch (e: any) {
    return { ok: false, message: e.message || String(e) };
  } finally {
    try { client?.end(); } catch {}
  }
}

// Minimal MediaMTX install script (Linux). The script body is sent verbatim to
// the remote shell via JSON.stringify-quoted bash -lc; user input never enters it.
export const MEDIA_MTX_INSTALL_SCRIPT = `
set -e
MTX_VER="1.9.3"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) ARCH=amd64 ;;
  aarch64) ARCH=arm64v8 ;;
  *) echo "unsupported arch: $ARCH"; exit 2 ;;
esac
sudo mkdir -p /opt/mediamtx /etc/mediamtx
cd /tmp
curl -fsSL -o mediamtx.tgz "https://github.com/bluenviron/mediamtx/releases/download/v\${MTX_VER}/mediamtx_v\${MTX_VER}_linux_\${ARCH}.tar.gz"
tar -xzf mediamtx.tgz
sudo mv mediamtx /usr/local/bin/mediamtx
sudo chmod +x /usr/local/bin/mediamtx
sudo tee /etc/mediamtx/mediamtx.yml >/dev/null <<'YML'
rtmp: yes
rtmpAddress: :1935
hls: yes
hlsAddress: :8888
hlsAlwaysRemux: yes
paths:
  all_others:
YML
sudo tee /etc/systemd/system/mediamtx.service >/dev/null <<'SVC'
[Unit]
Description=MediaMTX
After=network.target
[Service]
ExecStart=/usr/local/bin/mediamtx /etc/mediamtx/mediamtx.yml
Restart=always
RestartSec=2
[Install]
WantedBy=multi-user.target
SVC
sudo systemctl daemon-reload
sudo systemctl enable --now mediamtx
if command -v ufw >/dev/null 2>&1; then sudo ufw allow 1935/tcp || true; sudo ufw allow 8888/tcp || true; fi
echo "MEDIA_MTX_INSTALL_OK"
`;

export async function installMediaMtx(server: Server): Promise<{ ok: boolean; message: string }> {
  let client: Client | null = null;
  try {
    client = await connect(server);
    const r = await runRemote(client, `bash -lc ${JSON.stringify(MEDIA_MTX_INSTALL_SCRIPT)}`);
    const ok = r.stdout.includes('MEDIA_MTX_INSTALL_OK');
    return { ok, message: ok ? 'Installed.' : (r.stderr || r.stdout || `exit ${r.code}`) };
  } catch (e: any) {
    return { ok: false, message: e.message };
  } finally {
    try { client?.end(); } catch {}
  }
}

export function rtmpPublishUrl(server: Server, channelSlug: string): string {
  const host = server.domain || server.host;
  return `rtmp://${host}:1935/live/${channelSlug}`;
}
export function hlsPlaybackUrl(server: Server, channelSlug: string): string {
  const host = server.domain || server.host;
  return `http://${host}:8888/${channelSlug}/index.m3u8`;
}

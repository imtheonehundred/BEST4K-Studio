// Mask secrets in arbitrary strings (logs, command lines).

const SENSITIVE_KEYS = [
  'cookie', 'authorization', 'auth', 'token', 'key', 'secret',
  'password', 'pass', 'session', 'sid', 'access_token',
];

export function maskString(s: string): string {
  if (!s) return s;
  let out = s;
  // hex 32+ -> redact
  out = out.replace(/\b[0-9a-fA-F]{32,}\b/g, m => m.slice(0, 4) + '…' + m.slice(-2));
  // url params with sensitive keys
  out = out.replace(/([?&;])((?:[^=&]*?)(?:token|auth|key|cookie|sid|password|secret)[^=&]*?)=([^&\s]+)/gi,
    (_, p1, p2, p3: string) => `${p1}${p2}=${p3.slice(0, 3)}…`);
  // Authorization: Bearer xxx
  out = out.replace(/(authorization\s*:\s*\S+\s+)(\S+)/gi, (_, p1, p2: string) => `${p1}${p2.slice(0, 4)}…`);
  // Cookie: ... long values
  out = out.replace(/(cookie\s*:\s*)([^\r\n]+)/gi, (_, p1, p2: string) => `${p1}${p2.slice(0, 12)}…`);
  return out;
}

export function maskHeaderValue(name: string, value: string): string {
  const lower = name.toLowerCase();
  if (SENSITIVE_KEYS.some(k => lower.includes(k))) {
    if (!value) return '';
    return value.slice(0, 4) + '…' + (value.length > 8 ? value.slice(-2) : '');
  }
  return value;
}

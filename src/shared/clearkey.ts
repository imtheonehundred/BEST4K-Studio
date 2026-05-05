// Parses many ClearKey paste formats into normalized {kid,key} pairs.
import type { ClearKeyPair } from './types';

const HEX32 = /^[0-9a-fA-F]{32}$/;

export function parseClearKeyText(input: string): { ok: ClearKeyPair[]; errors: string[] } {
  const errors: string[] = [];
  const ok: ClearKeyPair[] = [];
  const trimmed = input.trim();
  if (!trimmed) return { ok, errors };

  // Try JSON first.
  try {
    const obj = JSON.parse(trimmed);
    if (obj && Array.isArray(obj.keys)) {
      for (const k of obj.keys) {
        const kid = (k.kid || k.k_id || '').replace(/-/g, '');
        const key = (k.k || k.key || '').replace(/-/g, '');
        if (HEX32.test(kid) && HEX32.test(key)) ok.push({ kid: kid.toLowerCase(), key: key.toLowerCase() });
        else errors.push(`Invalid pair: ${JSON.stringify(k)}`);
      }
      return { ok, errors };
    }
  } catch { /* not JSON */ }

  // Line-by-line: kid:key, kid=key, "kid key"
  const lines = trimmed.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const parts = line.split(/[:=\s]+/).map(p => p.replace(/-/g, ''));
    if (parts.length >= 2 && HEX32.test(parts[0]) && HEX32.test(parts[1])) {
      ok.push({ kid: parts[0].toLowerCase(), key: parts[1].toLowerCase() });
    } else {
      errors.push(`Invalid line: ${line}`);
    }
  }
  return { ok, errors };
}

export function clearKeyToFfmpegDecryptionKey(pair: ClearKeyPair): string {
  // ffmpeg's -decryption_key takes a single hex key. Multiple KIDs would need a JSON file.
  return pair.key;
}

import { safeStorage, app } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Uses Electron safeStorage when OS keychain is available; otherwise falls back
// to a local AES-256-GCM key kept in userData (not as strong, but encrypted-at-rest).

const FALLBACK_KEY_FILE = () => path.join(app.getPath('userData'), '.b4k-key');

function getFallbackKey(): Buffer {
  const file = FALLBACK_KEY_FILE();
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const key = crypto.randomBytes(32);
  fs.writeFileSync(file, key, { mode: 0o600 });
  return key;
}

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  if (safeStorage.isEncryptionAvailable()) {
    return 'safe:' + safeStorage.encryptString(plain).toString('base64');
  }
  const key = getFallbackKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'aes:' + Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(encoded: string): string {
  if (!encoded) return '';
  if (encoded.startsWith('safe:')) {
    if (!safeStorage.isEncryptionAvailable()) return '';
    return safeStorage.decryptString(Buffer.from(encoded.slice(5), 'base64'));
  }
  if (encoded.startsWith('aes:')) {
    const buf = Buffer.from(encoded.slice(4), 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const key = getFallbackKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
  return encoded;
}

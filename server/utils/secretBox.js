import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { nexusPath, writePrivateFileSync } from './paths.js';

/**
 * Local secret encryption.
 *
 * v2 format: `v2:<iv>:<tag>:<ciphertext>` encrypted with a random 256-bit master key stored in
 * `<NEXUSTERM_HOME>/master.key` (0600). The previous scheme derived the key from hostname + username,
 * which anyone could recompute; it is only kept to read legacy values (`<iv>:<tag>:<ciphertext>`).
 */

export const MASK = '••••••••';
const ALGORITHM = 'aes-256-gcm';
const LEGACY_SALTS = ['nexus_config_salt', 'nexus_salt'];

let cachedKey = null;
let cachedKeyPath = null;

function getMasterKey() {
  const keyPath = nexusPath('master.key');
  if (cachedKey && cachedKeyPath === keyPath) return cachedKey;

  let key = null;
  try {
    const hex = fs.readFileSync(keyPath, 'utf8').trim();
    if (/^[0-9a-f]{64}$/i.test(hex)) key = Buffer.from(hex, 'hex');
  } catch { /* created below */ }

  if (!key) {
    key = crypto.randomBytes(32);
    writePrivateFileSync(keyPath, key.toString('hex'));
  }
  cachedKey = key;
  cachedKeyPath = keyPath;
  return key;
}

function legacyKeys() {
  const secretInfo = os.hostname() + '_' + os.userInfo().username;
  return LEGACY_SALTS.map(salt => crypto.scryptSync(secretInfo, salt, 32));
}

function decipher(key, ivHex, tagHex, dataHex) {
  const d = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  d.setAuthTag(Buffer.from(tagHex, 'hex'));
  return d.update(dataHex, 'hex', 'utf8') + d.final('utf8');
}

export function encryptSecret(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv);
  const encrypted = cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
  return `v2:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted}`;
}

/** True when the value looks like something produced by encryptSecret (current or legacy format). */
export function isEncrypted(value) {
  if (typeof value !== 'string') return false;
  if (value.startsWith('v2:')) return value.split(':').length === 4;
  const parts = value.split(':');
  return parts.length === 3 && parts.every(p => /^[0-9a-f]+$/i.test(p));
}

/** True when a stored value uses the legacy, recomputable key and should be re-encrypted. */
export function isLegacyEncrypted(value) {
  return isEncrypted(value) && !value.startsWith('v2:');
}

/**
 * Decrypts a stored secret. Throws when the value is encrypted but cannot be decrypted
 * (e.g. master.key was lost or the file was copied from another machine).
 */
export function decryptSecret(value) {
  if (!value || !isEncrypted(value)) return value;

  if (value.startsWith('v2:')) {
    const [, iv, tag, data] = value.split(':');
    return decipher(getMasterKey(), iv, tag, data);
  }

  const [iv, tag, data] = value.split(':');
  for (const key of legacyKeys()) {
    try {
      return decipher(key, iv, tag, data);
    } catch { /* try next legacy key */ }
  }
  throw new Error('Failed to decrypt stored secret. The NexusTerm master key may have changed or the file came from another machine.');
}

/** Test helper: forget the cached master key (used when NEXUSTERM_HOME changes). */
export function _resetKeyCache() {
  cachedKey = null;
  cachedKeyPath = null;
}

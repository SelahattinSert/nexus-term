import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const CONFIG_DIR = path.join(os.homedir(), '.nexusterm');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const ALGORITHM = 'aes-256-gcm';
const getEncryptionKey = () => {
  const secretInfo = os.hostname() + '_' + os.userInfo().username;
  return crypto.scryptSync(secretInfo, 'nexus_config_salt', 32);
};

function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decrypt(hash) {
  if (!hash || !hash.includes(':')) return hash;
  try {
    const parts = hash.split(':');
    if (parts.length < 3) return hash; // Fallback for legacy plain text or malformed format
    const [ivHex, tagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // If decryption fails, assume plain text legacy or unencrypted
    return hash;
  }
}

const DEFAULT_CONFIG = {
  aiProvider: 'openai',
  apiKey: '',
  baseURL: 'https://api.openai.com/v1',
  model: 'gpt-3.5-turbo'
};

export async function readConfig(maskSecrets = true) {
  const rawConfig = await readRawConfig();
  if (maskSecrets && rawConfig.apiKey) {
    return {
      ...rawConfig,
      apiKey: '••••••••'
    };
  }
  return rawConfig;
}

export async function readRawConfig() {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    const parsed = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    if (parsed.apiKey) {
      parsed.apiKey = decrypt(parsed.apiKey);
    }
    return parsed;
  } catch (e) {
    if (e.code === 'ENOENT') {
      await fs.writeFile(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
      return DEFAULT_CONFIG;
    }
    console.error('Error reading config:', e);
    return DEFAULT_CONFIG;
  }
}

export async function writeConfig(config) {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    let rawCurrent = DEFAULT_CONFIG;
    try {
      const data = await fs.readFile(CONFIG_FILE, 'utf8');
      rawCurrent = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    } catch (e) {
      // Ignore read error
    }

    const newConfig = { ...rawCurrent, ...config };

    // Handle apiKey encryption and preservation if masked value received
    if (config.apiKey === '••••••••') {
      newConfig.apiKey = rawCurrent.apiKey; // Keep stored encrypted/raw key
    } else if (config.apiKey) {
      newConfig.apiKey = encrypt(config.apiKey);
    }

    await fs.writeFile(CONFIG_FILE, JSON.stringify(newConfig, null, 2), 'utf8');

    // Return masked config to client caller
    return {
      ...newConfig,
      apiKey: newConfig.apiKey ? '••••••••' : ''
    };
  } catch (err) {
    console.error('Error writing config:', err);
    throw err;
  }
}

import fs from 'fs/promises';
import { nexusPath, ensurePrivateDir, writePrivateFile } from './paths.js';
import { MASK, encryptSecret, decryptSecret, isLegacyEncrypted } from './secretBox.js';

const configFile = () => nexusPath('config.json');

const DEFAULT_CONFIG = {
  provider: '', // empty until the user configures an AI provider (the UI shows "unconfigured")
  apiKey: '',
  url: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  autoExecute: false,
  persistBlocks: true,
};

/** Migrates keys written by older versions (aiProvider/baseURL were never read by the services). */
function normalize(config) {
  const out = { ...config };
  if (out.aiProvider && !config.provider) out.provider = out.aiProvider;
  if (out.baseURL && !config.url) out.url = out.baseURL;
  delete out.aiProvider;
  delete out.baseURL;
  return out;
}

async function readStoredConfig() {
  await ensurePrivateDir();
  try {
    const data = await fs.readFile(configFile(), 'utf8');
    return { ...DEFAULT_CONFIG, ...normalize(JSON.parse(data)) };
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Error reading config:', e.message);
    return { ...DEFAULT_CONFIG };
  }
}

export async function readConfig(maskSecrets = true) {
  const rawConfig = await readRawConfig();
  if (maskSecrets && rawConfig.apiKey) {
    return { ...rawConfig, apiKey: MASK };
  }
  return rawConfig;
}

/** Returns the configuration with secrets decrypted, for internal backend services only. */
export async function readRawConfig() {
  const stored = await readStoredConfig();
  if (stored.apiKey) {
    try {
      const plain = decryptSecret(stored.apiKey);
      if (isLegacyEncrypted(stored.apiKey)) {
        // Upgrade legacy (hostname-derived key) ciphertext to the master-key format.
        await writePrivateFile(configFile(), JSON.stringify({ ...stored, apiKey: encryptSecret(plain) }, null, 2));
      }
      stored.apiKey = plain;
    } catch (err) {
      console.error('[Config]', err.message);
      stored.apiKey = '';
    }
  }
  return stored;
}

export async function writeConfig(config) {
  const current = await readStoredConfig();
  const incoming = normalize(config || {});
  const newConfig = { ...current, ...incoming };

  if (incoming.apiKey === MASK) {
    newConfig.apiKey = current.apiKey; // keep the stored (encrypted) key
  } else if (incoming.apiKey) {
    newConfig.apiKey = encryptSecret(incoming.apiKey);
  }

  await writePrivateFile(configFile(), JSON.stringify(newConfig, null, 2));

  return { ...newConfig, apiKey: newConfig.apiKey ? MASK : '' };
}

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { readConfig, readRawConfig, writeConfig } from '../utils/configManager.js';

const CONFIG_DIR = path.join(os.homedir(), '.nexusterm');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

describe('configManager service', () => {
  let originalConfig = null;

  beforeEach(async () => {
    try {
      originalConfig = await fs.readFile(CONFIG_FILE, 'utf8');
    } catch {
      originalConfig = null;
    }
  });

  afterEach(async () => {
    if (originalConfig !== null) {
      await fs.writeFile(CONFIG_FILE, originalConfig, 'utf8');
    } else {
      try {
        await fs.unlink(CONFIG_FILE);
      } catch {}
    }
  });

  it('should write config with encrypted API key and return masked API key to client', async () => {
    const testKey = 'sk-proj-test123456789';
    const result = await writeConfig({
      provider: 'openai',
      apiKey: testKey,
      model: 'gpt-4o'
    });

    assert.equal(result.apiKey, '••••••••', 'Client response must mask API key');

    // Check disk content - must be encrypted or not match plaintext
    const fileContent = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
    assert.notEqual(fileContent.apiKey, testKey, 'Disk content must not be plaintext');
    assert(fileContent.apiKey.includes(':'), 'Encrypted API key should use IV:Tag:Ciphertext format');
  });

  it('should readRawConfig and decrypt the API key', async () => {
    const testKey = 'sk-proj-secret-key-999';
    await writeConfig({ apiKey: testKey });

    const raw = await readRawConfig();
    assert.equal(raw.apiKey, testKey, 'readRawConfig must return decrypted plaintext key for internal services');
  });

  it('should readConfig and return masked API key by default', async () => {
    await writeConfig({ apiKey: 'sk-proj-secret' });

    const masked = await readConfig(true);
    assert.equal(masked.apiKey, '••••••••');

    const unmasked = await readConfig(false);
    assert.equal(unmasked.apiKey, 'sk-proj-secret');
  });

  it('should preserve existing encrypted API key when client sends masked string ••••••••', async () => {
    const testKey = 'sk-proj-original-key';
    await writeConfig({ apiKey: testKey });

    // Client updates model but sends masked key back
    await writeConfig({ model: 'gpt-4-turbo', apiKey: '••••••••' });

    const raw = await readRawConfig();
    assert.equal(raw.apiKey, testKey, 'Original key should be preserved when •••••••• is sent');
    assert.equal(raw.model, 'gpt-4-turbo');
  });
});

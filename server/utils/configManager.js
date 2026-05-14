import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.nexusterm');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG = {
  aiProvider: 'openai',
  apiKey: '',
  baseURL: 'https://api.openai.com/v1',
  model: 'gpt-3.5-turbo'
};

export async function readConfig() {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
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
    let currentConfig = DEFAULT_CONFIG;
    try {
      const data = await fs.readFile(CONFIG_FILE, 'utf8');
      currentConfig = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    } catch (e) {
      // Ignore read error, just use default config
    }
    const newConfig = { ...currentConfig, ...config };
    await fs.writeFile(CONFIG_FILE, JSON.stringify(newConfig, null, 2), 'utf8');
    return newConfig;
  } catch (err) {
    console.error('Error writing config:', err);
    throw err;
  }
}

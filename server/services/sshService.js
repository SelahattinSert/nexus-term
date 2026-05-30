import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { Client } from 'ssh2';

const SSH_DIR = path.join(os.homedir(), '.nexusterm');
const SSH_PROFILES_FILE = path.join(SSH_DIR, 'ssh-profiles.json');

// --- Encryption Utility ---
// Generate a machine-specific key so if ssh-profiles.json is copied to another machine, 
// passwords cannot be decrypted.
const ALGORITHM = 'aes-256-gcm';
const getEncryptionKey = () => {
  const secretInfo = os.hostname() + '_' + os.userInfo().username;
  return crypto.scryptSync(secretInfo, 'nexus_salt', 32);
};

function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

function decrypt(hash) {
  if (!hash || !hash.includes(':')) return hash;
  try {
    const [ivHex, encryptedHex] = hash.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[SSH Service] Decryption failed (Machine changed?):', err.message);
    throw new Error('Failed to decrypt SSH password. This usually happens if the profile file was moved from another computer.');
  }
}

// --- Profile Management ---
export async function getProfiles() {
  try {
    await fs.mkdir(SSH_DIR, { recursive: true });
    try {
      const data = await fs.readFile(SSH_PROFILES_FILE, 'utf8');
      const profiles = JSON.parse(data);
      // Never send real passwords to the frontend
      return profiles.map(p => ({
        ...p,
        password: p.password ? '••••••••' : undefined,
        passphrase: p.passphrase ? '••••••••' : undefined
      }));
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  } catch (err) {
    console.error('[SSH Service] Error reading profiles:', err);
    return [];
  }
}

async function getRawProfiles() {
  try {
    const data = await fs.readFile(SSH_PROFILES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

export async function saveProfile(profileData) {
  await fs.mkdir(SSH_DIR, { recursive: true });
  const profiles = await getRawProfiles();
  
  const existingIndex = profiles.findIndex(p => p.id === profileData.id);
  
  // Encrypt sensitive fields before saving
  const secureProfile = { ...profileData };
  if (secureProfile.password && secureProfile.password !== '••••••••') {
    secureProfile.password = encrypt(secureProfile.password);
  } else if (secureProfile.password === '••••••••' && existingIndex !== -1) {
    secureProfile.password = profiles[existingIndex].password; // keep existing encrypted
  }

  if (secureProfile.passphrase && secureProfile.passphrase !== '••••••••') {
    secureProfile.passphrase = encrypt(secureProfile.passphrase);
  } else if (secureProfile.passphrase === '••••••••' && existingIndex !== -1) {
    secureProfile.passphrase = profiles[existingIndex].passphrase; // keep existing encrypted
  }

  if (existingIndex !== -1) {
    profiles[existingIndex] = secureProfile;
  } else {
    profiles.push(secureProfile);
  }

  await fs.writeFile(SSH_PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf8');
  return secureProfile;
}

export async function deleteProfile(id) {
  const profiles = await getRawProfiles();
  const filtered = profiles.filter(p => p.id !== id);
  await fs.writeFile(SSH_PROFILES_FILE, JSON.stringify(filtered, null, 2), 'utf8');
}

// --- Connection Testing ---
export async function testConnection(profileId) {
  const profiles = await getRawProfiles();
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) throw new Error('Profile not found');

  return new Promise((resolve, reject) => {
    const start = Date.now();
    const conn = new Client();
    
    // We only test connectivity, not full shell interaction here
    conn.on('ready', () => {
      conn.end();
      resolve({ reachable: true, latencyMs: Date.now() - start });
    }).on('error', (err) => {
      reject(err);
    });

    const connectConfig = buildSshConfig(profile);
    // Timeout quickly for testing
    connectConfig.readyTimeout = 5000; 
    
    try {
      conn.connect(connectConfig);
    } catch (err) {
      reject(err);
    }
  });
}

// Helper to build ssh2 config object from our profile
export function buildSshConfig(profile) {
  const config = {
    host: profile.host,
    port: profile.port || 22,
    username: profile.username,
  };

  if (profile.authMethod === 'password') {
    config.password = decrypt(profile.password);
  } else if (profile.authMethod === 'key') {
    if (!profile.keyPath) throw new Error("Key path is required for Key authentication");
    if (!fsSync.existsSync(profile.keyPath)) throw new Error(`Private key not found at ${profile.keyPath}`);
    
    config.privateKey = fsSync.readFileSync(profile.keyPath);
    if (profile.passphrase) {
      config.passphrase = decrypt(profile.passphrase);
    }
  } else if (profile.authMethod === 'agent') {
    config.agent = process.env.SSH_AUTH_SOCK;
    if (os.platform() === 'win32') {
      config.agent = '\\\\.\\pipe\\openssh-ssh-agent';
    }
  }
  
  return config;
}

// We will handle the full `connectAndBridgePty` in ptyManager.js or here later.

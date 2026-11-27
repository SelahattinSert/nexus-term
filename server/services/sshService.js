import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import { Client } from 'ssh2';
import { nexusPath, ensurePrivateDir, writePrivateFile } from '../utils/paths.js';
import { MASK, encryptSecret, decryptSecret } from '../utils/secretBox.js';

const profilesFile = () => nexusPath('ssh-profiles.json');

function decrypt(value) {
  try {
    return decryptSecret(value);
  } catch (err) {
    console.error('[SSH Service] Decryption failed:', err.message);
    throw new Error('Failed to decrypt SSH secret. This usually happens if the profile file was moved from another computer.');
  }
}

// --- Profile Management ---
export async function getProfiles() {
  try {
    await ensurePrivateDir();
    try {
      const data = await fs.readFile(profilesFile(), 'utf8');
      const profiles = JSON.parse(data);
      // Never send real passwords to the frontend
      return profiles.map(p => ({
        ...p,
        password: p.password ? MASK : undefined,
        passphrase: p.passphrase ? MASK : undefined
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
    const data = await fs.readFile(profilesFile(), 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

/** Returns the stored profile (secrets still encrypted) or null. Server-side use only. */
export async function getRawProfileById(id) {
  const profiles = await getRawProfiles();
  return profiles.find(p => p.id === id) || null;
}

export async function saveProfile(profileData) {
  await ensurePrivateDir();
  const profiles = await getRawProfiles();
  
  const existingIndex = profiles.findIndex(p => p.id === profileData.id);
  
  // Encrypt sensitive fields before saving
  const secureProfile = { ...profileData };
  if (secureProfile.password && secureProfile.password !== MASK) {
    secureProfile.password = encryptSecret(secureProfile.password);
  } else if (secureProfile.password === MASK && existingIndex !== -1) {
    secureProfile.password = profiles[existingIndex].password; // keep existing encrypted
  }

  if (secureProfile.passphrase && secureProfile.passphrase !== MASK) {
    secureProfile.passphrase = encryptSecret(secureProfile.passphrase);
  } else if (secureProfile.passphrase === MASK && existingIndex !== -1) {
    secureProfile.passphrase = profiles[existingIndex].passphrase; // keep existing encrypted
  }

  if (existingIndex !== -1) {
    profiles[existingIndex] = secureProfile;
  } else {
    profiles.push(secureProfile);
  }

  await writePrivateFile(profilesFile(), JSON.stringify(profiles, null, 2));
  return secureProfile;
}

export async function deleteProfile(id) {
  const profiles = await getRawProfiles();
  const filtered = profiles.filter(p => p.id !== id);
  await writePrivateFile(profilesFile(), JSON.stringify(filtered, null, 2));
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

  // A masked placeholder means the caller passed a client-side copy of the profile. Never send it as a credential.
  if (profile.password === MASK || profile.passphrase === MASK) {
    throw new Error('Refusing to use a masked SSH profile. Load the stored profile by id instead.');
  }

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


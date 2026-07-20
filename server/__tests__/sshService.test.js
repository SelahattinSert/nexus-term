import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getProfiles, saveProfile, deleteProfile, buildSshConfig } from '../services/sshService.js';

const SSH_DIR = path.join(os.homedir(), '.nexusterm');
const SSH_PROFILES_FILE = path.join(SSH_DIR, 'ssh-profiles.json');

describe('sshService', () => {
  let originalFile = null;

  beforeEach(async () => {
    try {
      originalFile = await fs.readFile(SSH_PROFILES_FILE, 'utf8');
    } catch {
      originalFile = null;
    }
  });

  afterEach(async () => {
    if (originalFile !== null) {
      await fs.writeFile(SSH_PROFILES_FILE, originalFile, 'utf8');
    } else {
      try {
        await fs.unlink(SSH_PROFILES_FILE);
      } catch {}
    }
  });

  it('should save SSH profile with encrypted password and return masked password in getProfiles', async () => {
    const profile = {
      id: 'ssh-test-1',
      name: 'Test Server',
      host: '192.168.1.100',
      port: 22,
      username: 'root',
      authMethod: 'password',
      password: 'my-super-secret-ssh-password'
    };

    await saveProfile(profile);

    const profiles = await getProfiles();
    const saved = profiles.find(p => p.id === 'ssh-test-1');
    assert(saved, 'Saved profile should exist');
    assert.equal(saved.password, '••••••••', 'Password must be masked in getProfiles()');

    // Verify raw file on disk is encrypted
    const rawData = JSON.parse(await fs.readFile(SSH_PROFILES_FILE, 'utf8'));
    const rawProfile = rawData.find(p => p.id === 'ssh-test-1');
    assert.notEqual(rawProfile.password, 'my-super-secret-ssh-password');
    assert(rawProfile.password.includes(':'), 'Encrypted password should contain IV:Ciphertext');
  });

  it('should build decrypted ssh2 config from profile', async () => {
    const profile = {
      id: 'ssh-test-2',
      name: 'Prod DB',
      host: 'db.example.com',
      port: 2222,
      username: 'admin',
      authMethod: 'password',
      password: 'raw-password-123'
    };

    const savedRaw = await saveProfile(profile);

    const config = buildSshConfig(savedRaw);
    assert.equal(config.host, 'db.example.com');
    assert.equal(config.port, 2222);
    assert.equal(config.username, 'admin');
    assert.equal(config.password, 'raw-password-123', 'buildSshConfig must decrypt the password for connection');
  });

  it('should delete profile by id', async () => {
    await saveProfile({ id: 'to-delete', name: 'Delete Me', host: 'localhost', username: 'user' });
    let profiles = await getProfiles();
    assert(profiles.some(p => p.id === 'to-delete'));

    await deleteProfile('to-delete');
    profiles = await getProfiles();
    assert.equal(profiles.some(p => p.id === 'to-delete'), false);
  });
});

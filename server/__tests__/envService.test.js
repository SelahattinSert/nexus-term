import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { 
  findEnvFiles, 
  getEnvFileDetails, 
  revealVariable, 
  saveEnvFile, 
  switchProfile, 
  validateEnvFile, 
  checkRevealRateLimit 
} from '../services/envService.js';

describe('envService', () => {
  const testDir = path.join(os.tmpdir(), `nexusterm-env-test-${Date.now()}`);

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('should find .env files in directory', async () => {
    await fs.writeFile(path.join(testDir, '.env'), 'PORT=3000\n');
    await fs.writeFile(path.join(testDir, '.env.production'), 'PORT=8080\nSECRET_KEY=supersecret\n');

    const files = await findEnvFiles(testDir);
    assert.equal(files.length, 2);
  });

  it('should get env file details and mask secret variables by default', async () => {
    const envPath = path.join(testDir, '.env');
    await fs.writeFile(envPath, 'PUBLIC_NAME=nexus\nDB_PASSWORD=secret123\nKEY=123\n');

    const details = await getEnvFileDetails(testDir, envPath, true);
    assert(details, 'Details should be returned');
    assert.equal(details.isActive, true);

    const dbPass = details.variables.find(v => v.key === 'DB_PASSWORD');
    assert(dbPass, 'DB_PASSWORD should exist');
    assert.equal(dbPass.value, null, 'Masked secret value should be null when redacted');
  });

  it('should reveal secret variable value', async () => {
    const envPath = path.join(testDir, '.env');
    await fs.writeFile(envPath, 'API_SECRET=my-top-secret-token\n');

    const val = await revealVariable(envPath, 'API_SECRET');
    assert.equal(val, 'my-top-secret-token');
  });

  it('should save env file without overwriting unrevealed masked values', async () => {
    const envPath = path.join(testDir, '.env');
    await fs.writeFile(envPath, 'SECRET_TOKEN=original_secret\nAPP_NAME=old_name\n');

    // Frontend payload sending null for SECRET_TOKEN (masked & unrevealed)
    const payload = [
      { key: 'SECRET_TOKEN', isMasked: true, value: null },
      { key: 'APP_NAME', isMasked: false, value: 'new_name' }
    ];

    await saveEnvFile(envPath, payload);
    const content = await fs.readFile(envPath, 'utf8');

    assert(content.includes('SECRET_TOKEN=original_secret'), 'Original secret must be preserved');
    assert(content.includes('APP_NAME=new_name'), 'Updated value must be written');
  });

  it('should switch env profiles and create a backup', async () => {
    const defaultEnv = path.join(testDir, '.env');
    const prodEnv = path.join(testDir, '.env.production');

    await fs.writeFile(defaultEnv, 'ENV=development\n');
    await fs.writeFile(prodEnv, 'ENV=production\n');

    await switchProfile(testDir, prodEnv);

    const content = await fs.readFile(defaultEnv, 'utf8');
    assert.equal(content.trim(), 'ENV=production');

    const backups = (await fs.readdir(testDir)).filter(f => f.startsWith('.env.backup'));
    assert(backups.length >= 1, 'Backup file should be created when overwriting .env');
  });

  it('should validate env file syntax and detect missing keys against .env.example', async () => {
    const envPath = path.join(testDir, '.env');
    const examplePath = path.join(testDir, '.env.example');

    await fs.writeFile(envPath, 'PORT=3000\nPORT=4000\nEMPTY_VAL=\n');
    await fs.writeFile(examplePath, 'PORT=3000\nDATABASE_URL=postgres://...\n');

    const issues = await validateEnvFile(testDir, envPath);
    
    const duplicateIssue = issues.find(i => i.message.includes('Duplicate key'));
    assert(duplicateIssue, 'Should flag duplicate PORT key');

    const missingIssue = issues.find(i => i.message.includes('Missing required key'));
    assert(missingIssue, 'Should flag missing DATABASE_URL from .env.example');
  });

  it('should enforce reveal rate limit after 10 requests', async () => {
    const ip = `127.0.0.${Date.now() % 255}`;
    for (let i = 0; i < 10; i++) {
      const allowed = await checkRevealRateLimit(ip);
      assert.equal(allowed, true);
    }
    const eleventh = await checkRevealRateLimit(ip);
    assert.equal(eleventh, false, '11th request within 1 minute must be rate limited');
  });
});

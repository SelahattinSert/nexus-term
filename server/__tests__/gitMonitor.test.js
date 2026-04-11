import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { getGitStatus, fetchAndGetGitStatus } from '../gitMonitor.js';

describe('gitMonitor', () => {
  let tempDir;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-'));
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return null for non-git directory', async () => {
    const result = await new Promise(resolve => getGitStatus(tempDir, resolve));
    assert.strictEqual(result, null);
  });

  it('should return valid git status for a git directory', async () => {
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tempDir });
    execSync('git config user.email "test@example.com"', { cwd: tempDir });
    
    // Create an initial commit to avoid HEAD detached or missing branches
    fs.writeFileSync(path.join(tempDir, 'file.txt'), 'hello');
    execSync('git add file.txt', { cwd: tempDir });
    execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'ignore' });

    fs.writeFileSync(path.join(tempDir, 'file2.txt'), 'world');

    const result = await new Promise(resolve => getGitStatus(tempDir, resolve));
    assert.ok(result);
    assert.ok(result.branch);
    assert.strictEqual(result.changedFiles, 1);
    assert.strictEqual(result.files[0].file, 'file2.txt');
    assert.ok(result.branches.includes(result.branch));
  });

  it('fetchAndGetGitStatus should ignore fetch errors and return status', async () => {
    const result = await new Promise(resolve => fetchAndGetGitStatus(tempDir, resolve));
    assert.ok(result);
    assert.strictEqual(result.changedFiles, 1);
  });
});

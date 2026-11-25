import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createApp } from '../app.js';

const TEST_TOKEN = 'test-secret-token-12345';

describe('Express API Routes Integration', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = createApp({ token: TEST_TOKEN, bindHost: '127.0.0.1' });
    await new Promise((resolve) => {
      server = createServer(app);
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  it('should reject unauthorized request without token', async () => {
    const res = await fetch(`${baseUrl}/api/ports`);
    assert.equal(res.status, 401);
  });

  it('should accept authorized request with query token', async () => {
    const res = await fetch(`${baseUrl}/api/ports?token=${TEST_TOKEN}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert(Array.isArray(data.ports));
  });

  it('should accept authorized request with Authorization: Bearer header', async () => {
    const res = await fetch(`${baseUrl}/api/ports`, {
      headers: { 'Authorization': `Bearer ${TEST_TOKEN}` }
    });
    assert.equal(res.status, 200);
  });

  it('should accept authorized request with x-access-token header', async () => {
    const res = await fetch(`${baseUrl}/api/ports`, {
      headers: { 'x-access-token': TEST_TOKEN }
    });
    assert.equal(res.status, 200);
  });

  it('should list and manage SSH profiles via /api/ssh/profiles', async () => {
    const getRes = await fetch(`${baseUrl}/api/ssh/profiles?token=${TEST_TOKEN}`);
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert(Array.isArray(getData));
  });

  it('should list memory entries via /api/memory', async () => {
    const res = await fetch(`${baseUrl}/api/memory?token=${TEST_TOKEN}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert(Array.isArray(data.entries));
  });

  it('should reject requests with a foreign Host header (DNS rebinding)', async () => {
    const res = await new Promise((resolve, reject) => {
      import('http').then(({ request }) => {
        const req = request(`${baseUrl}/api/ports?token=${TEST_TOKEN}`, { headers: { Host: 'evil.example.com' } }, resolve);
        req.on('error', reject);
        req.end();
      });
    });
    assert.equal(res.statusCode, 403);
  });

  it('should reject requests from a foreign Origin', async () => {
    const res = await fetch(`${baseUrl}/api/ports?token=${TEST_TOKEN}`, { headers: { Origin: 'https://evil.example.com' } });
    assert.equal(res.status, 403);
  });

  it('should refuse file reads that escape the home directory through a symlink', async () => {
    const home = process.env.HOME;
    const dir = fs.mkdtempSync(path.join(home, '.nexus-test-'));
    const link = path.join(dir, 'escape');
    try {
      fs.symlinkSync('/etc', link);
      const res = await fetch(`${baseUrl}/api/file/content?token=${TEST_TOKEN}&path=${encodeURIComponent(path.join(link, 'hostname'))}`);
      assert.equal(res.status, 403);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should refuse git status outside the home directory', async () => {
    const res = await fetch(`${baseUrl}/api/git/status?token=${TEST_TOKEN}&path=${encodeURIComponent(os.platform() === 'win32' ? 'C:\\Windows' : '/etc')}`);
    assert.equal(res.status, 403);
  });

  it('should reject invalid session ids', async () => {
    const res = await fetch(`${baseUrl}/api/terminals?token=${TEST_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: '../../x' }),
    });
    assert.equal(res.status, 400);
  });

  it('should protect /mcp with the MCP token, not the UI token', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TEST_TOKEN}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    assert.equal(res.status, 401);
  });

  it('returns voice vocabulary context and rejects empty spoken text', async () => {
    const ctx = await fetch(`${baseUrl}/api/voice/context?token=${TEST_TOKEN}`);
    assert.equal(ctx.status, 200);
    const data = await ctx.json();
    assert.ok(Array.isArray(data.scripts) && Array.isArray(data.sshProfiles));
    const empty = await fetch(`${baseUrl}/api/voice/text?token=${TEST_TOKEN}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '  ', sessionId: 'x' }),
    });
    assert.equal(empty.status, 400);
  });

  it('marks spoken requests so the model expects phonetic mistakes', async () => {
    const { describeSpokenRequest } = await import('../services/voiceService.js');
    const out = describeSpokenRequest('npm run dev', { raw: 'en pi em ran dev', corrections: [{ from: 'en pi em', to: 'npm' }] });
    assert.match(out, /^npm run dev/);
    assert.match(out, /offline speech recognizer/);
    assert.match(out, /"en pi em" → "npm"/);
  });
});

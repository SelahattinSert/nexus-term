import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'http';

import voiceRoute from '../routes/voice.js';
import settingsRoute from '../routes/settings.js';
import sshRoute from '../routes/ssh.js';
import portsRoute from '../routes/ports.js';
import envRoute from '../routes/env.js';
import memoryRoute from '../routes/memory.js';

const TEST_TOKEN = 'test-secret-token-12345';

function requireToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = req.query.token || req.headers['x-access-token'] || bearerToken;

  if (token === TEST_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

describe('Express API Routes Integration', () => {
  let app;
  let server;
  let baseUrl;

  before(async () => {
    app = express();
    app.use(express.json());

    app.use('/api/voice', requireToken, voiceRoute);
    app.use('/api/settings', requireToken, settingsRoute);
    app.use('/api/ssh', requireToken, sshRoute);
    app.use('/api/ports', requireToken, portsRoute);
    app.use('/api/env', requireToken, envRoute);
    app.use('/api/memory', requireToken, memoryRoute);

    await new Promise((resolve) => {
      server = createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
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
});

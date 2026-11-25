import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createTerminal, killSession, runCommand } from '../ptyManager.js';
import { createShare, endShare, setController, denyControl, isValidShareToken, _endAll } from '../services/shareService.js';
import { handleGuestConnection } from '../services/shareService.js';
import { createApp } from '../app.js';

function collect(ws) {
  const state = { text: '', metas: [] };
  ws.on('message', (raw) => {
    const s = raw.toString();
    if (s.startsWith('NEXUS_META:')) state.metas.push(JSON.parse(s.slice(11)));
    else state.text += s;
  });
  return state;
}

const waitFor = async (fn, ms = 8000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
};

describe('live share', { skip: os.platform() === 'win32' }, () => {
  let server;
  let port;
  const sessionId = 'share-test';

  before(async () => {
    createTerminal(sessionId, { shell: '/bin/bash', createdBy: 'ui' });
    await runCommand(sessionId, 'echo secret-before-share', { timeoutMs: 15000 });
    server = createServer();
    const wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url, 'http://localhost');
      wss.handleUpgrade(req, socket, head, (ws) => handleGuestConnection(ws, url));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
  });

  after(async () => {
    _endAll();
    killSession(sessionId);
    await new Promise(r => server.close(r));
  });

  it('shares only the visible screen and live output with a read-only guest', async () => {
    // The browser sends the serialized visible screen; earlier history must never reach guests
    const share = createShare(sessionId, { ttlMinutes: 10, theme: 'dracula', screen: 'visible-screen-only\r\n$ ' });
    assert.ok(isValidShareToken(share.token));
    assert.equal(createShare(sessionId).id, share.id, 'one share per session');

    const guest = new WebSocket(`ws://127.0.0.1:${port}/?share=${share.token}&name=Ay%C5%9Fe<script>`);
    const g = collect(guest);
    await new Promise(r => guest.on('open', r));

    assert.ok(await waitFor(() => g.metas.some(m => m.type === 'WELCOME')));
    assert.equal(g.metas.find(m => m.type === 'WELCOME').payload.theme, 'dracula');
    assert.ok(await waitFor(() => g.text.includes('visible-screen-only')), 'visible screen sent');
    assert.ok(!g.text.includes('secret-before-share'), 'history from before the share is not sent');
    const presence = g.metas.filter(m => m.type === 'PRESENCE').pop();
    assert.equal(presence.payload.guests[0].name, 'Ayşescript', 'names are sanitized');

    await runCommand(sessionId, 'echo live-output', { timeoutMs: 15000 });
    assert.ok(await waitFor(() => g.text.includes('live-output')), 'live output forwarded');

    // Typing without control is ignored
    guest.send(JSON.stringify({ type: 'INPUT', data: 'echo typed-by-guest\r' }));
    await new Promise(r => setTimeout(r, 700));
    assert.ok(!g.text.includes('typed-by-guest'), 'read-only guest cannot type');

    // A control request can be denied; the guest is told and can no longer spam requests
    guest.send(JSON.stringify({ type: 'REQUEST_CONTROL' }));
    assert.ok(await waitFor(() => g.metas.filter(m => m.type === 'PRESENCE').pop().payload.guests[0].wantsControl));
    assert.ok(denyControl(share.id, presence.payload.you));
    assert.ok(await waitFor(() => g.metas.some(m => m.type === 'CONTROL_DENIED')));
    const deniedCount = g.metas.filter(m => m.type === 'CONTROL_DENIED').length;
    guest.send(JSON.stringify({ type: 'REQUEST_CONTROL' }));
    assert.ok(await waitFor(() => g.metas.filter(m => m.type === 'CONTROL_DENIED').length > deniedCount), 'cooldown answers immediately');

    // Owner hands over control: now the guest can type
    const guestId = presence.payload.you;
    assert.ok(setController(share.id, guestId));
    guest.send(JSON.stringify({ type: 'INPUT', data: 'echo guest-has-control\r' }));
    assert.ok(await waitFor(() => (g.text.match(/guest-has-control/g) || []).length >= 2), 'guest input executed');

    // A network blip: rejoining with the secret key keeps identity and keyboard control
    const rejoinKey = g.metas.find(m => m.type === 'WELCOME').payload.rejoinKey;
    guest.terminate();
    await new Promise(r => setTimeout(r, 200));
    const back = new WebSocket(`ws://127.0.0.1:${port}/?share=${share.token}&name=x&rejoin=${rejoinKey}`);
    const b = collect(back);
    await new Promise(r => back.on('open', r));
    assert.ok(await waitFor(() => b.metas.some(m => m.type === 'PRESENCE')));
    const p2 = b.metas.filter(m => m.type === 'PRESENCE').pop().payload;
    assert.equal(p2.you, guestId);
    assert.equal(p2.controllerId, guestId);

    // Ending the share disconnects the guest
    const closed = new Promise(r => back.on('close', (code) => r(code)));
    endShare(share.id);
    assert.equal(await closed, 4403);
    assert.ok(!isValidShareToken(share.token));
  });

  it('rejects unknown tokens', async () => {
    const guest = new WebSocket(`ws://127.0.0.1:${port}/?share=${'0'.repeat(64)}`);
    const code = await new Promise(r => guest.on('close', (c) => r(c)));
    assert.equal(code, 4404);
  });

  it('serves the viewer page only for valid tokens', async () => {
    const app = createApp({ token: 'ui', bindHost: '127.0.0.1' });
    const s = createServer(app);
    await new Promise(r => s.listen(0, '127.0.0.1', r));
    try {
      const base = `http://127.0.0.1:${s.address().port}`;
      const bad = await fetch(`${base}/share/${'a'.repeat(64)}`);
      assert.equal(bad.status, 404);
      assert.equal(bad.headers.get('referrer-policy'), 'no-referrer');
      // the share API itself still needs the UI token
      const api = await fetch(`${base}/api/shares`);
      assert.equal(api.status, 401);
      // and nothing under /api or /mcp is usable through a tunnel/proxy, even with the token
      const tunneled = await fetch(`${base}/api/shares?token=ui`, { headers: { 'x-forwarded-for': '1.2.3.4' } });
      assert.equal(tunneled.status, 403);
      const tunneledMcp = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'cf-connecting-ip': '1.2.3.4' } });
      assert.equal(tunneledMcp.status, 403);
    } finally {
      await new Promise(r => s.close(r));
    }
  });
});

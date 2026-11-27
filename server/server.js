import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import open from 'open';
import { fileURLToPath } from 'url';
import { createApp, isAllowedRequest, hasProxyHeaders, isLoopbackHost } from './app.js';
import { handleConnection, listSessions } from './ptyManager.js';
import { handleGuestConnection } from './services/shareService.js';
import { addControlClient, broadcast } from './services/eventBus.js';
import { listPending } from './services/approvalService.js';
import * as blockStore from './services/blockStore.js';
import { readRawConfig } from './utils/configManager.js';
import { getMcpToken, writeServerInfo, safeEqual } from './mcp/token.js';

dotenv.config({ quiet: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = crypto.randomBytes(16).toString('hex');
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '127.0.0.1';
const mcpHost = HOST === '0.0.0.0' || HOST === '::' ? '127.0.0.1' : HOST;
const getMcpUrl = () => `http://${mcpHost.includes(':') && !mcpHost.startsWith('[') ? `[${mcpHost}]` : mcpHost}:${PORT}/mcp`;

// The stdio bridge command shown in the Agents panel works without a global install
const stdio = { command: process.execPath, args: [path.join(__dirname, 'bin', 'nexusterm.js'), 'mcp'] };

const app = createApp({ token: TOKEN, bindHost: HOST, port: PORT, getMcpUrl, stdio });

// Load persisted settings that affect background services
readRawConfig().then(config => blockStore.setPersistEnabled(config.persistBlocks !== false)).catch(() => {});
getMcpToken(); // create the MCP token on first launch

// --- CPU/RAM Monitoring (os module, no native dependencies) ---
let lastCpuInfo = os.cpus();

function getCpuUsage() {
  const currentCpuInfo = os.cpus();
  let totalIdle = 0, totalTick = 0;

  currentCpuInfo.forEach((core, i) => {
    const prev = lastCpuInfo[i];
    for (const type in core.times) {
      totalTick += core.times[type] - (prev?.times[type] || 0);
    }
    totalIdle += core.times.idle - (prev?.times.idle || 0);
  });

  lastCpuInfo = currentCpuInfo;
  return totalTick > 0 ? Math.round((1 - totalIdle / totalTick) * 100) : 0;
}

// --- HTTP + WebSocket Server ---
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });
// Live-share guests are untrusted: small messages only
const guestWss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on('upgrade', (request, socket, head) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

    // Live-share guests: authenticated by their share token (checked in handleGuestConnection).
    // They may arrive through LAN or a tunnel, so only require that a browser Origin matches the Host.
    if (url.searchParams.has('share')) {
      const origin = request.headers.origin;
      let sameOrigin = !origin;
      try { sameOrigin = sameOrigin || new URL(origin).host === request.headers.host; } catch { sameOrigin = false; }
      if (!sameOrigin) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        return socket.destroy();
      }
      return guestWss.handleUpgrade(request, socket, head, (ws) => handleGuestConnection(ws, url));
    }

    if ((isLoopbackHost(HOST) && hasProxyHeaders(request.headers))
      || !safeEqual(url.searchParams.get('token') || '', TOKEN)
      || !isAllowedRequest({ host: request.headers.host, origin: request.headers.origin }, { bindHost: HOST })) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, url);
    });
  } catch {
    socket.destroy();
  }
});

wss.on('connection', (ws, req, url) => {
  if (url.searchParams.get('channel') === 'control') {
    // One per open browser window: global events (approvals, blocks, agent sessions)
    addControlClient(ws);
    ws.send('NEXUS_META:' + JSON.stringify({ type: 'APPROVALS_SNAPSHOT', payload: listPending() }));
    // Lets a freshly opened window show tabs for sessions agents created while no window was open
    ws.send('NEXUS_META:' + JSON.stringify({ type: 'SESSIONS_SNAPSHOT', payload: listSessions() }));
    return;
  }
  handleConnection(ws, req);
});

// --- System Monitor Broadcast ---
setInterval(() => {
  const totalMem = os.totalmem();
  const usedMem = totalMem - os.freemem();
  broadcast('SYSTEM_STATS', { cpu: getCpuUsage(), ram: Math.round((usedMem / totalMem) * 100), usedMem, totalMem });
}, 2000);

server.listen(PORT, HOST, async () => {
  writeServerInfo({ host: HOST, port: PORT, mcpUrl: getMcpUrl() });
  const displayHost = HOST === '0.0.0.0' ? '127.0.0.1' : HOST;
  const url = `http://${displayHost}:${PORT}/?token=${TOKEN}`;
  console.log('\x1b[32m🚀 NexusTerm started!\x1b[0m');
  console.log(`Interface: \x1b[36m${url}\x1b[0m`);
  console.log(`MCP endpoint for agents: \x1b[36m${getMcpUrl()}\x1b[0m (setup instructions in the Agents panel)`);

  if (process.env.NEXUSTERM_NO_OPEN) return;
  try {
    await open(url);
  } catch {
    console.log('\x1b[33m⚠️  Browser could not be opened automatically. Please open the link above manually.\x1b[0m');
  }
});

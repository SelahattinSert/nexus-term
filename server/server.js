#!/usr/bin/env node
import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import os from 'os';
import open from 'open';
import { fileURLToPath } from 'url';
import { handleConnection } from './ptyManager.js';
import { initLlama } from './llmService.js';

const app = express();
const TOKEN = crypto.randomBytes(16).toString('hex');

// ROOT boundary: User can only navigate under their own home directory
// On Windows, the env variable is USERPROFILE
const ROOT = (process.env.HOME || process.env.USERPROFILE || process.cwd());

// --- Static Files (Frontend Build) ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, 'public')));

// --- Auth Middleware (For all /api routes) ---
function requireToken(req, res, next) {
  if (req.query.token !== TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// --- File Manager API ---
app.get('/api/files', requireToken, (req, res) => {
  const requestedPath = req.query.path || ROOT;
  const safePath = path.resolve(requestedPath);

  // Path Traversal Protection (Case normalization for Windows)
  const normalizedSafe = safePath.toLowerCase();
  const normalizedRoot = ROOT.toLowerCase();

  if (!normalizedSafe.startsWith(normalizedRoot)) {
    return res.status(403).json({ error: 'Forbidden: Cannot navigate outside of root.' });
  }

  try {
    const files = fs.readdirSync(safePath, { withFileTypes: true })
      .map(dirent => ({ name: dirent.name, isDir: dirent.isDirectory() }));
    res.json(files);
  } catch (err) {
    res.json([]); // Read error: return empty list, prevent crash
  }
});

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
  return Math.round((1 - totalIdle / totalTick) * 100);
}

// --- HTTP + WebSocket Server (single server.listen, no conflict) ---
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// WSS Upgrade: Token validation + failsafe against parse errors
server.on('upgrade', (request, socket, head) => {
  try {
    const baseUrl = `http://${request.headers.host || 'localhost'}`;
    const url = new URL(request.url, baseUrl);

    if (url.searchParams.get('token') !== TOKEN) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } catch (err) {
    // Malformed URL or unexpected parse error: close connection silently
    socket.destroy();
  }
});

wss.on('connection', (ws, req) => {
  handleConnection(ws, req, { getCpuUsage, TOKEN });
});

// --- System Monitor Broadcast ---
setInterval(() => {
  const cpu = getCpuUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const ramPercent = Math.round((usedMem / totalMem) * 100);
  
  const payload = JSON.stringify({
    type: 'SYSTEM_STATS',
    payload: { cpu, ram: ramPercent, usedMem, totalMem }
  });
  
  wss.clients.forEach(client => {
    if (client.readyState === 1 /* WebSocket.OPEN */) {
      client.send(`NEXUS_META:${payload}`);
    }
  });
}, 2000);

// --- Start Server ---
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '127.0.0.1';

server.listen(PORT, HOST, async () => {
  const url = `http://${HOST}:${PORT}/?token=${TOKEN}`;
  console.log('\x1b[32m🚀 NexusTerm started!\x1b[0m');
  console.log(`Interface: \x1b[36m${url}\x1b[0m`);
  
  // Initialize the embedded LLM asynchronously in the background
  initLlama().catch(console.error);

  try {
    await open(url);
  } catch {
    console.log('\x1b[33m⚠️  Browser could not be opened automatically. Please open the link above manually.\x1b[0m');
  }
});

import express from 'express';
import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { fileURLToPath } from 'url';
import { getAvailableShells, createTerminal, listSessions, isValidSessionId } from './ptyManager.js';
import { getGitStatus, fetchAndGetGitStatus } from './gitMonitor.js';
import { resolveInsideRoot, getRoot } from './utils/safePath.js';
import { safeEqual } from './mcp/token.js';
import voiceRoute from './routes/voice.js';
import settingsRoute from './routes/settings.js';
import sshRoute from './routes/ssh.js';
import portsRoute from './routes/ports.js';
import envRoute from './routes/env.js';
import memoryRoute from './routes/memory.js';
import blocksRoute from './routes/blocks.js';
import { createAgentsRouter } from './routes/agents.js';
import { createMcpRouter } from './mcp/http.js';
import { createSharesRouter } from './routes/shares.js';
import { isValidShareToken } from './services/shareService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOOPBACK_NAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export function isLoopbackHost(host) {
  return LOOPBACK_NAMES.has(host);
}

/** Hostname part of a Host header / URL host ("[::1]:4000" -> "[::1]", "localhost:4000" -> "localhost"). */
export function hostnameOf(hostHeader) {
  if (!hostHeader) return '';
  if (hostHeader.startsWith('[')) return hostHeader.slice(0, hostHeader.indexOf(']') + 1);
  return hostHeader.split(':')[0];
}

// Headers added by reverse proxies and tunnels (cloudflared, ngrok, nginx, ...)
const PROXY_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'forwarded', 'cf-connecting-ip', 'cf-ray', 'ngrok-trace-id'];

export function hasProxyHeaders(headers) {
  return PROXY_HEADERS.some(h => headers[h] !== undefined) || Object.keys(headers).some(h => h.startsWith('ngrok-'));
}

/**
 * Protects against DNS rebinding and cross-site requests.
 * When bound to loopback, the Host header must be a loopback name; a browser Origin, if present,
 * must be loopback too (or match Host when the server is exposed on purpose).
 */
export function isAllowedRequest({ host, origin }, { bindHost }) {
  const hostName = hostnameOf(host);
  if (isLoopbackHost(bindHost) && !isLoopbackHost(hostName)) return false;
  if (!origin || origin === 'null') return !origin; // "null" origins (sandboxed iframes, file://) are rejected
  try {
    const o = new URL(origin);
    return isLoopbackHost(o.hostname) || isLoopbackHost(`[${o.hostname}]`) || o.host === host;
  } catch {
    return false;
  }
}

/**
 * Builds the Express application.
 * @param {{ token: string, bindHost?: string, getMcpUrl?: () => string, stdio?: {command:string,args:string[]} }} options
 */
export function createApp({ token, bindHost = '127.0.0.1', port = 4000, getMcpUrl = () => '', stdio = { command: 'nexusterm', args: ['mcp'] } }) {
  const app = express();
  const ROOT = getRoot();

  // --- Static Files (Frontend Build) ---
  const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
  const publicPath = path.join(__dirname, 'public');
  // In a source checkout serve the fresh client build; an installed package ships it in server/public
  const staticRoot = fs.existsSync(path.join(clientDistPath, 'index.html')) ? clientDistPath : publicPath;

  // --- Live share viewer page (authenticated by the share token in the URL, never the UI token) ---
  app.get('/share/:token', (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' });
    if (!isValidShareToken(req.params.token)) {
      return res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><title>NexusTerm</title><body style="font-family:sans-serif;background:#1e1e2e;color:#cdd6f4;display:grid;place-items:center;height:100vh;margin:0"><p>This share link is invalid or has expired.</p></body>');
    }
    res.sendFile(path.join(staticRoot, 'share.html'));
  });

  app.use(express.static(staticRoot));

  // --- Host / Origin validation for everything dynamic ---
  app.use(['/api', '/mcp'], (req, res, next) => {
    // When NexusTerm listens on loopback, anything arriving through a proxy/tunnel came from outside:
    // only live-share pages may be used that way, never the API or the agent endpoint.
    if (isLoopbackHost(bindHost) && hasProxyHeaders(req.headers)) {
      return res.status(403).json({ error: 'Forbidden: not available through a proxy or tunnel' });
    }
    if (isAllowedRequest({ host: req.headers.host, origin: req.headers.origin }, { bindHost })) return next();
    res.status(403).json({ error: 'Forbidden: unexpected Host or Origin' });
  });

  // MCP endpoint has its own token and body parsing
  app.use('/mcp', createMcpRouter());

  app.use(express.json({ limit: '10mb' }));

  // --- Auth Middleware (UI token, for all /api routes) ---
  function requireToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const provided = req.query.token || req.headers['x-access-token'] || bearerToken;
    if (safeEqual(String(provided || ''), token)) return next();
    res.status(401).json({ error: 'Unauthorized: Invalid or missing token' });
  }

  app.use('/api', requireToken);

  app.use('/api/voice', voiceRoute);
  app.use('/api/settings', settingsRoute);
  app.use('/api/ssh', sshRoute);
  app.use('/api/ports', portsRoute);
  app.use('/api/env', envRoute);
  app.use('/api/memory', memoryRoute);
  app.use('/api/blocks', blocksRoute);
  app.use('/api/agents', createAgentsRouter({ getMcpUrl, stdio }));
  app.use('/api/shares', createSharesRouter({ getBindHost: () => bindHost, getPort: () => port }));

  app.get('/api/shells', (req, res) => {
    res.json({ shells: getAvailableShells() });
  });

  app.get('/api/sessions', (req, res) => {
    res.json({ sessions: listSessions() });
  });

  app.post('/api/terminals', (req, res) => {
    const { sessionId, shell, cols, rows, sshProfileId } = req.body || {};
    if (!isValidSessionId(sessionId)) return res.status(400).json({ error: 'A valid sessionId is required' });
    try {
      createTerminal(sessionId, { shell, cols, rows, sshProfileId });
      res.json({ success: true, sessionId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Git ---
  const gitPath = (req) => resolveInsideRoot(req.query.path || ROOT);

  app.get('/api/git/status', (req, res) => {
    const safePath = gitPath(req);
    if (!safePath) return res.status(403).json({ error: 'Forbidden: path outside of root.' });
    getGitStatus(safePath, (status) => res.json(status || { branch: null }));
  });

  app.post('/api/git/fetch', (req, res) => {
    const safePath = gitPath(req);
    if (!safePath) return res.status(403).json({ error: 'Forbidden: path outside of root.' });
    fetchAndGetGitStatus(safePath, (status) => res.json(status || { branch: null }));
  });

  // --- File Manager API ---
  app.get('/api/files', async (req, res) => {
    const safePath = resolveInsideRoot(req.query.path || ROOT);
    if (!safePath) return res.status(403).json({ error: 'Forbidden: Cannot navigate outside of root.' });

    try {
      const files = (await fsPromises.readdir(safePath, { withFileTypes: true }))
        .map(dirent => ({
          name: dirent.name,
          isDir: dirent.isDirectory(),
          path: path.join(safePath, dirent.name).replace(/\\/g, '/'),
        }));
      res.json(files);
    } catch {
      res.json([]); // Read error: return empty list
    }
  });

  app.get('/api/file/content', async (req, res) => {
    if (!req.query.path) return res.status(400).json({ error: 'path is required' });
    const safePath = resolveInsideRoot(req.query.path);
    if (!safePath) return res.status(403).json({ error: 'Forbidden: Cannot navigate outside of root.' });

    try {
      const content = await fsPromises.readFile(safePath, 'utf8');
      res.json({ content });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/file/content', async (req, res) => {
    const { path: requestedPath, content } = req.body || {};
    if (!requestedPath || typeof content !== 'string') return res.status(400).json({ error: 'path and content are required' });
    const safePath = resolveInsideRoot(requestedPath);
    if (!safePath) return res.status(403).json({ error: 'Forbidden: Cannot navigate outside of root.' });

    try {
      await fsPromises.writeFile(safePath, content, 'utf8');
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // SPA fallback is not needed (single page served from /), unknown API routes get JSON 404
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  return app;
}

import crypto from 'crypto';
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from './server.js';
import { getMcpToken, safeEqual } from './token.js';

/**
 * Streamable HTTP endpoint for MCP clients (Claude Code, Codex, ...): POST/GET/DELETE /mcp
 * Authenticated with the persistent MCP bearer token, never with the UI token.
 */
export function createMcpRouter() {
  const router = express.Router();
  const transports = new Map(); // mcp-session-id -> transport
  const lastSeen = new Map();   // mcp-session-id -> timestamp

  // Close MCP sessions that have been idle for a long time (clients re-initialize on 404)
  const IDLE_MS = 2 * 60 * 60 * 1000;
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [id, at] of lastSeen) {
      if (now - at > IDLE_MS) {
        transports.get(id)?.close().catch(() => {});
        transports.delete(id);
        lastSeen.delete(id);
      }
    }
  }, 10 * 60 * 1000);
  sweeper.unref();

  router.use((req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!safeEqual(token, getMcpToken())) {
      return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized: missing or invalid NexusTerm MCP token' }, id: null });
    }
    next();
  });

  router.post('/', express.json({ limit: '4mb' }), async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    let transport = sessionId ? transports.get(sessionId) : null;

    if (!transport) {
      if (sessionId) {
        // Unknown or expired session (e.g. NexusTerm restarted): 404 tells clients to re-initialize
        return res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'MCP session not found. Re-initialize.' }, id: null });
      }
      if (!isInitializeRequest(req.body)) {
        return res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: no valid MCP session. Re-initialize.' }, id: null });
      }
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (id) => { transports.set(id, transport); lastSeen.set(id, Date.now()); },
      });
      transport.onclose = () => {
        if (transport.sessionId) {
          transports.delete(transport.sessionId);
          lastSeen.delete(transport.sessionId);
        }
      };
      const server = createMcpServer();
      await server.connect(transport);
    }

    if (sessionId) lastSeen.set(sessionId, Date.now());
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[MCP] Request failed:', err);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
    }
  });

  const handleSession = async (req, res) => {
    const id = req.headers['mcp-session-id'];
    if (!id) return res.status(400).send('Missing MCP session id');
    const transport = transports.get(id);
    if (!transport) return res.status(404).send('MCP session not found');
    lastSeen.set(id, Date.now());
    await transport.handleRequest(req, res);
  };
  router.get('/', handleSession);
  router.delete('/', handleSession);

  return router;
}

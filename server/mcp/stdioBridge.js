import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readMcpToken, readServerInfo } from './token.js';

/**
 * `nexusterm mcp` — stdio MCP server for clients that launch tools as subprocesses.
 * It forwards every JSON-RPC message to the running NexusTerm server's /mcp endpoint, so the
 * approval gate, audit log and live terminal view all stay in the one NexusTerm process.
 *
 * When NexusTerm restarts, its MCP sessions are gone (HTTP 404). The bridge then opens a new
 * upstream session by replaying the client's original `initialize` handshake and retries, so the
 * agent never notices. Only stderr is used for logging: stdout belongs to the protocol.
 */

const REINIT_ID = '__nexusterm_bridge_reinit__';

function resolveUrl() {
  if (process.env.NEXUSTERM_MCP_URL) return process.env.NEXUSTERM_MCP_URL;
  const info = readServerInfo();
  // server.json stores a ready-made URL (correct for IPv6 hosts too)
  return info?.mcpUrl || 'http://127.0.0.1:4000/mcp';
}

export async function runStdioBridge() {
  const log = (...args) => process.stderr.write(`[nexusterm mcp] ${args.join(' ')}\n`);
  const downstream = new StdioServerTransport();

  let initializeRequest = null;   // cached from the client
  let upstream = null;
  let url = resolveUrl();
  let reinitWaiter = null;

  const replyError = (msg, message) => {
    if (msg && msg.id !== undefined && msg.method) {
      downstream.send({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message } }).catch(() => {});
    }
  };

  async function connectUpstream() {
    url = resolveUrl(); // the port may have changed after a restart
    const token = process.env.NEXUSTERM_MCP_TOKEN || readMcpToken();
    if (!token) log('No MCP token found. Start NexusTerm once (`nexusterm`) to create it.');
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: `Bearer ${token || ''}` } },
    });
    transport.onmessage = (msg) => {
      if (msg.id === REINIT_ID) {
        reinitWaiter?.(msg);
        return;
      }
      downstream.send(msg).catch(err => log('stdout write failed:', err.message));
    };
    transport.onerror = (err) => log('upstream error:', err.message);
    await transport.start();
    upstream = transport;
  }

  /** Opens a fresh upstream MCP session using the client's original initialize request. */
  async function reinitialize() {
    log('upstream session expired (NexusTerm restarted?); re-initializing');
    await upstream?.close().catch(() => {});
    await connectUpstream();
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('re-initialize timed out')), 10000);
      reinitWaiter = (msg) => { clearTimeout(timer); reinitWaiter = null; resolve(msg); };
    });
    await upstream.send({ ...initializeRequest, id: REINIT_ID });
    const msg = await response;
    if (msg.error) throw new Error(msg.error.message);
    await upstream.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  }

  async function forward(msg) {
    if (msg.method === 'initialize') initializeRequest = msg;
    try {
      await upstream.send(msg);
    } catch (err) {
      if (err?.code === 404 && initializeRequest && msg.method !== 'initialize') {
        await reinitialize();
        await upstream.send(msg);
        return;
      }
      throw err;
    }
  }

  // Serialize forwarding so a re-initialization finishes before later messages go out
  let queue = Promise.resolve();
  downstream.onmessage = (msg) => {
    queue = queue.then(() => forward(msg)).catch((err) => {
      log('forward failed:', err.message);
      replyError(msg, `NexusTerm is not reachable at ${url}. Start it with \`nexusterm\` and keep the browser window open. (${err.message})`);
    });
  };
  downstream.onclose = () => {
    upstream?.close().catch(() => {});
    process.exit(0);
  };

  await connectUpstream();
  await downstream.start();
  log(`forwarding to ${url}`);
}

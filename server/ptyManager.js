import pty from 'node-pty';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import { Client } from 'ssh2';
import { getSystemExecutables } from './pathScanner.js';
import { getGitStatus } from './gitMonitor.js';
import { buildSshConfig, getRawProfileById } from './services/sshService.js';
import { buildShellConfig, shellKind } from './terminal/shellIntegration.js';
import { createOscStream } from './terminal/oscStream.js';
import { BlockTracker } from './terminal/blockTracker.js';
import { toPlainText, unescapeCommand } from './terminal/textUtils.js';
import { safeEqual } from './mcp/token.js';
import * as blockStore from './services/blockStore.js';
import { bus, broadcast } from './services/eventBus.js';

// ========================
// PROTOCOL
// Meta messages between frontend and backend carry the NEXUS_META: / NEXUS_CMD: prefixes.
// Raw terminal output is sent without a prefix, so commands printing JSON never collide with meta messages.
// ========================
const META = (obj) => 'NEXUS_META:' + JSON.stringify(obj);
const CMD_PREFIX = 'NEXUS_CMD:';
const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const HISTORY_LIMIT = 100000;

// Commands whose non-zero exit code is normal control flow, not an error worth an overlay
const QUIET_FAILURES = new Set(['grep', 'egrep', 'fgrep', 'rg', 'test', '[', '[[', 'diff', 'cmp', 'false', 'which', 'command', 'type', 'git diff']);

const sessions = new Map();

export function isValidSessionId(id) {
  return typeof id === 'string' && SESSION_ID_RE.test(id);
}

class SshPtyWrapper {
  constructor(profileId, cols, rows) {
    this._file = 'SSH';
    this.pid = 'Remote';
    this.conn = new Client();
    this.stream = null;
    this.listeners = [];
    this.exitListeners = [];
    this.profileName = null;
    this._connect(profileId, cols, rows);
  }

  async _connect(profileId, cols, rows) {
    let profile;
    try {
      // Always load the stored profile on the server: the browser only has masked secrets.
      profile = await getRawProfileById(profileId);
      if (!profile) throw new Error('SSH profile not found');
      this.profileName = profile.name;
      this.conn.connect(buildSshConfig(profile));
    } catch (err) {
      this._emitData(`\r\n\x1b[31m[SSH] ${err.message}\x1b[0m\r\n`);
      this._emitExit();
      return;
    }

    this.conn.on('ready', () => {
      this.conn.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
        if (err) {
          this._emitData(`\r\n\x1b[31m[SSH] Failed to start shell: ${err.message}\x1b[0m\r\n`);
          return;
        }
        this.stream = stream;
        this._emitData(`\r\n\x1b[32m[SSH] Connected to ${profile.username}@${profile.host}\x1b[0m\r\n`);
        stream.on('data', (d) => this._emitData(d.toString()));
        stream.stderr?.on('data', (d) => this._emitData(d.toString()));
        stream.on('close', () => {
          this._emitData('\r\n\x1b[33m[SSH] Connection closed by remote host.\x1b[0m\r\n');
          this.conn.end();
          this._emitExit();
        });
      });
    }).on('error', (err) => {
      this._emitData(`\r\n\x1b[31m[SSH] Connection Error: ${err.message}\x1b[0m\r\n`);
      this._emitExit();
    });
  }

  onData(cb) {
    this.listeners.push(cb);
    return { dispose: () => { this.listeners = this.listeners.filter(l => l !== cb); } };
  }

  onExit(cb) {
    this.exitListeners.push(cb);
    return { dispose: () => { this.exitListeners = this.exitListeners.filter(l => l !== cb); } };
  }

  _emitData(data) {
    this.listeners.forEach(cb => cb(data));
  }

  _emitExit() {
    const listeners = this.exitListeners;
    this.exitListeners = [];
    listeners.forEach(cb => cb({ exitCode: null }));
  }

  write(data) {
    if (this.stream) this.stream.write(data);
  }

  resize(cols, rows) {
    if (this.stream) this.stream.setWindow(rows, cols, 0, 0);
  }

  kill() {
    if (this.stream) this.stream.close();
    this.conn.end();
  }
}

export function getAvailableShells() {
  const shells = [];
  const addShell = (name, executable) => {
    if (fs.existsSync(executable)) shells.push({ name, path: executable });
  };

  if (os.platform() === 'win32') {
    addShell('PowerShell', 'C:\\Program Files\\PowerShell\\7\\pwsh.exe');
    addShell('Windows PowerShell', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    addShell('Command Prompt', 'C:\\Windows\\System32\\cmd.exe');
    addShell('Git Bash', 'C:\\Program Files\\Git\\bin\\bash.exe');
    addShell('WSL', 'C:\\Windows\\System32\\wsl.exe');
  } else {
    addShell('bash', '/bin/bash');
    addShell('zsh', '/bin/zsh');
    addShell('fish', '/usr/bin/fish');
    addShell('sh', '/bin/sh');
  }
  return shells;
}

function defaultShell() {
  return os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash');
}

function publicSession(session) {
  return {
    id: session.id,
    name: session.name,
    kind: session.kind,
    shell: session.shell,
    cwd: session.currentPwd,
    createdBy: session.createdBy,
    createdAt: session.createdAt,
    integration: session.tracker.integration,
    running: session.tracker.isRunning,
    attached: !!(session.ws && session.ws.readyState === 1),
    exited: session.exited,
    sshProfileId: session.sshProfileId,
  };
}

function sendToSession(session, obj) {
  if (session.ws && session.ws.readyState === 1) session.ws.send(META(obj));
}

function setCwd(session, newPwd) {
  if (!newPwd || newPwd === session.currentPwd) return;
  session.currentPwd = newPwd;
  sendToSession(session, { type: 'DIR_CHANGE', payload: newPwd });
  if (session.ws && session.ws.readyState === 1) {
    getGitStatus(newPwd, (gitInfo) => sendToSession(session, { type: 'GIT_STATUS', payload: gitInfo }));
  }
}

function handleOsc(session, code, payload) {
  if (code === '633') {
    // Integration markers must carry this session's nonce; anything else was printed by a program
    const sep = payload.indexOf(';');
    if (sep === -1 || !session.nonce || !safeEqual(payload.slice(0, sep), session.nonce)) return;
    const rest = payload.slice(sep + 1);
    if (rest.length > 1 && rest[1] !== ';') return;
    const marker = rest[0];
    const arg = rest.slice(2);
    if (marker === 'W') setCwd(session, unescapeCommand(arg));
    else session.tracker.handleMarker(marker, arg);
    return;
  }

  // OSC 7 is only trusted from shells without NexusTerm integration (SSH, fish, sh, ...):
  // integrated shells report their directory through the authenticated W marker.
  if (code === '7' && (session.kind === 'ssh' || session.kind === 'other')) {
    const match = /^file:\/\/[^/]*(\/.*)$/.exec(payload);
    if (!match) return;
    let newPwd;
    try { newPwd = decodeURIComponent(match[1]); } catch { newPwd = match[1]; }
    if (os.platform() === 'win32' && /^\/[a-zA-Z]:\//.test(newPwd)) newPwd = newPwd.slice(1);
    setCwd(session, newPwd);
  }
  // Unauthenticated 133 markers and the legacy 999 channel are consumed and ignored
}

/**
 * Types a command at the shell prompt.
 * When the line editor has bracketed paste enabled (bash/zsh/PSReadLine announce it with ESC[?2004h),
 * the command is pasted so control characters, tabs and newlines are inserted literally instead of
 * acting as editing keys, and any half-typed text is cleared first (Ctrl+E, Ctrl+U). Remaining C0
 * control characters are always stripped, so what was approved is exactly what runs.
 */
export function sanitizeCommand(command) {
  return String(command).replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
}

function typeCommand(session, command) {
  const clean = sanitizeCommand(command);
  if (session.bracketedPaste && session.kind !== 'pwsh') {
    session.pty.write(`\x05\x15\x1b[200~${clean}\x1b[201~\r`);
  } else {
    session.pty.write(`${clean.replace(/\t/g, ' ')}\r`);
  }
}

function onBlockFinished(session, block) {
  const stored = blockStore.addBlock({ ...block, sessionName: session.name, host: session.kind === 'ssh' ? 'ssh' : os.hostname() });
  bus.emit('block-finished', stored);
  broadcast('BLOCK_FINISHED', stored);

  const first = (block.command || '').trim().split(/\s+/)[0];
  const two = (block.command || '').trim().split(/\s+/).slice(0, 2).join(' ');
  const failed = block.exitCode !== null && block.exitCode !== 0 && block.exitCode !== 130;
  if (failed && first && !QUIET_FAILURES.has(first) && !QUIET_FAILURES.has(two)) {
    const errorId = crypto.randomUUID();
    sendToSession(session, {
      type: 'ERROR',
      errorId,
      rule: {
        id: errorId,
        // A command line can chain several programs, so show the whole line rather than blaming the first word
        description: `Command failed with exit code ${block.exitCode}: ${block.command.length > 80 ? block.command.slice(0, 77) + '...' : block.command}`,
        actions: [],
        blockId: stored.id,
      },
    });
  }
}

export function createTerminal(sessionId, options = {}) {
  if (!isValidSessionId(sessionId)) throw new Error('Invalid sessionId');
  if (sessions.has(sessionId)) return sessions.get(sessionId).pty;

  const cols = Number(options.cols) || 80;
  const rows = Number(options.rows) || 24;
  const sshProfileId = options.sshProfileId || options.sshProfile?.id || null;
  const home = process.env.HOME || process.env.USERPROFILE || process.cwd();
  const cwd = options.cwd && fs.existsSync(options.cwd) ? options.cwd : home;

  let ptyProcess;
  let shell;
  let kind;
  let nonce = null;

  if (sshProfileId) {
    ptyProcess = new SshPtyWrapper(sshProfileId, cols, rows);
    shell = 'ssh';
    kind = 'ssh';
  } else {
    shell = options.shell && options.shell !== 'ssh' ? options.shell : defaultShell();
    kind = shellKind(shell);
    nonce = crypto.randomBytes(12).toString('hex');
    const { shellArgs, shellEnv } = buildShellConfig(shell, nonce);
    ptyProcess = pty.spawn(shell, shellArgs, { name: 'xterm-256color', cols, rows, cwd, env: shellEnv });
  }

  const session = {
    id: sessionId,
    name: options.name || null,
    kind,
    shell,
    sshProfileId,
    createdBy: options.createdBy || 'ui',
    createdAt: new Date().toISOString(),
    pty: ptyProcess,
    ws: null,
    timeout: null,
    currentPwd: cwd,
    history: [],
    historySize: 0,
    osc: createOscStream(),
    lastOutputAt: 0,
    exited: false,
    nonce,
    bracketedPaste: false,
    cols,
    rows,
  };

  session.tracker = new BlockTracker(sessionId, {
    getCwd: () => session.currentPwd,
    onStart: (block) => {
      bus.emit('block-started', block);
      broadcast('BLOCK_STARTED', block);
    },
    onFinish: (block) => onBlockFinished(session, block),
    onIntegration: () => broadcast('SESSION_UPDATED', publicSession(session)),
  });

  sessions.set(sessionId, session);

  session.dataListener = ptyProcess.onData((data) => {
    session.lastOutputAt = Date.now();
    let forward = '';
    for (const part of session.osc.push(data)) {
      if (part.type === 'text') {
        forward += part.data;
        session.tracker.handleText(part.data);
      } else {
        handleOsc(session, part.code, part.payload);
      }
    }
    if (!forward) return;

    // Track whether the line editor currently accepts bracketed paste (see typeCommand)
    const on = forward.lastIndexOf('\x1b[?2004h');
    const off = forward.lastIndexOf('\x1b[?2004l');
    if (on !== -1 || off !== -1) session.bracketedPaste = on > off;

    bus.emit('output', sessionId, forward);
    session.history.push(forward);
    session.historySize += forward.length;
    while (session.historySize > HISTORY_LIMIT && session.history.length > 1) {
      session.historySize -= session.history.shift().length;
    }
    if (session.ws && session.ws.readyState === 1) session.ws.send(forward);
  });

  ptyProcess.onExit?.(() => {
    session.exited = true;
    bus.emit('session-exited', sessionId);
    broadcast('SESSION_UPDATED', publicSession(session));
  });

  bus.emit('session-created', publicSession(session));
  if (session.createdBy !== 'ui') broadcast('SESSION_CREATED', publicSession(session));
  return ptyProcess;
}

export function handleConnection(ws, req) {
  const url = new URL(req.url, 'http://localhost');
  const sessionId = url.searchParams.get('sessionId');

  if (!isValidSessionId(sessionId)) return ws.close(4000, 'valid sessionId is required');

  if (!sessions.has(sessionId)) {
    try {
      createTerminal(sessionId);
    } catch (err) {
      return ws.close(4001, err.message);
    }
  }

  const session = sessions.get(sessionId);
  clearTimeout(session.timeout);
  session.timeout = null;

  session.ws = ws;
  const connectionId = crypto.randomUUID();
  session.currentConnectionId = connectionId;

  ws.on('message', (msg) => {
    const data = msg.toString();
    if (data.startsWith(CMD_PREFIX)) {
      try {
        const cmd = JSON.parse(data.slice(CMD_PREFIX.length));
        if (cmd.type === 'ACTION' && typeof cmd.command === 'string') {
          typeCommand(session, cmd.command);
        } else if (cmd.type === 'RESIZE') {
          const cols = Number(cmd.cols);
          const rows = Number(cmd.rows);
          if (cols > 0 && rows > 0) {
            session.pty.resize(cols, rows);
            session.cols = cols;
            session.rows = rows;
            bus.emit('resize', sessionId, { cols, rows });
          }
        } else if (cmd.type === 'READY') {
          if (session.history.length > 0) {
            ws.send('\x1b[2J\x1b[3J\x1b[H');
            session.history.forEach(chunk => ws.send(chunk));
          }
          getSystemExecutables().then(execs => {
            if (ws.readyState === 1) ws.send(META({ type: 'EXECUTABLES', payload: execs }));
          });
        }
      } catch { /* Malformed JSON: ignore */ }
    } else {
      session.pty.write(data); // Raw keystroke
    }
  });

  ws.on('close', () => {
    // Ignore stale connections replaced by a newer one
    if (session.currentConnectionId !== connectionId) return;

    session.timeout = setTimeout(() => {
      if (session.currentConnectionId !== connectionId) return;
      killSession(sessionId);
    }, 3000);
  });
}

export function killSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return false;
  const platform = os.platform();
  killPty(session.pty, platform);
  setTimeout(() => {
    try { killPty(session.pty, platform, true); } catch { /* already gone */ }
    sessions.delete(sessionId);
    bus.emit('session-closed', sessionId);
    broadcast('SESSION_CLOSED', { id: sessionId });
  }, 2000);
  return true;
}

function killPty(ptyProcess, platform, force = false) {
  try {
    if (platform === 'win32') ptyProcess.kill();
    else ptyProcess.kill(force ? 'SIGKILL' : 'SIGTERM');
  } catch (err) {
    if (!force) console.error('Failed to kill PTY gracefully:', err.message);
  }
}

export function injectCommand(sessionId, command) {
  const session = sessions.get(sessionId);
  if (session) typeCommand(session, command);
}

export function getSession(sessionId) {
  const session = sessions.get(sessionId);
  return session ? publicSession(session) : null;
}

export function listSessions() {
  return [...sessions.values()].map(publicSession);
}

/** Plain-text tail of a session's scrollback. */
export function readTerminal(sessionId, maxChars = 4000) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const plain = toPlainText(session.history.join(''));
  return plain.slice(-Math.min(Math.max(maxChars, 100), 50000));
}

export function getSessionDetails(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  return {
    shell: session.pty._file || session.shell || 'Unknown Shell',
    pid: session.pty.pid,
    cwd: session.currentPwd,
    recentOutput: readTerminal(sessionId, 2000),
  };
}

/** Sends Ctrl+C to the session. */
export function interruptSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.pty.write('\x03');
  return true;
}

/** Waits until a freshly spawned shell has printed its first prompt (or a short timeout). */
async function waitForReady(session, timeoutMs = 15000) {
  const expectsIntegration = ['bash', 'zsh', 'pwsh'].includes(session.kind);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (session.exited) return;
    if (expectsIntegration && session.tracker.integration) return;
    if (!expectsIntegration && session.lastOutputAt && Date.now() - session.lastOutputAt > 500) return;
    await new Promise(r => setTimeout(r, 50));
  }
}

/**
 * Types a command into a session and waits for it to finish.
 *
 * With shell integration the result is exact (exit code + output per command block). Without it
 * (SSH, cmd.exe, fish) completion is approximated by output going quiet.
 *
 * @returns {Promise<{sessionId, integration, timedOut, exitCode, output, blocks}>}
 */
export async function runCommand(sessionId, command, { timeoutMs = 120000 } = {}) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  if (session.exited) throw new Error(`Session ${sessionId} has exited`);
  if (session.tracker.isRunning) {
    throw new Error(`Session ${sessionId} is busy running another command. Wait, interrupt it, or use another session.`);
  }

  await waitForReady(session);
  const integration = session.tracker.integration;
  const limit = Math.min(Math.max(Number(timeoutMs) || 120000, 1000), 30 * 60 * 1000);

  return new Promise((resolve) => {
    const blocks = [];
    let rawFallback = '';
    let settleTimer = null;
    let quietTimer = null;
    let finished = false;

    const finish = (timedOut) => {
      if (finished) return;
      finished = true;
      clearTimeout(settleTimer);
      clearTimeout(quietTimer);
      clearTimeout(overall);
      bus.off('block-started', onStart);
      bus.off('block-finished', onFinish);
      bus.off('output', onOutput);
      bus.off('session-exited', onExit);

      let output;
      if (blocks.length) {
        output = blocks.map(b => b.output).join('\n');
        if (timedOut && session.tracker.isRunning) output += '\n' + session.tracker.currentOutput();
      } else if (integration) {
        output = session.tracker.currentOutput();
      } else {
        output = toPlainText(rawFallback);
        // drop the echoed command line
        const firstNl = output.indexOf('\n');
        if (firstNl !== -1 && output.slice(0, firstNl).includes(command.split('\n')[0].trim())) output = output.slice(firstNl + 1);
        output = output.trim();
      }

      resolve({
        sessionId,
        integration,
        timedOut,
        stillRunning: timedOut && session.tracker.isRunning,
        exitCode: blocks.length ? blocks[blocks.length - 1].exitCode : null,
        output,
        blocks: blocks.map(b => ({ id: b.id, command: b.command, exitCode: b.exitCode, durationMs: b.durationMs, truncated: b.truncated })),
      });
    };

    const onStart = (b) => { if (b.sessionId === sessionId) clearTimeout(settleTimer); };
    const onFinish = (b) => {
      if (b.sessionId !== sessionId) return;
      blocks.push(b);
      // a multi-line command produces several blocks: wait briefly for the next one
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => finish(false), 300);
    };
    const onOutput = (sid, text) => {
      if (sid !== sessionId || integration) return;
      rawFallback += text;
      clearTimeout(quietTimer);
      quietTimer = setTimeout(() => finish(false), 1500);
    };
    const onExit = (sid) => { if (sid === sessionId) finish(false); };

    bus.on('block-started', onStart);
    bus.on('block-finished', onFinish);
    bus.on('output', onOutput);
    bus.on('session-exited', onExit);
    const overall = setTimeout(() => finish(true), limit);
    if (!integration) quietTimer = setTimeout(() => finish(false), 4000);

    typeCommand(session, command);
  });
}

/** Test helper: the marker nonce of a session. */
export function _sessionNonce(sessionId) {
  return sessions.get(sessionId)?.nonce || null;
}

/** Everything needed to show a session to a live-share guest: scrollback and terminal size. */
export function getShareSnapshot(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  return { history: session.history.join(''), cols: session.cols, rows: session.rows, name: session.name, kind: session.kind };
}

/** Raw keystrokes from a live-share guest who was given control by the owner. */
export function writeRawInput(sessionId, data) {
  const session = sessions.get(sessionId);
  if (!session || session.exited) return false;
  session.pty.write(data);
  return true;
}

import pty from 'node-pty';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { getGitStatus } from './gitMonitor.js';
import rules from './rules.json' with { type: 'json' };

// OSC 7 regex: Catches directory changes
const OSC7_REGEX = /\x1b\]7;file:\/\/[^/]*(\/[^\x07]*)\x07/;

// ========================
// PROTOCOL CONSTANTS
// All meta messages between Frontend-Backend go with this prefix.
// Terminal raw output (stdout) goes RAW without prefix.
// This ensures that commands producing JSON (jq, cat file.json) never
// conflict with meta messages.
// ========================
const META = (obj) => 'NEXUS_META:' + JSON.stringify(obj);
const CMD_PREFIX = 'NEXUS_CMD:';

const sessions = new Map(); // sessionId -> { pty, ws, timeout, currentPwd }

export function handleConnection(ws, req, { getCpuUsage }) {
  const url = new URL(req.url, 'http://localhost');
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) return ws.close(4000, 'sessionId is required');

  const platform = os.platform(); // Defined at the top so both blocks can access it

  // ── RECONNECT LOGIC ──────────────────────────────────────────────
  if (sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    clearTimeout(session.timeout);   // Stop the Reaper
    session.timeout = null;
    
    if (session.dataListener) {
      session.dataListener.dispose(); // Clear old listeners securely
    }
    session.ws = ws;
    
    attachListeners(session);
    
    // Attach reaper to new connection
    ws.on('close', () => {
      // Prevent race condition: do not start reaper if a new websocket took over
      if (session.ws !== ws) return;
      
      session.timeout = setTimeout(() => {
        killPty(session.pty, platform);
        setTimeout(() => {
          try { killPty(session.pty, platform, true); } catch (_) {}
          sessions.delete(sessionId);
        }, 2000);
      }, 3000);
    });
    
    return;
  }

  // ── NEW SESSION ───────────────────────────────────────────────────
  const shell = platform === 'win32'
    ? 'powershell.exe'
    : (process.env.SHELL || 'bash');

  const { shellArgs, shellEnv } = buildShellConfig(shell, platform);

  const ptyProcess = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cwd: process.env.HOME || process.env.USERPROFILE || process.cwd(),
    env: shellEnv,
  });

  const session = {
    pty: ptyProcess,
    ws,
    timeout: null,
    currentPwd: process.env.HOME || process.cwd(),
    history: [],
    historySize: 0,
    dataListener: null
  };
  sessions.set(sessionId, session);
  attachListeners(session);

  // ── REAPER: ZOMBIE PROCESS HUNTER ───────────────────────────────────
  ws.on('close', () => {
    // Prevent race condition: do not start reaper if a new websocket took over
    if (session.ws !== ws) return;
    
    session.timeout = setTimeout(() => {
      killPty(ptyProcess, platform);
      setTimeout(() => {
        try { killPty(ptyProcess, platform, true); } catch (_) {}
        sessions.delete(sessionId);
      }, 2000);
    }, 3000);
  });
}

// ──────────────────────────────────────────────────────────────────────
// PTY listener setup
// removeAllListeners is called before every reconnect, preventing accumulation.
// ──────────────────────────────────────────────────────────────────────
function attachListeners(session) {
  const { pty: ptyProcess, ws } = session;

  // Terminal -> Frontend
  session.dataListener = ptyProcess.onData((data) => {
    // Catch OSC 7 broadcast: did the directory change?
    const match = data.match(OSC7_REGEX);
    if (match) {
      let newPwd = decodeURIComponent(match[1]);
      if (os.platform() === 'win32' && newPwd.match(/^\/[a-zA-Z]:\//)) {
        newPwd = newPwd.slice(1);
      }
      session.currentPwd = newPwd;
      // Write to terminal by cleaning the invisible OSC sequence
      const cleanData = data.replace(OSC7_REGEX, '');
      if (cleanData) {
        // Add to history
        session.history.push(cleanData);
        session.historySize += cleanData.length;
        while (session.historySize > 100000 && session.history.length > 1) {
          session.historySize -= session.history.shift().length;
        }
        ws.send(cleanData);
      }
      ws.send(META({ type: 'DIR_CHANGE', payload: newPwd }));

      // Also update git status
      getGitStatus(newPwd, (gitInfo) => {
        ws.send(META({ type: 'GIT_STATUS', payload: gitInfo }));
      });
      return;
    }

    // Add to history
    session.history.push(data);
    session.historySize += data.length;
    while (session.historySize > 100000 && session.history.length > 1) {
      session.historySize -= session.history.shift().length;
    }

    // Error rule match (Rule Engine)
    const matchedRule = rules.find(r => data.includes(r.match));
    if (matchedRule) {
      ws.send(META({ type: 'ERROR', rule: matchedRule }));
    }

    ws.send(data); // RAW terminal output
  });

  // Frontend -> Terminal
  ws.on('message', (msg) => {
    const data = msg.toString();
    if (data.startsWith(CMD_PREFIX)) {
      try {
        const cmd = JSON.parse(data.slice(CMD_PREFIX.length));
        if (cmd.type === 'ACTION' && typeof cmd.command === 'string') {
          ptyProcess.write(`${cmd.command}\r`);
        } else if (cmd.type === 'RESIZE') {
          ptyProcess.resize(cmd.cols, cmd.rows);
        } else if (cmd.type === 'READY') {
          // Frontend is sized and ready, send history chunks
          if (session.history && session.history.length > 0) {
            // Send a clear command to ensure terminal is clean before restoring
            ws.send('\x1b[2J\x1b[3J\x1b[H');
            session.history.forEach(chunk => ws.send(chunk));
          }
        }
      } catch (_) { /* Malformed JSON: ignore */ }
    } else {
      ptyProcess.write(data); // Raw keystroke
    }
  });
}

// ──────────────────────────────────────────────────────────────────────
// OSC 7 injection configuration according to the Shell
// ──────────────────────────────────────────────────────────────────────
function buildShellConfig(shell, platform) {
  let shellArgs = [];
  let shellEnv = { ...process.env };

  if (shell.includes('bash')) {
    const initPath = path.join(os.tmpdir(), 'nexus_bash_init.sh');
    fs.writeFileSync(
      initPath,
      `PROMPT_COMMAND='printf "\\e]7;file://%s%s\\a" "$HOSTNAME" "$PWD"'\n`
    );
    shellArgs = ['--rcfile', initPath];

  } else if (shell.includes('zsh')) {
    // Zsh doesn't take --rcfile parameter. It loads its own .zshrc with ZDOTDIR variable.
    const zDotDir = path.join(os.tmpdir(), 'nexus_zsh_conf');
    fs.mkdirSync(zDotDir, { recursive: true });
    fs.writeFileSync(
      path.join(zDotDir, '.zshrc'),
      `precmd() { printf "\\e]7;file://%s%s\\a" "$HOST" "$PWD" }\n`
    );
    shellEnv.ZDOTDIR = zDotDir;

  } else if (platform === 'win32') {
    // PowerShell: OSC 7 broadcast by overriding prompt function
    const initPath = path.join(os.tmpdir(), 'nexus_pwsh_init.ps1');
    fs.writeFileSync(
      initPath,
      `function prompt {\n` +
      `  $p = $PWD.Path -replace '\\\\', '/'\n` +
      `  return "$([char]27)]7;file://$env:COMPUTERNAME/$p$([char]7)PS> "\n` +
      `}\n`
    );
    shellArgs = ['-NoExit', '-File', initPath];
  }

  return { shellArgs, shellEnv };
}

// ──────────────────────────────────────────────────────────────────────
// Secure kill depending on the Platform
// There is no SIGTERM signal on Windows, node-pty's own kill() is used.
// ──────────────────────────────────────────────────────────────────────
function killPty(ptyProcess, platform, force = false) {
  if (platform === 'win32') {
    ptyProcess.kill(); // node-pty Windows implementation
  } else {
    ptyProcess.kill(force ? 'SIGKILL' : 'SIGTERM');
  }
}

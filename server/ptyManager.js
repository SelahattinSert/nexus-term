import pty from 'node-pty';
import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import levenshtein from 'fast-levenshtein';
import { getSystemExecutables } from './pathScanner.js';
import { getGitStatus, fetchAndGetGitStatus } from './gitMonitor.js';
import { analyzeCommandError } from './llmService.js';

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

export function getAvailableShells() {
  const shells = [];
  const addShell = (name, executable) => {
    if (fs.existsSync(executable)) {
      shells.push({ name, path: executable });
    }
  };

  // PowerShell 7+
  addShell('PowerShell', 'C:\\Program Files\\PowerShell\\7\\pwsh.exe');
  // Windows PowerShell
  addShell('Windows PowerShell', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  // Command Prompt
  addShell('Command Prompt', 'C:\\Windows\\System32\\cmd.exe');
  // Git Bash
  addShell('Git Bash', 'C:\\Program Files\\Git\\bin\\bash.exe');
  
  // Add WSL if available
  const wslPath = 'C:\\Windows\\System32\\wsl.exe';
  if (fs.existsSync(wslPath)) {
      shells.push({ name: 'WSL', path: wslPath });
  }

  // Add Unix shells if applicable
  if (os.platform() !== 'win32') {
    addShell('bash', '/bin/bash');
    addShell('zsh', '/bin/zsh');
    addShell('sh', '/bin/sh');
  }

  return shells;
}

export function createTerminal(sessionId, options = {}) {
  // If session already exists, don't recreate - return existing PTY
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId).pty;
  }

  const platform = os.platform();
  const shell = options.shell || (platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash'));

  const { shellArgs, shellEnv } = buildShellConfig(shell, platform);

  const ptyProcess = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols: options.cols || 80,
    rows: options.rows || 24,
    cwd: options.cwd || process.env.HOME || process.env.USERPROFILE || process.cwd(),
    env: shellEnv,
  });

  const session = {
    pty: ptyProcess,
    ws: null,
    timeout: null,
    currentPwd: process.env.HOME || process.cwd(),
    history: [],
    historySize: 0,
    dataListener: null,
    oscBuffer: ''
  };
  sessions.set(sessionId, session);
  
  // Attach PTY data listener immediately to buffer history
  session.dataListener = ptyProcess.onData((data) => {
    session.oscBuffer += data;
    
    // Process OSC 7 (Directory Change)
    let match7;
    const osc7Regex = /\x1b\]7;file:\/\/[^/]*(\/[^\x07]*)\x07/g;
    while ((match7 = osc7Regex.exec(session.oscBuffer)) !== null) {
      let newPwd = decodeURIComponent(match7[1]);
      if (os.platform() === 'win32' && newPwd.match(/^\/[a-zA-Z]:\//)) {
        newPwd = newPwd.slice(1);
      }
      session.currentPwd = newPwd;
      if (session.ws && session.ws.readyState === 1) {
        session.ws.send(META({ type: 'DIR_CHANGE', payload: newPwd }));
        getGitStatus(newPwd, (gitInfo) => {
          if (session.ws && session.ws.readyState === 1) session.ws.send(META({ type: 'GIT_STATUS', payload: gitInfo }));
        });
      }
    }
    session.oscBuffer = session.oscBuffer.replace(osc7Regex, '');

    // Process OSC 999 (Structured Events from Shell Hook)
    let match999;
    const osc999Regex = /\x1b\]999;([^\x07]+)\x07/g;
    while ((match999 = osc999Regex.exec(session.oscBuffer)) !== null) {
      try {
        const payload = JSON.parse(match999[1]);
        if (payload.type === 'COMMAND_FAILED' && session.ws && session.ws.readyState === 1) {
          handleCommandFailed(session, payload);
        }
      } catch (e) {
        console.error('Failed to parse OSC 999 payload', e);
      }
    }
    session.oscBuffer = session.oscBuffer.replace(osc999Regex, '');

    // Prevent buffer memory leak
    if (session.oscBuffer.length > 4000) {
      session.oscBuffer = session.oscBuffer.slice(-2000);
    }

    // History management
    session.history.push(data);
    session.historySize += data.length;
    while (session.historySize > 100000 && session.history.length > 1) {
      session.historySize -= session.history.shift().length;
    }
    
    // Clean OSC 999 from the raw data sent to xterm.js (so user doesn't see JSON)
    let rawToFrontend = data.replace(/\x1b\]999;([^\x07]+)\x07/g, '');
    
    if (session.ws && session.ws.readyState === 1) {
      session.ws.send(rawToFrontend); // RAW terminal output
    }
  });

  return ptyProcess;
}

export function handleConnection(ws, req, { getCpuUsage }) {
  const url = new URL(req.url, 'http://localhost');
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) return ws.close(4000, 'sessionId is required');

  const platform = os.platform(); // Defined at the top so both blocks can access it

  // ── RECONNECT OR CONNECT LOGIC ───────────────────────────────────────
  if (!sessions.has(sessionId)) {
    // If not created via POST /api/terminals, create a default one
    createTerminal(sessionId);
  }

  const session = sessions.get(sessionId);
  clearTimeout(session.timeout);   // Stop the Reaper
  session.timeout = null;
  
  session.ws = ws;
  
  // We only attach WS message listener here, PTY onData is attached in createTerminal
  ws.on('message', (msg) => {
    const data = msg.toString();
    if (data.startsWith(CMD_PREFIX)) {
      try {
        const cmd = JSON.parse(data.slice(CMD_PREFIX.length));
        if (cmd.type === 'ACTION' && typeof cmd.command === 'string') {
          session.pty.write(`${cmd.command}\r`);
        } else if (cmd.type === 'RESIZE') {
          session.pty.resize(cmd.cols, cmd.rows);
        } else if (cmd.type === 'READY') {
          if (session.history && session.history.length > 0) {
            ws.send('\x1b[2J\x1b[3J\x1b[H');
            session.history.forEach(chunk => {
              let rawToFrontend = chunk.replace(/\x1b\]999;([^\x07]+)\x07/g, '');
              ws.send(rawToFrontend);
            });
          }
          getSystemExecutables().then(execs => {
            if (ws.readyState === 1) ws.send(META({ type: 'EXECUTABLES', payload: execs }));
          });
        }
      } catch (_) { /* Malformed JSON: ignore */ }
    } else {
      session.pty.write(data); // Raw keystroke
    }
  });
  
  // Attach reaper to connection
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
}

async function handleCommandFailed(session, payload) {
  const { ws } = session;
  const executables = await getSystemExecutables();
  const fullCmd = payload.cmd.trim();
  const hasArguments = fullCmd.includes(' ');
  const extractedCommand = fullCmd.split(' ')[0].trim();
  
  if (!extractedCommand) return;

  const isCommandValid = executables.includes(extractedCommand);

  let bestMatch = null;
  let bestDist = Infinity;
  let closestCommands = [];
  const popularCommands = ['git', 'npm', 'docker', 'cd', 'ls', 'yarn', 'pnpm', 'npx', 'node', 'code', 'python', 'pip', 'az', 'aws', 'kubectl'];

  // Phase 1: Local heuristics - find the closest valid executables if the command is invalid
  if (!isCommandValid) {
    const scored = executables.map(cmd => {
      let dist = levenshtein.get(extractedCommand, cmd);
      if (popularCommands.includes(cmd)) dist -= 1.1; // Boost popular commands
      return { cmd, dist };
    });
    
    scored.sort((a, b) => a.dist - b.dist);
    closestCommands = scored.slice(0, 10).map(x => x.cmd);
    
    bestMatch = closestCommands[0];
    bestDist = scored[0].dist;
  }

  const errorId = crypto.randomUUID();
  const matchedRule = {
    id: errorId,
    description: `Command failed with exit code ${payload.exitCode}.`,
    actions: []
  };

  // Only suggest direct local fix if it's a single word and we are very confident (dist 1-2)
  if (!isCommandValid && !hasArguments && bestMatch && bestDist <= 1.5) {
    matchedRule.description = `Did you mean '${bestMatch}'?`;
    matchedRule.actions = [{
      label: `Run '${bestMatch}'`,
      command: bestMatch
    }];
  } else {
    // Phase 2: Everything else goes to LLM. We will pass closestCommands to the LLM as a hint.
    matchedRule.description = `Analyzing error with local AI...`;
    ws.send(META({ type: 'ERROR', rule: matchedRule, errorId }));

    try {
      // Pass closestCommands as a hint to the LLM
      const llmSuggestion = await analyzeCommandError({ ...payload, closestCommands });
      // Ensure LLM didn't just repeat the same failing command
      if (llmSuggestion && llmSuggestion.toLowerCase() !== fullCmd.toLowerCase()) {
        matchedRule.description = `AI Suggestion: '${llmSuggestion}'`;
        matchedRule.actions = [{
          label: `Run '${llmSuggestion}'`,
          command: llmSuggestion
        }];
        ws.send(META({ type: 'ERROR', rule: matchedRule, errorId }));
      } else {
        // If LLM has no better idea, update the UI
        matchedRule.description = `Command '${extractedCommand}' failed. Check your arguments.`;
        ws.send(META({ type: 'ERROR', rule: matchedRule, errorId }));
      }
    } catch (error) {
      console.error('LLM Analysis failed:', error.message);
    }
    return;
  }

  ws.send(META({ type: 'ERROR', rule: matchedRule, errorId }));
}

// ──────────────────────────────────────────────────────────────────────
// PTY listener setup
// ──────────────────────────────────────────────────────────────────────
function attachListeners(session) {
  const { pty: ptyProcess, ws } = session;

  // Terminal -> Frontend
  session.dataListener = ptyProcess.onData((data) => {
    session.oscBuffer += data;
    
    // Process OSC 7 (Directory Change)
    let match7;
    const osc7Regex = /\x1b\]7;file:\/\/[^/]*(\/[^\x07]*)\x07/g;
    while ((match7 = osc7Regex.exec(session.oscBuffer)) !== null) {
      let newPwd = decodeURIComponent(match7[1]);
      if (os.platform() === 'win32' && newPwd.match(/^\/[a-zA-Z]:\//)) {
        newPwd = newPwd.slice(1);
      }
      session.currentPwd = newPwd;
      ws.send(META({ type: 'DIR_CHANGE', payload: newPwd }));
      getGitStatus(newPwd, (gitInfo) => {
        ws.send(META({ type: 'GIT_STATUS', payload: gitInfo }));
      });
    }
    session.oscBuffer = session.oscBuffer.replace(osc7Regex, '');

    // Process OSC 999 (Structured Events from Shell Hook)
    let match999;
    const osc999Regex = /\x1b\]999;([^\x07]+)\x07/g;
    while ((match999 = osc999Regex.exec(session.oscBuffer)) !== null) {
      try {
        const payload = JSON.parse(match999[1]);
        if (payload.type === 'COMMAND_FAILED') {
          handleCommandFailed(session, payload);
        }
      } catch (e) {
        console.error('Failed to parse OSC 999 payload', e);
      }
    }
    session.oscBuffer = session.oscBuffer.replace(osc999Regex, '');

    // Prevent buffer memory leak
    if (session.oscBuffer.length > 4000) {
      session.oscBuffer = session.oscBuffer.slice(-2000);
    }

    // History management
    session.history.push(data);
    session.historySize += data.length;
    while (session.historySize > 100000 && session.history.length > 1) {
      session.historySize -= session.history.shift().length;
    }
    
    // Clean OSC 999 from the raw data sent to xterm.js (so user doesn't see JSON)
    let rawToFrontend = data.replace(/\x1b\]999;([^\x07]+)\x07/g, '');
    
    ws.send(rawToFrontend); // RAW terminal output
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
          if (session.history && session.history.length > 0) {
            ws.send('\x1b[2J\x1b[3J\x1b[H');
            session.history.forEach(chunk => ws.send(chunk));
          }
          getSystemExecutables().then(execs => {
            ws.send(META({ type: 'EXECUTABLES', payload: execs }));
          });
        }
      } catch (_) { /* Malformed JSON: ignore */ }
    } else {
      ptyProcess.write(data); // Raw keystroke
    }
  });
}

// ──────────────────────────────────────────────────────────────────────
// OSC injection configuration according to the Shell
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
    const zDotDir = path.join(os.tmpdir(), 'nexus_zsh_conf');
    fs.mkdirSync(zDotDir, { recursive: true });
    fs.writeFileSync(
      path.join(zDotDir, '.zshrc'),
      `precmd() { printf "\\e]7;file://%s%s\\a" "$HOST" "$PWD" }\n`
    );
    shellEnv.ZDOTDIR = zDotDir;

  } else if (platform === 'win32') {
    // PowerShell: OSC 7 (DIR) and OSC 999 (EVENTS) injection
    const initPath = path.join(os.tmpdir(), 'nexus_pwsh_init.ps1');
    fs.writeFileSync(
      initPath,
      `$global:OriginalPrompt = $function:prompt\n` +
      `function global:prompt {\n` +
      `  $success = $?\n` +
      `  $exitCode = $LASTEXITCODE\n` +
      `  if (-not $success) {\n` +
      `    $lastCommandObj = Get-History -Count 1\n` +
      `    $lastCommand = ""\n` +
      `    if ($lastCommandObj) {\n` +
      `      $lastCommand = $lastCommandObj.CommandLine.Trim()\n` +
      `    } elseif ($Error.Count -gt 0) {\n` +
      `      $lastCommand = $Error[0].InvocationInfo.Line.Trim()\n` +
      `    }\n` +
      `    if ($lastCommand) {\n` +
      `      $payload = @{ type = "COMMAND_FAILED"; cmd = $lastCommand; exitCode = $exitCode; cwd = $PWD.Path } | ConvertTo-Json -Compress\n` +
      `      Write-Host "$([char]27)]999;$payload$([char]7)" -NoNewline\n` +
      `    }\n` +
      `  }\n` +
      `  $p = $PWD.Path -replace '\\\\', '/'\n` +
      `  Write-Host "$([char]27)]7;file://$env:COMPUTERNAME/$p$([char]7)" -NoNewline\n` +
      `  return & $global:OriginalPrompt\n` +
      `}\n`
    );
    shellArgs = ['-NoExit', '-File', initPath];
  }

  return { shellArgs, shellEnv };
}

function killPty(ptyProcess, platform, force = false) {
  if (platform === 'win32') {
    ptyProcess.kill();
  } else {
    ptyProcess.kill(force ? 'SIGKILL' : 'SIGTERM');
  }
}

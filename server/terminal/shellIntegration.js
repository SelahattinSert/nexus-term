import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nexusPath, ensurePrivateDirSync } from '../utils/paths.js';

/**
 * Shell integration.
 *
 * The scripts in ./scripts load the user's own startup files first (aliases, PATH and prompts keep
 * working), then add hooks that report to NexusTerm through OSC escape sequences
 * (the FinalTerm / VS Code convention):
 *
 *   OSC 633;<nonce>;A        prompt start       OSC 633;<nonce>;C         output starts
 *   OSC 633;<nonce>;B        prompt end         OSC 633;<nonce>;D;<exit>  command finished
 *   OSC 633;<nonce>;E;<cmd>  command line       OSC 633;<nonce>;W;<path>  working directory
 *   (<cmd> and <path> have \\ and \n escaped)
 *
 * The nonce is a per-session secret passed in NEXUS_SHELL_NONCE and removed from the environment by
 * the scripts, so text printed by programs (cat, logs, remote hosts) cannot forge markers.
 *
 * They are copied into a private per-user directory (0700) instead of fixed names in the shared /tmp.
 */

const SCRIPTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scripts');

function readScript(name) {
  return fs.readFileSync(path.join(SCRIPTS_DIR, name), 'utf8');
}

function install(source, target) {
  const content = readScript(source);
  try {
    if (fs.readFileSync(target, 'utf8') === content) return target;
  } catch { /* write below */ }
  fs.writeFileSync(target, content, { encoding: 'utf8', mode: 0o600 });
  return target;
}

export function getIntegrationDir() {
  return nexusPath('shell-integration');
}

/** Normalized shell kind used for integration decisions. */
export function shellKind(shell) {
  const base = path.basename(shell || '').toLowerCase().replace(/\.exe$/, '');
  if (base === 'bash') return 'bash';
  if (base === 'zsh') return 'zsh';
  if (base === 'pwsh' || base === 'powershell') return 'pwsh';
  return 'other';
}

/**
 * Returns spawn arguments and environment that enable shell integration for the given shell.
 * Unknown shells (cmd.exe, fish, sh, ...) run unmodified.
 */
export function buildShellConfig(shell, nonce) {
  const shellEnv = { ...process.env, TERM_PROGRAM: 'NexusTerm' };
  delete shellEnv.NEXUS_SHELL_NONCE;
  const kind = shellKind(shell);
  if (kind === 'other') return { shellArgs: [], shellEnv };

  const dir = ensurePrivateDirSync(getIntegrationDir());
  if (nonce) shellEnv.NEXUS_SHELL_NONCE = nonce;

  if (kind === 'bash') {
    return { shellArgs: ['--rcfile', install('bashrc.sh', path.join(dir, 'bashrc'))], shellEnv };
  }

  if (kind === 'zsh') {
    const zdot = ensurePrivateDirSync(path.join(dir, 'zsh'));
    install('zshenv.zsh', path.join(zdot, '.zshenv'));
    install('zshrc.zsh', path.join(zdot, '.zshrc'));
    if (process.env.ZDOTDIR && process.env.ZDOTDIR !== zdot) shellEnv.NEXUS_USER_ZDOTDIR = process.env.ZDOTDIR;
    shellEnv.ZDOTDIR = zdot;
    return { shellArgs: [], shellEnv };
  }

  return { shellArgs: ['-NoExit', '-File', install('init.ps1', path.join(dir, 'init.ps1'))], shellEnv };
}

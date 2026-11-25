import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * Root directory for all NexusTerm state (config, SSH profiles, memory, notebook, audit log).
 * Resolved lazily so tests (and power users) can redirect it with NEXUSTERM_HOME.
 */
export function getNexusHome() {
  return process.env.NEXUSTERM_HOME || path.join(os.homedir(), '.nexusterm');
}

export function nexusPath(...parts) {
  return path.join(getNexusHome(), ...parts);
}

/** Ensures a directory exists and is only accessible by the current user (0700). */
export function ensurePrivateDirSync(dir = getNexusHome()) {
  const home = getNexusHome();
  if (dir !== home && dir.startsWith(home + path.sep)) ensurePrivateDirSync(home);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch { /* not supported on this platform */ }
  return dir;
}

export async function ensurePrivateDir(dir = getNexusHome()) {
  const home = getNexusHome();
  if (dir !== home && dir.startsWith(home + path.sep)) await ensurePrivateDir(home);
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  try { await fsp.chmod(dir, 0o700); } catch { /* not supported on this platform */ }
  return dir;
}

/** Writes a file readable/writable only by the current user (0600), fixing permissions of pre-existing files. */
export async function writePrivateFile(file, data) {
  await ensurePrivateDir(path.dirname(file));
  await fsp.writeFile(file, data, { encoding: 'utf8', mode: 0o600 });
  try { await fsp.chmod(file, 0o600); } catch { /* not supported on this platform */ }
}

export function writePrivateFileSync(file, data) {
  ensurePrivateDirSync(path.dirname(file));
  fs.writeFileSync(file, data, { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* not supported on this platform */ }
}

export function appendPrivateFileSync(file, data) {
  ensurePrivateDirSync(path.dirname(file));
  fs.appendFileSync(file, data, { encoding: 'utf8', mode: 0o600 });
}

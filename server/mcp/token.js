import fs from 'fs';
import crypto from 'crypto';
import { nexusPath, writePrivateFileSync } from '../utils/paths.js';

/**
 * Persistent bearer token for the MCP endpoint (`<NEXUSTERM_HOME>/mcp-token`, 0600).
 * Separate from the per-launch UI token so agent configuration survives restarts.
 */

const tokenFile = () => nexusPath('mcp-token');

export function readMcpToken() {
  try {
    const value = fs.readFileSync(tokenFile(), 'utf8').trim();
    return /^[0-9a-f]{48}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function getMcpToken() {
  return readMcpToken() || rotateMcpToken();
}

export function rotateMcpToken() {
  const token = crypto.randomBytes(24).toString('hex');
  writePrivateFileSync(tokenFile(), token);
  return token;
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Where the running server can be reached (written at startup, read by the stdio bridge). */
export function writeServerInfo(info) {
  writePrivateFileSync(nexusPath('server.json'), JSON.stringify({ ...info, pid: process.pid }, null, 2));
}

export function readServerInfo() {
  try {
    return JSON.parse(fs.readFileSync(nexusPath('server.json'), 'utf8'));
  } catch {
    return null;
  }
}

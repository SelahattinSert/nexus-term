import fs from 'fs';
import crypto from 'crypto';
import { nexusPath, appendPrivateFileSync } from '../utils/paths.js';
import { broadcast } from './eventBus.js';

/**
 * Append-only record of everything agents did through NexusTerm (`<NEXUSTERM_HOME>/audit.jsonl`, 0600).
 * Rotated at MAX_FILE_BYTES; the most recent entries are kept in memory for the UI.
 */

const MAX_MEMORY = 500;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const auditFile = () => nexusPath('audit.jsonl');

let entries = null;

function loadRecent() {
  entries = [];
  try {
    const lines = fs.readFileSync(auditFile(), 'utf8').split('\n').filter(Boolean);
    for (const line of lines.slice(-MAX_MEMORY)) {
      try { entries.push(JSON.parse(line)); } catch { /* skip */ }
    }
  } catch { /* no log yet */ }
}

/**
 * @param {{client:string, tool:string, risk:string, summary:string, decision:string,
 *          reason?:string, result?:object, durationMs?:number, sessionId?:string}} entry
 */
export function record(entry) {
  if (!entries) loadRecent();
  const full = { id: crypto.randomUUID(), ts: new Date().toISOString(), ...entry };
  entries.push(full);
  if (entries.length > MAX_MEMORY) entries.splice(0, entries.length - MAX_MEMORY);

  try {
    try {
      if (fs.statSync(auditFile()).size > MAX_FILE_BYTES) fs.renameSync(auditFile(), auditFile() + '.1');
    } catch { /* not created yet */ }
    appendPrivateFileSync(auditFile(), JSON.stringify(full) + '\n');
  } catch (err) {
    console.error('[Audit] Failed to write audit log:', err.message);
  }

  broadcast('AUDIT_EVENT', full);
  return full;
}

/** Newest first */
export function list(limit = 100) {
  if (!entries) loadRecent();
  return entries.slice(-Math.min(Math.max(Number(limit) || 100, 1), MAX_MEMORY)).reverse();
}

/** Test helper */
export function _reset() {
  entries = null;
}

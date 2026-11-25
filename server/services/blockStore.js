import fs from 'fs';
import { nexusPath, appendPrivateFileSync, ensurePrivateDirSync } from '../utils/paths.js';

/**
 * Notebook storage: every finished command block, searchable and exportable as a runbook.
 *
 * Blocks are kept in memory (most recent MAX_MEMORY) and, unless disabled in settings, appended to
 * `<NEXUSTERM_HOME>/notebook/blocks.jsonl` (0600). Notes are appended as separate records so the
 * log stays append-only. The file is rotated once it exceeds MAX_FILE_BYTES.
 */

const MAX_MEMORY = 5000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const notebookDir = () => nexusPath('notebook');
const logFile = () => nexusPath('notebook', 'blocks.jsonl');
const rotatedFile = () => nexusPath('notebook', 'blocks.1.jsonl');

let blocks = [];          // oldest first
let byId = new Map();
let persistEnabled = true;
let loaded = false;

function index(block) {
  const existing = byId.get(block.id);
  if (existing) {
    Object.assign(existing, block);
    return existing;
  }
  blocks.push(block);
  byId.set(block.id, block);
  if (blocks.length > MAX_MEMORY) {
    const removed = blocks.splice(0, blocks.length - MAX_MEMORY);
    removed.forEach(b => byId.delete(b.id));
  }
  return block;
}

function readLog(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (rec.kind === 'note') {
          const b = byId.get(rec.id);
          if (b) b.note = rec.note;
        } else if (rec.kind === 'block' && rec.block?.id) {
          index(rec.block);
        }
      } catch { /* skip corrupt line */ }
    }
  } catch { /* no log yet */ }
}

export function load() {
  blocks = [];
  byId = new Map();
  readLog(rotatedFile());
  readLog(logFile());
  loaded = true;
}

function ensureLoaded() {
  if (!loaded) load();
}

function append(record) {
  if (!persistEnabled) return;
  try {
    ensurePrivateDirSync(notebookDir());
    try {
      if (fs.statSync(logFile()).size > MAX_FILE_BYTES) fs.renameSync(logFile(), rotatedFile());
    } catch { /* file does not exist yet */ }
    appendPrivateFileSync(logFile(), JSON.stringify(record) + '\n');
  } catch (err) {
    console.error('[Notebook] Failed to persist block:', err.message);
  }
}

export function setPersistEnabled(enabled) {
  persistEnabled = enabled !== false;
}

export function isPersistEnabled() {
  return persistEnabled;
}

export function addBlock(block) {
  ensureLoaded();
  const stored = index({ note: '', ...block });
  append({ kind: 'block', block: stored });
  return stored;
}

export function getBlock(id) {
  ensureLoaded();
  return byId.get(id) || null;
}

export function annotate(id, note) {
  ensureLoaded();
  const block = byId.get(id);
  if (!block) return null;
  block.note = String(note || '').slice(0, 4000);
  append({ kind: 'note', id, note: block.note });
  return block;
}

/**
 * @param {{q?: string, sessionId?: string, status?: 'failed'|'succeeded', limit?: number, before?: string}} opts
 * @returns newest first
 */
export function search({ q, sessionId, status, limit = 50, before } = {}) {
  ensureLoaded();
  const terms = (q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const max = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const out = [];
  let started = !before;

  for (let i = blocks.length - 1; i >= 0 && out.length < max; i--) {
    const b = blocks[i];
    if (!started) {
      if (b.id === before) started = true;
      continue;
    }
    if (sessionId && b.sessionId !== sessionId) continue;
    if (status === 'failed' && !(b.exitCode !== 0 && b.exitCode !== null)) continue;
    if (status === 'succeeded' && b.exitCode !== 0) continue;
    if (terms.length) {
      const hay = `${b.command}\n${b.cwd}\n${b.note}\n${b.output}`.toLowerCase();
      if (!terms.every(t => hay.includes(t))) continue;
    }
    out.push(b);
  }
  return out;
}

export function clearAll() {
  blocks = [];
  byId = new Map();
  loaded = true;
  for (const f of [logFile(), rotatedFile()]) {
    try { fs.unlinkSync(f); } catch { /* not present */ }
  }
}

function fence(text, lang = '') {
  const longest = Math.max(2, ...((text || '').match(/`+/g) || []).map(m => m.length));
  const ticks = '`'.repeat(longest + 1);
  return `${ticks}${lang}\n${text}\n${ticks}`;
}

function formatDuration(ms) {
  if (ms == null) return '?';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;
}

/** Builds a Markdown runbook from the given block ids (in the given order). */
export function exportMarkdown(ids, { title = 'NexusTerm runbook', includeOutput = true } = {}) {
  ensureLoaded();
  const selected = ids.map(id => byId.get(id)).filter(Boolean);
  const lines = [`# ${title}`, '', `_Exported from NexusTerm on ${new Date().toISOString()}_`, ''];

  selected.forEach((b, i) => {
    const firstLine = (b.command || '(unknown command)').split('\n')[0];
    lines.push(`## ${i + 1}. ${firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine}`, '');
    if (b.note) lines.push(...b.note.split('\n').map(l => `> ${l}`), '');
    const status = b.exitCode === 0 ? 'succeeded' : b.exitCode == null ? 'unknown exit code' : `failed (exit ${b.exitCode})`;
    lines.push(`Directory: \`${b.cwd || '?'}\` · ${status} · ${formatDuration(b.durationMs)}`, '');
    lines.push(fence(b.command || '', 'bash'), '');
    if (includeOutput && b.output) {
      lines.push('<details><summary>Output</summary>', '', fence(b.output), '', '</details>', '');
    }
  });

  return lines.join('\n');
}

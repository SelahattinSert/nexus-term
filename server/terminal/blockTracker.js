import crypto from 'crypto';
import { toPlainText, truncateMiddle, unescapeCommand } from './textUtils.js';

const MAX_RAW = 512 * 1024;     // raw output kept while a command runs
const MAX_STORED = 32 * 1024;   // plain-text output stored per block

function appendCapped(buffer, text) {
  const next = buffer + text;
  if (next.length <= MAX_RAW) return { buffer: next, overflow: false };
  // keep the first quarter and the most recent output
  const head = buffer.slice(0, MAX_RAW / 4);
  return { buffer: head + next.slice(-(MAX_RAW * 3) / 4), overflow: true };
}

/**
 * Turns the OSC 133 / 633 marker stream of one terminal session into "command blocks":
 * { id, sessionId, command, cwd, startedAt, finishedAt, durationMs, exitCode, output, truncated }.
 *
 * Shells that emit OSC 133;C (bash, zsh) give exact output boundaries. PowerShell only reports the
 * end of a command; there the output is the text after the prompt (OSC 133;B) minus the echoed input line.
 */
export class BlockTracker {
  constructor(sessionId, { getCwd, onStart, onFinish, onIntegration }) {
    this.sessionId = sessionId;
    this.getCwd = getCwd;
    this.onStart = onStart || (() => {});
    this.onFinish = onFinish || (() => {});
    this.onIntegration = onIntegration || (() => {});
    this.integration = false;
    this.phase = 'unknown'; // unknown | prompt | input | running
    this.pendingCommand = null;
    this.current = null;
    this.raw = '';
    this.overflow = false;
    this.inputStartedAt = null;
  }

  get isRunning() {
    return this.phase === 'running';
  }

  _markIntegration() {
    if (!this.integration) {
      this.integration = true;
      this.onIntegration();
    }
  }

  handleText(text) {
    if (this.phase === 'running' || this.phase === 'input') {
      const r = appendCapped(this.raw, text);
      this.raw = r.buffer;
      this.overflow = this.overflow || r.overflow;
    }
  }

  /**
   * @param {'A'|'B'|'C'|'D'|'E'} marker  already authenticated by the caller (session nonce)
   * @param {string} arg  exit code for D, escaped command line for E
   */
  handleMarker(marker, arg = '') {
    if (marker === 'E') {
      this.pendingCommand = unescapeCommand(arg);
      return;
    }
    if (!'ABCD'.includes(marker) || marker.length !== 1) return;

    this._markIntegration();

    if (marker === 'A') {
      if (this.phase === 'running') this._finish(null);
      this.phase = 'prompt';
    } else if (marker === 'B') {
      this.phase = 'input';
      this.raw = '';
      this.overflow = false;
      this.inputStartedAt = Date.now();
    } else if (marker === 'C') {
      if (this.phase === 'running') this._finish(null);
      this._start(this.pendingCommand || '', Date.now());
      this.pendingCommand = null;
    } else if (marker === 'D') {
      const exitCode = parseExit(arg);
      if (this.phase === 'running') {
        this._finish(exitCode);
      } else if (this.phase === 'input' && this.pendingCommand) {
        // PowerShell: no OSC 133;C, reconstruct the block from the input phase
        const echoEnd = this.raw.search(/\r?\n/);
        const output = echoEnd === -1 ? '' : this.raw.slice(echoEnd).replace(/^\r?\n/, '');
        this._start(this.pendingCommand, this.inputStartedAt || Date.now());
        this.raw = output;
        this._finish(exitCode);
      }
      this.pendingCommand = null;
      this.phase = 'prompt';
    }
  }

  _start(command, startedAt) {
    this.current = {
      id: crypto.randomUUID(),
      sessionId: this.sessionId,
      command: command.trim(),
      cwd: this.getCwd(),
      startedAt: new Date(startedAt).toISOString(),
      _t: startedAt,
    };
    this.raw = '';
    this.overflow = false;
    this.phase = 'running';
    const { _t, ...pub } = this.current;
    this.onStart(pub);
  }

  /** Output collected so far for the running block (plain text). */
  currentOutput() {
    return this.current ? toPlainText(this.raw) : '';
  }

  _finish(exitCode) {
    if (!this.current) return;
    const finishedAt = Date.now();
    const plain = toPlainText(this.raw).replace(/^\n+/, '').replace(/\s+$/, '');
    const { text, truncated } = truncateMiddle(plain, MAX_STORED);
    const { _t, ...base } = this.current;
    const block = {
      ...base,
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - _t,
      exitCode,
      output: text,
      truncated: truncated || this.overflow,
    };
    this.current = null;
    this.raw = '';
    this.overflow = false;
    this.phase = 'prompt';
    this.onFinish(block);
  }
}

function parseExit(arg) {
  if (!arg) return null;
  const n = Number.parseInt(arg, 10);
  return Number.isNaN(n) ? null : n;
}

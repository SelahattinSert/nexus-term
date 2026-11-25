/**
 * Streaming extractor for the OSC sequences NexusTerm consumes from the shell.
 *
 * PTY output arrives in arbitrary chunks, so an escape sequence can be split across two chunks.
 * This parser keeps an incomplete `ESC ]` sequence until its terminator (BEL or ESC \) arrives,
 * then either consumes it (codes we handle) or passes it through untouched (everything else,
 * e.g. window titles and hyperlinks, which xterm.js renders itself).
 */

const CONSUMED_CODES = new Set(['7', '133', '633', '999']);
const MAX_PENDING = 16 * 1024;

export function createOscStream() {
  let pending = '';

  /**
   * @param {string} chunk
   * @returns {Array<{type:'text', data:string} | {type:'osc', code:string, payload:string}>}
   */
  function push(chunk) {
    let data = pending + chunk;
    pending = '';
    const out = [];
    let textStart = 0;
    let i = 0;

    const flushText = (end) => {
      if (end > textStart) out.push({ type: 'text', data: data.slice(textStart, end) });
    };

    while (i < data.length) {
      const start = data.indexOf('\x1b]', i);
      if (start === -1) break;

      // Find terminator: BEL or ST (ESC \)
      let end = -1;
      let termLen = 0;
      for (let j = start + 2; j < data.length; j++) {
        const ch = data.charCodeAt(j);
        if (ch === 0x07) { end = j; termLen = 1; break; }
        if (ch === 0x1b) {
          if (j + 1 >= data.length) break; // ESC at the very end: wait for more data
          if (data[j + 1] === '\\') { end = j; termLen = 2; break; }
        }
      }

      if (end === -1) {
        // Incomplete sequence: keep it for the next chunk (bounded to avoid unbounded growth)
        if (data.length - start <= MAX_PENDING) {
          flushText(start);
          pending = data.slice(start);
          return out;
        }
        i = start + 2; // give up on this one, emit as text
        continue;
      }

      const body = data.slice(start + 2, end);
      const sep = body.indexOf(';');
      const code = sep === -1 ? body : body.slice(0, sep);

      if (CONSUMED_CODES.has(code)) {
        flushText(start);
        out.push({ type: 'osc', code, payload: sep === -1 ? '' : body.slice(sep + 1) });
        textStart = end + termLen;
      }
      i = end + termLen;
    }

    flushText(data.length);
    return out;
  }

  return { push };
}

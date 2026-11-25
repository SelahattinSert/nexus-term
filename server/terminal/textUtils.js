/**
 * Converts raw terminal output into readable plain text (for agents, search and runbooks).
 * Removes escape sequences, applies backspaces and carriage-return overwrites (progress bars).
 */
export function toPlainText(raw) {
  if (!raw) return '';
  const stripped = raw
    // OSC ... (BEL | ST)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // CSI sequences
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    // Other two-char escapes (charset selection, keypad modes, ...)
    .replace(/\x1b[()][0-9A-Za-z]/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
    .replace(/\r\n/g, '\n');

  const lines = stripped.split('\n').map((line) => {
    // Carriage return: later text overwrites the start of the line
    let current = '';
    for (const segment of line.split('\r')) {
      current = segment.length >= current.length ? segment : segment + current.slice(segment.length);
    }
    // Backspace handling
    if (current.includes('\b')) {
      const chars = [];
      for (const ch of current) {
        if (ch === '\b') chars.pop();
        else chars.push(ch);
      }
      current = chars.join('');
    }
    // Remaining control characters (except tab)
    return current.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
  });

  return lines.join('\n');
}

/** Keeps the head and the tail of a long text, marking the omitted middle. */
export function truncateMiddle(text, max = 32 * 1024) {
  if (!text || text.length <= max) return { text: text || '', truncated: false };
  const head = Math.floor(max * 0.25);
  const tail = max - head;
  const omitted = text.length - head - tail;
  return {
    text: `${text.slice(0, head)}\n… [${omitted} characters omitted] …\n${text.slice(-tail)}`,
    truncated: true,
  };
}

/** Unescapes the command line sent by the shell integration (\\ and \n escapes). */
export function unescapeCommand(value) {
  if (!value) return '';
  return value.replace(/\\(\\|n)/g, (_, c) => (c === 'n' ? '\n' : '\\'));
}

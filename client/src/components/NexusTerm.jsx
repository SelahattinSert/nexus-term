import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useStore } from '../store';
import '@xterm/xterm/css/xterm.css';

export default function NexusTerm({ sessionId }) {
  const divRef = useRef(null);

  useEffect(() => {
    // ── TOKEN: Secure retrieval from URL ──────────────────────────────
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      console.error('NexusTerm: Token not found. Make sure you opened the correct URL.');
      return;
    }

    // ── TERMINAL CREATION ──────────────────────────────────────
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 14,
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
      },
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(divRef.current);
    
    // ── WEBSOCKET ────────────────────────────────────────────────
    const wsUrl = `ws://127.0.0.1:4000?token=${token}&sessionId=${sessionId}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    let isReady = false;

    const trySendReady = () => {
      if (!isReady && ws.readyState === WebSocket.OPEN && term.cols && term.rows) {
        isReady = true;
        ws.send(`NEXUS_CMD:${JSON.stringify({
          type: 'RESIZE',
          cols: term.cols,
          rows: term.rows,
        })}`);
        
        // Wait for next tick to ensure RESIZE is processed before READY
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(`NEXUS_CMD:${JSON.stringify({ type: 'READY' })}`);
          }
        }, 10);
      }
    };

    // Fit needs to happen after a small delay to ensure container is rendered in grids
    setTimeout(() => {
      try {
        fitAddon.fit();
        term.focus();
        trySendReady();
      } catch (err) {}
    }, 50);

    // Expose buffer API for E2E tests (only in test environment)
    if (import.meta.env.MODE === 'test') {
      window.term = term;
    }

    ws.onopen = () => {
      trySendReady();
    };

    // ── INCOMING DATA: Protocol parsing ─────────────────────────
    ws.onmessage = (event) => {
      const data = typeof event.data === 'string'
        ? event.data
        : new TextDecoder().decode(event.data);

      if (data.startsWith('NEXUS_META:')) {
        try {
          const meta = JSON.parse(data.slice(11));
          const { updateSession, addError } = useStore.getState();

          if (meta.type === 'DIR_CHANGE') updateSession(sessionId, { pwd: meta.payload });
          if (meta.type === 'GIT_STATUS') updateSession(sessionId, { gitStatus: meta.payload });
          if (meta.type === 'ERROR') addError(sessionId, meta.rule);
        } catch (_) { /* Malformed JSON: ignore */ }
      } else {
        term.write(data);
      }
    };

    ws.onerror = () => term.write('\r\n\x1b[31m[NexusTerm] Connection error.\x1b[0m\r\n');
    ws.onclose = () => term.write('\r\n\x1b[33m[NexusTerm] Connection lost.\x1b[0m\r\n');

    // ── KEYBOARD: Raw keystroke, not wrapped in JSON ───────────────
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    // ── CLIPBOARD: Copy/Paste support ────────────────────────────
    term.attachCustomKeyEventHandler((e) => {
      // Ctrl+C: Copy if text is selected, otherwise allow SIGINT
      if (e.ctrlKey && e.code === 'KeyC' && e.type === 'keydown') {
        const selection = term.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
          term.clearSelection();
          return false; // Prevent sending SIGINT
        }
      }
      // Let xterm.js and the browser handle Ctrl+V natively
      return true;
    });

    const handleContextMenu = (e) => {
      e.preventDefault();
      const selection = term.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection);
        term.clearSelection();
      } else {
        navigator.clipboard.readText().then((text) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(text);
        });
      }
    };
    
    if (divRef.current) {
      divRef.current.addEventListener('contextmenu', handleContextMenu);
    }

    // ── RESIZE: ResizeObserver for precise container tracking ─────────────────────────────
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
          if (!isReady) {
            trySendReady();
          } else {
            ws.send(`NEXUS_CMD:${JSON.stringify({
              type: 'RESIZE',
              cols: term.cols,
              rows: term.rows,
            })}`);
          }
        }
      } catch (err) {
        // fitAddon might throw if the element is not fully rendered
      }
    });

    if (divRef.current) {
      resizeObserver.observe(divRef.current);
    }

    // ── CLEANUP: Memory leak prevention ──────────────────────────────
    return () => {
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
    };
  }, []);

  return <div ref={divRef} className="w-full h-full bg-[#1e1e2e]" />;
}

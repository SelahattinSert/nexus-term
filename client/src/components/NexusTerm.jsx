import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useStore } from '../store';
import '@xterm/xterm/css/xterm.css';

export default function NexusTerm({ sessionId }) {
  const divRef = useRef(null);
  const [suggestions, setSuggestions] = useState([]);

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
          const { updateSession, addError, setExecutables, setSystemStats } = useStore.getState();

          if (meta.type === 'DIR_CHANGE') updateSession(sessionId, { pwd: meta.payload });
          if (meta.type === 'GIT_STATUS') updateSession(sessionId, { gitStatus: meta.payload });
          if (meta.type === 'ERROR') addError(sessionId, meta.rule);
          if (meta.type === 'EXECUTABLES') setExecutables(meta.payload);
          if (meta.type === 'SYSTEM_STATS') setSystemStats(meta.payload);
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

    // ── AUTOCOMPLETE: Monitor input buffer ────────────────────────
    let typingTimeout;
    term.onKey(({ key, domEvent }) => {
      if (domEvent.key === 'Enter' || domEvent.ctrlKey || domEvent.altKey || domEvent.metaKey) {
        setSuggestions([]);
        return;
      }
      
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        const buffer = term.buffer.active;
        const lineStr = buffer.getLine(buffer.cursorY + buffer.baseY)?.translateToString(true) || '';
        
        // We only care about what's typed before the cursor
        const textBeforeCursor = lineStr.substring(0, buffer.cursorX).trimStart();
        
        // Split by spaces to get the last word being typed
        const words = textBeforeCursor.trim().split(/\s+/);
        const currentWord = words[words.length - 1];
        
        if (currentWord && currentWord.length > 1) {
          const executables = useStore.getState().executables || [];
          const matches = executables
            .filter(e => e.startsWith(currentWord) && e !== currentWord)
            .slice(0, 5); // limit to 5 suggestions
          setSuggestions(matches);
        } else {
          setSuggestions([]);
        }
      }, 100);
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
      
      // Tab Autocomplete insertion
      if (e.code === 'Tab' && e.type === 'keydown' && suggestions.length > 0) {
        // If there's an active suggestion, we could insert it. 
        // For simplicity, we just let the shell's native tab completion handle it
        // but we clear our visual suggestions.
        setSuggestions([]);
      }
      
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

    // ── ERROR ACTION LISTENER ──────────────────────────────────
    const actionListener = (e) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`NEXUS_CMD:${JSON.stringify({
          type: 'ACTION',
          command: e.detail
        })}`);
      }
    };
    
    const metaActionListener = (e) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`NEXUS_CMD:${JSON.stringify(e.detail)}`);
      }
    };

    window.addEventListener(`NEXUS_ACTION_${sessionId}`, actionListener);
    window.addEventListener(`NEXUS_META_ACTION_${sessionId}`, metaActionListener);

    // ── CLEANUP: Memory leak prevention ──────────────────────────────
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener(`NEXUS_ACTION_${sessionId}`, actionListener);
      window.removeEventListener(`NEXUS_META_ACTION_${sessionId}`, metaActionListener);
      clearTimeout(typingTimeout);
      ws.close();
      term.dispose();
    };
  }, [sessionId]);

  return (
    <div className="relative w-full h-full">
      {suggestions.length > 0 && (
        <div className="absolute bottom-4 right-4 z-40 bg-[#313244] border border-[#45475a] rounded-md shadow-lg p-2 flex flex-col gap-1 text-sm text-[#a6adc8] pointer-events-none animate-in fade-in">
          <div className="text-xs text-[#6c7086] mb-1 uppercase tracking-wider">Suggestions</div>
          {suggestions.map((s, i) => (
            <div key={i} className="px-2 py-0.5 rounded bg-[#1e1e2e] text-[#cdd6f4]">
              {s}
            </div>
          ))}
          <div className="text-[10px] text-[#6c7086] mt-1">Press Tab to complete natively</div>
        </div>
      )}
      <div ref={divRef} className="w-full h-full bg-[#1e1e2e]" />
    </div>
  );
}


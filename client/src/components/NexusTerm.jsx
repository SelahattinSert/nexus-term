import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import { useStore } from '../store';
import '@xterm/xterm/css/xterm.css';

export default function NexusTerm({ sessionId }) {
  const divRef = useRef(null);
  const [suggestions, setSuggestions] = useState([]);
  const suggestionsRef = useRef([]);
  const { theme } = useStore();
  const termRef = useRef(null);
  const searchAddonRef = useRef(null);
  
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    suggestionsRef.current = suggestions;
  }, [suggestions]);

  // Update terminal theme when zustand theme changes
  useEffect(() => {
    if (!termRef.current) return;
    
    // We can read the CSS variables from the document element since we set it in App.jsx
    // Wait for the next tick to ensure CSS is applied
    setTimeout(() => {
      const computedStyle = getComputedStyle(document.documentElement);
      const bg = computedStyle.getPropertyValue('--ctp-base').trim() || '#1e1e2e';
      const fg = computedStyle.getPropertyValue('--ctp-text').trim() || '#cdd6f4';
      const cursor = computedStyle.getPropertyValue('--ctp-red').trim() || '#f5e0dc';
      
      termRef.current.options.theme = {
        background: bg,
        foreground: fg,
        cursor: cursor,
        selectionBackground: 'rgba(255, 255, 0, 0.5)', // Bright yellow, very visible
        selectionInactiveBackground: 'rgba(255, 255, 0, 0.3)' // Still bright yellow when unfocused
      };
    }, 50);
  }, [theme]);

  useEffect(() => {
    // ── TOKEN: Secure retrieval from URL ──────────────────────────────
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      console.error('NexusTerm: Token not found. Make sure you opened the correct URL.');
      return;
    }

    // ── TERMINAL CREATION ──────────────────────────────────────
    const computedStyle = getComputedStyle(document.documentElement);
    const bg = computedStyle.getPropertyValue('--ctp-base').trim() || '#1e1e2e';
    const fg = computedStyle.getPropertyValue('--ctp-text').trim() || '#cdd6f4';
    const cursor = computedStyle.getPropertyValue('--ctp-red').trim() || '#f5e0dc';

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 14,
      theme: {
        background: bg,
        foreground: fg,
        cursor: cursor,
        selectionBackground: 'rgba(255, 255, 0, 0.5)',
        selectionInactiveBackground: 'rgba(255, 255, 0, 0.3)'
      },
      cursorBlink: true,
    });
    
    termRef.current = term;

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();
    
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);
    term.open(divRef.current);
    
    searchAddonRef.current = searchAddon;
    
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
      } catch {
        /* Ignore fit error */
      }
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
        } catch { /* Malformed JSON: ignore */ }
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
    term.onKey(({ domEvent }) => {
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

    // ── CLIPBOARD & HOTKEYS: Copy/Paste, Search support ────────────────────────────
    term.attachCustomKeyEventHandler((e) => {
      // Ctrl+F: Open search
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF' && e.type === 'keydown') {
        setIsSearchOpen(true);
        return false; // Prevent browser default search
      }

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
      if (e.code === 'Tab' && e.type === 'keydown' && suggestionsRef.current.length > 0) {
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
      } catch {
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

    const executeCommandListener = (e) => {
      if (e.detail.sessionId === sessionId && ws.readyState === WebSocket.OPEN) {
        ws.send(`NEXUS_CMD:${JSON.stringify({
          type: 'ACTION',
          command: e.detail.command
        })}`);
      }
    };

    window.addEventListener(`NEXUS_ACTION_${sessionId}`, actionListener);
    window.addEventListener(`NEXUS_META_ACTION_${sessionId}`, metaActionListener);
    window.addEventListener('nexus-execute-command', executeCommandListener);

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
      {isSearchOpen && (
        <div className="absolute top-2 right-6 z-50 bg-ctp-mantle border border-ctp-surface1 rounded-lg shadow-xl p-2 flex items-center gap-2 text-sm animate-in fade-in slide-in-from-top-2">
          <Search size={14} className="text-ctp-subtext0" />
          <input 
            autoFocus
            type="text"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              searchAddonRef.current?.findNext(e.target.value, { incremental: true });
            }}
            onKeyDown={(e) => {
               if(e.key === 'Enter') {
                 searchAddonRef.current?.findNext(searchText);
               } else if (e.key === 'Escape') {
                 setIsSearchOpen(false);
                 searchAddonRef.current?.clearSelection();
                 termRef.current?.focus();
               }
            }}
            placeholder="Find in terminal..."
            className="bg-transparent border-none outline-none text-ctp-text w-48 placeholder-ctp-surface2"
          />
          <div className="flex items-center border-l border-ctp-surface0 pl-2 gap-1">
            <button onClick={() => searchAddonRef.current?.findPrevious(searchText)} className="p-1 hover:bg-ctp-surface0 rounded text-ctp-subtext0 hover:text-ctp-text transition-colors">
              <ChevronUp size={14} />
            </button>
            <button onClick={() => searchAddonRef.current?.findNext(searchText)} className="p-1 hover:bg-ctp-surface0 rounded text-ctp-subtext0 hover:text-ctp-text transition-colors">
              <ChevronDown size={14} />
            </button>
            <button onClick={() => { 
              setIsSearchOpen(false); 
              searchAddonRef.current?.clearSelection(); 
              termRef.current?.focus(); 
            }} className="p-1 hover:bg-ctp-surface0 rounded text-ctp-subtext0 hover:text-ctp-red transition-colors ml-1">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="absolute bottom-4 right-4 z-40 bg-ctp-surface0 border border-ctp-surface1 rounded-md shadow-lg p-2 flex flex-col gap-1 text-sm text-ctp-subtext0 pointer-events-none animate-in fade-in">
          <div className="text-xs text-[#6c7086] mb-1 uppercase tracking-wider">Suggestions</div>
          {suggestions.map((s, i) => (
            <div key={i} className="px-2 py-0.5 rounded bg-ctp-base text-ctp-text">
              {s}
            </div>
          ))}
          <div className="text-[10px] text-[#6c7086] mt-1">Press Tab to complete natively</div>
        </div>
      )}
      <div ref={divRef} className="w-full h-full bg-ctp-base" />
    </div>
  );
}


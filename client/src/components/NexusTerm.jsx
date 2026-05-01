import { useEffect, useRef, useState, useMemo } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import { useStore } from '../store';
import { useTerminalWebsocket } from '../hooks/useTerminalWebsocket';
import { Trie } from '../utils/Trie';
import '@xterm/xterm/css/xterm.css';

export default function NexusTerm({ sessionId }) {
  const divRef = useRef(null);
  const [suggestions, setSuggestions] = useState([]);
  const suggestionsRef = useRef([]);
  const { theme } = useStore();
  const termRef = useRef(null);
  const searchAddonRef = useRef(null);
  const fitAddonRef = useRef(null);
  const isReadyRef = useRef(false);
  
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');

  const executableTrie = useMemo(() => new Trie(), []);

  useEffect(() => {
    suggestionsRef.current = suggestions;
  }, [suggestions]);

  // Update terminal theme when zustand theme changes
  useEffect(() => {
    if (!termRef.current) return;
    
    setTimeout(() => {
      const computedStyle = getComputedStyle(document.documentElement);
      const bg = computedStyle.getPropertyValue('--ctp-base').trim() || '#1e1e2e';
      const fg = computedStyle.getPropertyValue('--ctp-text').trim() || '#cdd6f4';
      const cursor = computedStyle.getPropertyValue('--ctp-red').trim() || '#f5e0dc';
      
      termRef.current.options.theme = {
        background: bg,
        foreground: fg,
        cursor: cursor,
        selectionBackground: 'rgba(255, 255, 0, 0.5)',
        selectionInactiveBackground: 'rgba(255, 255, 0, 0.3)'
      };
    }, 50);
  }, [theme]);

  // Listen to executables changes and rebuild Trie
  useEffect(() => {
    return useStore.subscribe(
      (state) => state.executables,
      (executables) => {
        if (executables && executables.length > 0) {
          executableTrie.buildFromList(executables);
        }
      }
    );
  }, [executableTrie]);

  // Use the custom hook for WebSocket and connection logic
  const wsRef = useTerminalWebsocket(sessionId, termRef, fitAddonRef, isReadyRef);

  useEffect(() => {
    const isWindows = navigator.userAgent.includes('Windows');
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 14,
      fontWeight: '550',
      fontWeightBold: '750',
      letterSpacing: -0.5,
      cursorBlink: true,
      windowsMode: isWindows,
    });
    
    termRef.current = term;

    setTimeout(() => {
      if (!termRef.current) return;
      const computedStyle = getComputedStyle(document.documentElement);
      termRef.current.options.theme = {
        background: computedStyle.getPropertyValue('--ctp-base').trim() || '#1e1e2e',
        foreground: computedStyle.getPropertyValue('--ctp-text').trim() || '#cdd6f4',
        cursor: computedStyle.getPropertyValue('--ctp-red').trim() || '#f5e0dc',
        selectionBackground: 'rgba(255, 255, 0, 0.5)',
        selectionInactiveBackground: 'rgba(255, 255, 0, 0.3)'
      };
    }, 50);

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();
    
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);
    term.open(divRef.current);
    
    searchAddonRef.current = searchAddon;
    fitAddonRef.current = fitAddon;

    if (import.meta.env.MODE === 'test') {
      window.term = term;
    }

    // ── AUTOCOMPLETE: Monitor input buffer using Trie ────────────────────────
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
        
        const textBeforeCursor = lineStr.substring(0, buffer.cursorX).trimStart();
        const words = textBeforeCursor.trim().split(/\s+/);
        const currentWord = words[words.length - 1];
        
        if (currentWord && currentWord.length > 1) {
          // Use O(M) Trie search instead of O(N * M) Array filter
          const matches = executableTrie.searchPrefix(currentWord, 6).filter(e => e !== currentWord).slice(0, 5);
          setSuggestions(matches);
        } else {
          setSuggestions([]);
        }
      }, 100);
    });

    // ── CLIPBOARD & HOTKEYS ────────────────────────────
    term.attachCustomKeyEventHandler((e) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF' && e.type === 'keydown') {
        setIsSearchOpen(true);
        return false;
      }

      if (e.ctrlKey && e.code === 'KeyC' && e.type === 'keydown') {
        const selection = term.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
          term.clearSelection();
          return false;
        }
      }
      
      if (e.code === 'Tab' && e.type === 'keydown' && suggestionsRef.current.length > 0) {
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
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.send(text);
        });
      }
    };
    
    if (divRef.current) {
      divRef.current.addEventListener('contextmenu', handleContextMenu);
    }

    // ── RESIZE OBSERVERS ─────────────────────────────
    let ptyResizeTimeout;
    let lastCols = term.cols;
    let lastRows = term.rows;
    term.onResize(({ cols, rows }) => {
      if (cols === lastCols && rows === lastRows) return;
      lastCols = cols;
      lastRows = rows;

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        if (!isReadyRef.current) {
          // handled by trySendReady inside hook
        } else {
          clearTimeout(ptyResizeTimeout);
          ptyResizeTimeout = setTimeout(() => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(`NEXUS_CMD:${JSON.stringify({
                type: 'RESIZE',
                cols,
                rows,
              })}`);
            }
          }, 300);
        }
      }
    });

    let fitTimeout;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(fitTimeout);
      fitTimeout = setTimeout(() => {
        try { fitAddon.fit(); } catch (e) { console.debug('Ignored fit error', e); }
      }, 100);
    });

    if (divRef.current) {
      resizeObserver.observe(divRef.current);
    }

    // ── ERROR ACTION LISTENER ──────────────────────────────────
    const actionListener = (e) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(`NEXUS_CMD:${JSON.stringify({
          type: 'ACTION',
          command: e.detail
        })}`);
      }
    };
    
    const metaActionListener = (e) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(`NEXUS_CMD:${JSON.stringify(e.detail)}`);
      }
    };

    const executeCommandListener = (e) => {
      if (e.detail.sessionId === sessionId && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(`NEXUS_CMD:${JSON.stringify({
          type: 'ACTION',
          command: e.detail.command
        })}`);
      }
    };

    window.addEventListener(`NEXUS_ACTION_${sessionId}`, actionListener);
    window.addEventListener(`NEXUS_META_ACTION_${sessionId}`, metaActionListener);
    window.addEventListener('nexus-execute-command', executeCommandListener);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener(`NEXUS_ACTION_${sessionId}`, actionListener);
      window.removeEventListener(`NEXUS_META_ACTION_${sessionId}`, metaActionListener);
      window.removeEventListener('nexus-execute-command', executeCommandListener);
      clearTimeout(typingTimeout);
      term.dispose();
    };
  }, [sessionId, theme, executableTrie, wsRef]);

  return (
    <div className="relative w-full h-full overflow-hidden">
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
      <div ref={divRef} className="w-full h-full bg-ctp-base overflow-hidden" />
    </div>
  );
}
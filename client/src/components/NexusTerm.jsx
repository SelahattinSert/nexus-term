import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import { useStore } from '../store';
import { getTerminalTheme } from '../themes';
import { useTerminalWebsocket } from '../hooks/useTerminalWebsocket';
import '@xterm/xterm/css/xterm.css';

export default function NexusTerm({ sessionId }) {
  const divRef = useRef(null);
  const theme = useStore(state => state.theme);
  const termRef = useRef(null);
  const searchAddonRef = useRef(null);
  const fitAddonRef = useRef(null);
  const isReadyRef = useRef(false);
  
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [termInstance, setTermInstance] = useState(null);
  
  const memoryNotification = useStore(state => state.memoryNotification);
  const focusedPane = useStore(state => state.focusedPane);

  // Update terminal theme with full 16 ANSI colors when theme changes
  useEffect(() => {
    if (!termRef.current) return;
    const termTheme = getTerminalTheme(theme);
    if (termTheme && Object.keys(termTheme).length > 0) {
      termRef.current.options.theme = termTheme;
    }
  }, [theme]);

  // Use the custom hook for WebSocket and connection logic
  const wsRef = useTerminalWebsocket(sessionId, termInstance, fitAddonRef, isReadyRef);

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
      theme: getTerminalTheme(useStore.getState().theme),
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
    fitAddonRef.current = fitAddon;
    
    // Defer state update to satisfy linting rules for effects
    const timer = setTimeout(() => {
      setTermInstance(term);
    }, 0);

    if (import.meta.env.MODE === 'test') {
      window.term = term;
    }

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
      clearTimeout(timer);
      resizeObserver.disconnect();
      window.removeEventListener(`NEXUS_ACTION_${sessionId}`, actionListener);
      window.removeEventListener(`NEXUS_META_ACTION_${sessionId}`, metaActionListener);
      window.removeEventListener('nexus-execute-command', executeCommandListener);
      term.dispose();
    };
  }, [sessionId, wsRef]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {focusedPane === sessionId && memoryNotification?.visible && (
        <div className="absolute top-2 left-6 z-50 bg-ctp-mantle border border-ctp-yellow rounded-lg shadow-xl px-4 py-2 flex items-center gap-3 text-xs text-ctp-text animate-in fade-in slide-in-from-top-2 border-opacity-70 backdrop-blur-md">
          <span className="text-base">🧠</span>
          <div className="flex flex-col text-left">
            <div className="font-semibold text-ctp-yellow">Using remembered solution</div>
            <div className="text-ctp-subtext0 font-medium">{memoryNotification.message}</div>
          </div>
        </div>
      )}
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

      <div ref={divRef} className="w-full h-full bg-ctp-base overflow-hidden" />
    </div>
  );
}

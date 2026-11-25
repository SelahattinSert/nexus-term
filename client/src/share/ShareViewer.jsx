import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { Radio, Keyboard, Hand, Eye, LogOut, Clock } from 'lucide-react';
import { applyTheme, getTerminalTheme } from '../themes';
import '@xterm/xterm/css/xterm.css';

const NAME_KEY = 'nexusterm-share-name';

function readSavedName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}

function shareToken() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[0] === 'share' ? parts[1] : null;
}

function wsUrl(token, name, rejoinKey) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const rejoin = rejoinKey ? `&rejoin=${encodeURIComponent(rejoinKey)}` : '';
  return `${proto}//${window.location.host}/?share=${encodeURIComponent(token)}&name=${encodeURIComponent(name)}${rejoin}`;
}

// Automatic replies xterm.js generates for terminal queries (DA1/DA2, DSR, cursor position, ...)
// eslint-disable-next-line no-control-regex
const TERMINAL_REPLY = /^(?:\x1b\[[?>]?[\d;]*[cnR]|\x1b\[\d+;\d+R|\x1b\][\d;]*rgb:[^\x07\x1b]*(?:\x07|\x1b\\)|\x1bP[^\x1b]*\x1b\\)+$/;

function Avatar({ guest, isController, isYou }) {
  const color = `var(${guest.color}, var(--ctp-blue))`;
  return (
    <div
      title={`${guest.name}${isYou ? ' (you)' : ''}${isController ? ' — has keyboard control' : ''}`}
      className="relative w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2"
      style={{ borderColor: color, color, backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}
    >
      {guest.name.slice(0, 2).toUpperCase()}
      {isController && <Keyboard size={10} className="absolute -bottom-1 -right-1 rounded-full p-[1px]" style={{ backgroundColor: color, color: 'var(--ctp-crust)' }} />}
    </div>
  );
}

/**
 * Page a guest opens from a live-share link. Read-only by default; the owner can hand over control.
 */
export default function ShareViewer() {
  const token = shareToken();
  const [name, setName] = useState(readSavedName);
  const [joinName, setJoinName] = useState(null); // set once when joining
  const [info, setInfo] = useState(null);           // WELCOME payload
  const [presence, setPresence] = useState({ guests: [], controllerId: null, you: null });
  const [ended, setEnded] = useState(null);
  const [requested, setRequested] = useState(false);
  const [notice, setNotice] = useState(null);
  const [reconnecting, setReconnecting] = useState(false);
  const termDivRef = useRef(null);
  const termRef = useRef(null);
  const wsRef = useRef(null);
  const hasControlRef = useRef(false);

  const hasControl = presence.controllerId && presence.controllerId === presence.you;
  const controller = presence.guests.find(g => g.id === presence.controllerId);

  useEffect(() => {
    hasControlRef.current = !!hasControl;
    if (termRef.current) termRef.current.options.disableStdin = !hasControl;
    if (hasControl) termRef.current?.focus();
  }, [hasControl]);

  const join = useCallback((e) => {
    e?.preventDefault();
    const clean = name.trim().slice(0, 32) || 'Guest';
    try { localStorage.setItem(NAME_KEY, clean); } catch { /* private mode */ }
    setJoinName(clean);
  }, [name]);

  useEffect(() => {
    if (!joinName || !token) return undefined;

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 14,
      cursorBlink: false,
      disableStdin: true,
      scrollback: 5000,
    });
    termRef.current = term;
    term.open(termDivRef.current);
    term.onData((data) => {
      // xterm.js answers terminal queries (device attributes, cursor position, ...) by itself. The
      // owner's terminal already answers them, so forwarding ours would type garbage into the shell.
      if (TERMINAL_REPLY.test(data)) return;
      if (hasControlRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'INPUT', data }));
      }
    });

    let disposed = false;
    let retry = 0;
    let retryTimer = null;
    let rejoinKey = null;

    const connect = () => {
      const ws = new WebSocket(wsUrl(token, joinName, rejoinKey));
      wsRef.current = ws;
      ws.onopen = () => { retry = 0; setReconnecting(false); };
      ws.onmessage = (event) => {
        const data = typeof event.data === 'string' ? event.data : '';
        if (!data.startsWith('NEXUS_META:')) {
          term.write(data);
          return;
        }
        let meta;
        try { meta = JSON.parse(data.slice(11)); } catch { return; }
        if (meta.type === 'WELCOME') {
          rejoinKey = meta.payload.rejoinKey || rejoinKey;
          setInfo(meta.payload);
          if (meta.payload.theme) {
            applyTheme(meta.payload.theme);
            term.options.theme = getTerminalTheme(meta.payload.theme);
          }
          // A (re)join resends the whole screen
          term.reset();
          // Mirror the owner's terminal size so output wraps exactly like on their screen
          if (meta.payload.cols && meta.payload.rows) term.resize(meta.payload.cols, meta.payload.rows);
        } else if (meta.type === 'RESIZE') {
          term.resize(meta.payload.cols, meta.payload.rows);
        } else if (meta.type === 'PRESENCE') {
          setPresence(meta.payload);
          const me = meta.payload.guests.find(g => g.id === meta.payload.you);
          setRequested(!!me?.wantsControl);
        } else if (meta.type === 'CONTROL_DENIED') {
          setRequested(false);
          setNotice(meta.payload?.reason || 'The owner did not hand over control.');
          setTimeout(() => setNotice(null), 5000);
        } else if (meta.type === 'SHARE_ENDED') {
          setEnded(meta.payload.reason || 'The share has ended.');
        }
      };
      ws.onclose = (event) => {
        if (disposed) return;
        // 4403 ended, 4404 invalid/expired, 4429 full: final. Anything else (network blip): retry.
        if ([4403, 4404, 4429].includes(event.code) || retry >= 6) {
          setEnded(prev => prev || (event.code === 4404 ? 'This share link is invalid or has expired.' : 'Disconnected from the shared terminal.'));
          return;
        }
        retry += 1;
        setReconnecting(true);
        retryTimer = setTimeout(connect, 500 * 2 ** retry);
      };
    };
    connect();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      wsRef.current?.close();
      term.dispose();
    };
  }, [joinName, token]);

  const send = (type) => wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify({ type }));

  if (!token) {
    return <div className="h-full grid place-items-center bg-ctp-base text-ctp-text">Invalid share link.</div>;
  }

  if (!joinName) {
    return (
      <div className="h-full grid place-items-center bg-ctp-crust text-ctp-text p-4">
        <form onSubmit={join} className="w-full max-w-sm rounded-2xl border border-ctp-surface0 bg-ctp-mantle p-6 space-y-4 shadow-2xl">
          <div className="flex items-center gap-2">
            <Radio className="text-ctp-red" size={18} />
            <h1 className="font-bold">Join a live NexusTerm session</h1>
          </div>
          <p className="text-sm text-ctp-subtext0">You will watch the terminal live. The owner can give you keyboard control.</p>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            placeholder="Your name"
            className="w-full rounded-lg border border-ctp-surface0 bg-ctp-base px-3 py-2 text-sm outline-none focus:border-ctp-blue"
          />
          <button type="submit" className="w-full rounded-lg bg-ctp-blue text-ctp-crust font-bold py-2 hover:opacity-90">Join</button>
        </form>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-ctp-crust text-ctp-text">
      <header className="flex items-center gap-3 px-4 py-2 border-b border-ctp-surface0 bg-ctp-mantle text-sm">
        <span className="flex items-center gap-1.5 font-bold text-ctp-red">
          <span className="w-2 h-2 rounded-full bg-ctp-red animate-pulse" /> LIVE
        </span>
        <span className="truncate text-ctp-subtext0">{info?.sessionName || 'Shared terminal'}</span>
        {info?.expiresAt && (
          <span className="hidden sm:flex items-center gap-1 text-xs text-ctp-surface2"><Clock size={12} /> until {new Date(info.expiresAt).toLocaleTimeString()}</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {presence.guests.map(g => (
            <Avatar key={g.id} guest={g} isController={g.id === presence.controllerId} isYou={g.id === presence.you} />
          ))}
        </div>
        {!ended && (hasControl ? (
          <button onClick={() => send('RELEASE_CONTROL')} className="flex items-center gap-1 rounded-lg border border-ctp-surface0 px-2.5 py-1 text-xs hover:bg-ctp-surface0">
            <LogOut size={12} /> Release control
          </button>
        ) : (
          <button
            onClick={() => send('REQUEST_CONTROL')}
            disabled={requested}
            className="flex items-center gap-1 rounded-lg bg-ctp-blue text-ctp-crust px-2.5 py-1 text-xs font-bold disabled:opacity-60"
          >
            <Hand size={12} /> {requested ? 'Requested…' : 'Request control'}
          </button>
        ))}
      </header>

      <div className="px-4 py-1.5 text-xs border-b border-ctp-surface0 flex items-center gap-1.5"
        style={{ color: hasControl ? 'var(--ctp-green)' : 'var(--ctp-subtext0)' }}>
        {hasControl ? <><Keyboard size={12} /> You have keyboard control — everything you type runs in the owner&apos;s terminal.</>
          : controller ? <><Keyboard size={12} /> {controller.name} is typing.</>
            : <><Eye size={12} /> Watching (read-only)</>}
        {reconnecting && !ended && <span className="ml-auto text-ctp-yellow">Reconnecting…</span>}
        {notice && <span className="ml-auto text-ctp-yellow">{notice}</span>}
      </div>

      <main className="flex-1 overflow-auto p-3 relative">
        <div ref={termDivRef} className="inline-block" />
        {ended && (
          <div className="absolute inset-0 grid place-items-center bg-ctp-crust/80 backdrop-blur-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--ctp-crust) 85%, transparent)' }}>
            <div className="rounded-xl border border-ctp-surface0 bg-ctp-mantle px-6 py-4 text-sm">{ended}</div>
          </div>
        )}
      </main>
    </div>
  );
}

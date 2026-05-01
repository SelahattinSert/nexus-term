import { useEffect, useRef } from 'react';
import { useStore } from '../store';

export function useTerminalWebsocket(sessionId, termRef, fitAddonRef, isReadyRef) {
  const wsRef = useRef(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token || !termRef.current) return;

    const term = termRef.current;
    const wsUrl = `ws://127.0.0.1:4000?token=${token}&sessionId=${sessionId}`;

    const trySendReady = () => {
      if (!isReadyRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN && term.cols && term.rows) {
        isReadyRef.current = true;
        wsRef.current.send(`NEXUS_CMD:${JSON.stringify({
          type: 'RESIZE',
          cols: term.cols,
          rows: term.rows,
        })}`);
        
        setTimeout(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(`NEXUS_CMD:${JSON.stringify({ type: 'READY' })}`);
          }
        }, 10);
      }
    };

    const initConnection = async () => {
      try {
        const shellPath = useStore.getState().paneShells?.[sessionId];
        await fetch(`/api/terminals?token=${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            sessionId, 
            cols: term.cols || 80, 
            rows: term.rows || 24, 
            shell: shellPath 
          })
        });
      } catch (err) {
        console.error('Failed to init terminal on server:', err);
      }

      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        trySendReady();
      };

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

      term.onData((data) => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
      });
    };

    initConnection();

    setTimeout(() => {
      try {
        fitAddonRef.current?.fit();
        term.focus();
        trySendReady();
      } catch {
        /* Ignore fit error */
      }
    }, 50);

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [sessionId, termRef, fitAddonRef, isReadyRef]);

  return wsRef;
}

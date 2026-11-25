import { useEffect } from 'react';
import { useStore } from '../store';
import { getWsBase } from '../utils/nexusFetch';
import { toast } from 'sonner';

/**
 * One WebSocket per browser window for global events that are not tied to a visible pane:
 * system stats, approval requests from agents, finished command blocks, agent-created sessions.
 * Reconnects with backoff.
 */
export function useControlChannel() {
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) return undefined;

    let ws = null;
    let retry = 0;
    let timer = null;
    let disposed = false;

    const handle = (meta) => {
      const store = useStore.getState();
      switch (meta.type) {
        case 'SYSTEM_STATS':
          store.setSystemStats(meta.payload);
          break;
        case 'APPROVALS_SNAPSHOT':
          store.setServerApprovals(meta.payload);
          break;
        case 'APPROVAL_REQUEST':
          store.addServerApproval(meta.payload);
          break;
        case 'APPROVAL_RESOLVED':
          store.removeServerApproval(meta.payload.id);
          break;
        case 'AUDIT_EVENT':
          store.addAuditEntry(meta.payload);
          break;
        case 'BLOCK_STARTED':
          store.markSessionIntegrated(meta.payload.sessionId);
          window.dispatchEvent(new CustomEvent('nexus-block-started', { detail: meta.payload }));
          break;
        case 'BLOCK_FINISHED':
          store.markSessionIntegrated(meta.payload.sessionId);
          store.receiveBlock(meta.payload);
          window.dispatchEvent(new CustomEvent('nexus-block-finished', { detail: meta.payload }));
          break;
        case 'SESSION_UPDATED':
          if (meta.payload.integration) store.markSessionIntegrated(meta.payload.id);
          break;
        case 'SHARE_UPDATED':
          store.receiveShareUpdate(meta.payload);
          break;
        case 'SHARE_ENDED':
          store.receiveShareEnded(meta.payload);
          break;
        case 'SHARE_CONTROL_REQUEST': {
          const { shareId, guestId, name } = meta.payload;
          let answered = false;
          const deny = () => {
            if (answered) return;
            answered = true;
            store.denyShareControl(shareId, guestId).catch(() => {});
          };
          toast(`${name} asks for keyboard control of your shared terminal`, {
            id: `control-${guestId}`,
            duration: 20000,
            action: {
              label: 'Allow',
              onClick: () => {
                answered = true;
                store.setShareController(shareId, guestId).catch(() => toast.error('Could not hand over control'));
              },
            },
            cancel: { label: 'Deny', onClick: deny },
            // Ignoring the request counts as a "no", so the guest is not left waiting forever
            onAutoClose: deny,
            onDismiss: deny,
          });
          break;
        }
        case 'SESSIONS_SNAPSHOT':
          // Lets listeners (e.g. the orb mood) drop state for commands that finished while disconnected
          window.dispatchEvent(new CustomEvent('nexus-sessions-snapshot', { detail: meta.payload || [] }));
          for (const s of meta.payload || []) {
            if (s.exited || !String(s.createdBy || '').startsWith('mcp:')) continue;
            if (store.sessions.some(x => x.id === s.id)) continue;
            store.createSession({ id: s.id, name: s.name, isSsh: s.kind === 'ssh', sshProfileId: s.sshProfileId, createdBy: s.createdBy, focus: false });
            if (s.integration) store.markSessionIntegrated(s.id);
          }
          break;
        case 'SESSION_CREATED':
          // A terminal opened by an agent: show it as a tab without stealing focus
          store.createSession({
            id: meta.payload.id,
            name: meta.payload.name,
            isSsh: meta.payload.kind === 'ssh',
            sshProfileId: meta.payload.sshProfileId,
            createdBy: meta.payload.createdBy,
            focus: false,
          });
          break;
        default:
          break;
      }
    };

    const connect = () => {
      if (disposed) return;
      ws = new WebSocket(`${getWsBase()}/?token=${encodeURIComponent(token)}&channel=control`);
      ws.onopen = () => { retry = 0; };
      ws.onmessage = (event) => {
        if (typeof event.data !== 'string' || !event.data.startsWith('NEXUS_META:')) return;
        try {
          handle(JSON.parse(event.data.slice('NEXUS_META:'.length)));
        } catch { /* ignore malformed */ }
      };
      ws.onclose = () => {
        if (disposed) return;
        retry = Math.min(retry + 1, 6);
        timer = setTimeout(connect, 500 * 2 ** retry);
      };
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, []);
}

/**
 * Resolves when the next command block finishes in `sessionId` (exact completion through shell
 * integration). Falls back to a short fixed delay for shells without integration.
 */
export function waitForCommandCompletion(sessionId, { timeoutMs = 120000, fallbackMs = 2000 } = {}) {
  const integrated = !!useStore.getState().integratedSessions[sessionId];
  if (!integrated) {
    return new Promise(resolve => setTimeout(() => resolve({ integrated: false }), fallbackMs));
  }
  return new Promise((resolve) => {
    let settle = null;
    const blocks = [];
    const done = (timedOut) => {
      window.removeEventListener('nexus-block-finished', onFinish);
      window.removeEventListener('nexus-block-started', onStart);
      clearTimeout(overall);
      clearTimeout(settle);
      resolve({ integrated: true, timedOut, blocks });
    };
    const onStart = (e) => { if (e.detail.sessionId === sessionId) clearTimeout(settle); };
    const onFinish = (e) => {
      if (e.detail.sessionId !== sessionId) return;
      blocks.push(e.detail);
      clearTimeout(settle);
      settle = setTimeout(() => done(false), 300); // multi-line commands produce several blocks
    };
    window.addEventListener('nexus-block-finished', onFinish);
    window.addEventListener('nexus-block-started', onStart);
    const overall = setTimeout(() => done(true), timeoutMs);
  });
}

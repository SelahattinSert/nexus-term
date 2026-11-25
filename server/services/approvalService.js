import crypto from 'crypto';
import { broadcast, hasControlClients } from './eventBus.js';

/**
 * Server-side approval gate.
 *
 * Any actor that is not the human typing in the terminal (MCP agents today) must pass through here
 * before doing something with side effects. Requests are pushed to every open NexusTerm window; the
 * first answer wins. The gate fails closed: no open window, timeout or server restart = rejected.
 */

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const pending = new Map(); // id -> { request, resolve, timer }

/**
 * @param {{source:string, client?:string, tool:string, risk:string, title:string, command?:string,
 *          details?:object, sessionId?:string, timeoutMs?:number, signal?:AbortSignal}} req
 *   `signal`: when the requester gives up (MCP client timeout/cancel), the request is withdrawn so the
 *   user cannot approve something nobody is waiting for.
 * @returns {Promise<{approved:boolean, reason?:string}>}
 */
export function requestApproval(req) {
  if (req.signal?.aborted) return Promise.resolve({ approved: false, reason: 'Request was cancelled.' });
  if (!hasControlClients()) {
    return Promise.resolve({
      approved: false,
      reason: 'No NexusTerm window is open to approve this action. Ask the user to open NexusTerm in the browser, then retry.',
    });
  }

  const id = crypto.randomUUID();
  const request = {
    id,
    source: req.source,
    client: req.client || 'unknown agent',
    tool: req.tool,
    risk: req.risk,
    title: req.title,
    command: req.command || null,
    details: req.details || null,
    sessionId: req.sessionId || null,
    createdAt: new Date().toISOString(),
  };

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      settle(id, { approved: false, reason: 'Approval request timed out without an answer.' });
    }, req.timeoutMs || DEFAULT_TIMEOUT_MS);
    pending.set(id, { request, resolve, timer });
    req.signal?.addEventListener('abort', () => {
      settle(id, { approved: false, reason: 'The agent cancelled the request (it may have timed out).' });
    }, { once: true });
    broadcast('APPROVAL_REQUEST', request);
  });
}

function settle(id, decision) {
  const entry = pending.get(id);
  if (!entry) return false;
  clearTimeout(entry.timer);
  pending.delete(id);
  entry.resolve(decision);
  broadcast('APPROVAL_RESOLVED', { id, approved: decision.approved });
  return true;
}

export function resolveApproval(id, { approved, reason } = {}) {
  return settle(id, {
    approved: approved === true,
    reason: approved === true ? undefined : (reason ? String(reason).slice(0, 2000) : 'Rejected by the user.'),
  });
}

export function listPending() {
  return [...pending.values()].map(e => e.request);
}

/** Test helper */
export function _rejectAll() {
  for (const id of [...pending.keys()]) settle(id, { approved: false, reason: 'reset' });
}

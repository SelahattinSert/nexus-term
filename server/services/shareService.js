import crypto from 'crypto';
import headless from '@xterm/headless';
import serialize from '@xterm/addon-serialize';
import { bus, broadcast } from './eventBus.js';
import * as audit from './auditLog.js';
import { writeRawInput, getSession, getShareSnapshot } from '../ptyManager.js';
import { safeEqual } from '../mcp/token.js';

const { Terminal: HeadlessTerminal } = headless;
const { SerializeAddon } = serialize;

/**
 * Live terminal sharing.
 *
 * The owner creates a link for ONE terminal session. Anyone with the link can watch it live
 * (read-only). Typing is only possible for the single guest the owner explicitly hands control to,
 * and the owner can take it back or end the share at any time. Links expire.
 *
 * Privacy: guests never receive the session's raw history. Each share keeps a headless terminal
 * that starts from the owner's *visible screen* at share time (serialized in the browser, so text
 * that was cleared or scrolled away is not included) and then follows the live output. Joining
 * guests get a serialized copy of that terminal.
 *
 * Guests never receive the UI token: their WebSocket is authenticated by the share token and can
 * only see this one session's output.
 */

const META = (type, payload) => 'NEXUS_META:' + JSON.stringify({ type, payload });
const MAX_GUESTS = 20;
const DEFAULT_TTL_MIN = 120;
const MAX_TTL_MIN = 24 * 60;
const SHARE_SCROLLBACK = 1000;            // lines kept for late joiners (only output produced while sharing)
const MAX_INITIAL_SCREEN = 512 * 1024;
const MAX_BUFFERED = 4 * 1024 * 1024;     // a guest that stops reading is disconnected beyond this
const CONTROL_REQUEST_COOLDOWN_MS = 30000;
const REJOIN_GRACE_MS = 30000;
// Distinct presence colors, as theme variable names so guests and owner see them in their theme
const COLORS = ['--ctp-peach', '--ctp-green', '--ctp-blue', '--ctp-yellow', '--ctp-lavender', '--ctp-red', '--ctp-maroon'];

const shares = new Map(); // id -> share
let onLastShareEnded = null;

/** Called when no share is active any more (used to close the public tunnel the share feature opened). */
export function setOnLastShareEnded(fn) {
  onLastShareEnded = fn;
}

function connectedGuests(share) {
  return [...share.guests.values()].filter(g => g.ws);
}

function publicShare(share) {
  return {
    id: share.id,
    sessionId: share.sessionId,
    sessionName: share.sessionName,
    createdAt: share.createdAt,
    expiresAt: share.expiresAt,
    controllerId: share.controllerId,
    guests: connectedGuests(share).map(g => ({ id: g.id, name: g.name, color: g.color, joinedAt: g.joinedAt, wantsControl: g.wantsControl })),
  };
}

function sendGuest(guest, type, payload) {
  if (guest.ws?.readyState === 1) guest.ws.send(META(type, payload));
}

/** Sends terminal data, disconnecting guests that do not keep up (no unbounded memory growth). */
function sendData(guest, data) {
  const ws = guest.ws;
  if (!ws || ws.readyState !== 1) return;
  if (ws.bufferedAmount > MAX_BUFFERED) {
    try { ws.close(4408, 'too slow'); } catch { /* ignore */ }
    return;
  }
  ws.send(data);
}

function presence(share) {
  const p = publicShare(share);
  for (const g of share.guests.values()) sendGuest(g, 'PRESENCE', { guests: p.guests, controllerId: p.controllerId, you: g.id });
  broadcast('SHARE_UPDATED', p);
}

function findByToken(token) {
  if (typeof token !== 'string' || token.length !== 64) return null;
  for (const share of shares.values()) {
    if (safeEqual(share.token, token)) return share;
  }
  return null;
}

/**
 * @param {string} sessionId
 * @param {{ttlMinutes?: number, theme?: string, screen?: string}} options
 *   `screen`: the owner's visible screen serialized by the browser (xterm serialize addon, no scrollback)
 * @returns the share (one per session; an existing active share is returned again)
 */
export function createShare(sessionId, { ttlMinutes, theme, screen } = {}) {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');
  if (session.exited) throw new Error('Session has exited');

  for (const s of shares.values()) {
    if (s.sessionId === sessionId) return { ...publicShare(s), token: s.token };
  }

  const size = getShareSnapshot(sessionId) || { cols: 80, rows: 24 };
  const mirror = new HeadlessTerminal({ cols: size.cols || 80, rows: size.rows || 24, scrollback: SHARE_SCROLLBACK, allowProposedApi: true });
  const serializer = new SerializeAddon();
  mirror.loadAddon(serializer);
  if (typeof screen === 'string' && screen) mirror.write(screen.slice(0, MAX_INITIAL_SCREEN));

  const ttl = Math.min(Math.max(Number(ttlMinutes) || DEFAULT_TTL_MIN, 5), MAX_TTL_MIN);
  const share = {
    id: crypto.randomUUID(),
    token: crypto.randomBytes(32).toString('hex'),
    sessionId,
    sessionName: session.name,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ttl * 60000).toISOString(),
    controllerId: null,
    guests: new Map(),
    colorIndex: 0,
    theme: typeof theme === 'string' && /^[a-z0-9-]{1,40}$/.test(theme) ? theme : null,
    mirror,
    serializer,
    lastControlRequestAt: 0,
  };
  share.timer = setTimeout(() => endShare(share.id, 'The share link expired.'), ttl * 60000);
  share.timer.unref?.();
  shares.set(share.id, share);

  audit.record({ client: 'you', tool: 'share_created', risk: 'share', decision: 'allowed', summary: `Shared terminal "${session.name || sessionId}" for ${ttl} min`, sessionId });
  broadcast('SHARE_UPDATED', publicShare(share));
  return { ...publicShare(share), token: share.token };
}

export function listShares() {
  return [...shares.values()].map(s => ({ ...publicShare(s), token: s.token }));
}

export function endShare(id, reason = 'The owner ended the share.') {
  const share = shares.get(id);
  if (!share) return false;
  clearTimeout(share.timer);
  shares.delete(id);
  for (const g of share.guests.values()) {
    clearTimeout(g.graceTimer);
    sendGuest(g, 'SHARE_ENDED', { reason });
    try { g.ws?.close(4403, 'share ended'); } catch { /* already closed */ }
  }
  share.mirror.dispose();
  audit.record({ client: 'you', tool: 'share_ended', risk: 'share', decision: 'allowed', summary: `Stopped sharing "${share.sessionName || share.sessionId}"`, sessionId: share.sessionId });
  broadcast('SHARE_ENDED', { id, sessionId: share.sessionId });
  if (shares.size === 0) onLastShareEnded?.();
  return true;
}

/** Owner hands keyboard control to a guest (guestId) or takes it back (null). */
export function setController(id, guestId) {
  const share = shares.get(id);
  if (!share) return false;
  if (guestId && !share.guests.get(guestId)?.ws) return false;
  share.controllerId = guestId || null;
  for (const g of share.guests.values()) g.wantsControl = false;
  const name = guestId ? share.guests.get(guestId).name : null;
  audit.record({
    client: 'you', tool: guestId ? 'share_control_granted' : 'share_control_revoked', risk: 'share', decision: 'allowed',
    summary: guestId ? `Gave keyboard control of "${share.sessionName || share.sessionId}" to ${name}` : `Took back keyboard control of "${share.sessionName || share.sessionId}"`,
    sessionId: share.sessionId,
  });
  presence(share);
  return true;
}

/** Owner declines (or ignores) a guest's control request. */
export function denyControl(id, guestId) {
  const share = shares.get(id);
  const guest = share?.guests.get(guestId);
  if (!guest) return false;
  guest.wantsControl = false;
  sendGuest(guest, 'CONTROL_DENIED', {});
  presence(share);
  return true;
}

function cleanName(raw) {
  const name = String(raw || '').replace(/[\x00-\x1f\x7f<>]/g, '').trim().slice(0, 32);
  return name || 'Guest';
}

/** True when the token belongs to an active share (used to serve the viewer page). */
export function isValidShareToken(token) {
  return !!findByToken(token);
}

function attachGuest(share, guest, ws) {
  guest.ws = ws;
  clearTimeout(guest.graceTimer);

  sendGuest(guest, 'WELCOME', {
    you: guest.id,
    rejoinKey: guest.rejoinKey,
    sessionName: share.sessionName,
    cols: share.mirror.cols,
    rows: share.mirror.rows,
    expiresAt: share.expiresAt,
    theme: share.theme,
  });
  // The mirror only contains the screen at share time plus output produced while sharing
  const screen = share.serializer.serialize({ scrollback: SHARE_SCROLLBACK });
  if (screen) sendData(guest, screen);
  presence(share);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!shares.has(share.id) || guest.ws !== ws) return;
    if (msg.type === 'INPUT' && typeof msg.data === 'string') {
      // Only the guest holding control may type; everyone else is read-only
      if (share.controllerId === guest.id) writeRawInput(share.sessionId, msg.data.slice(0, 4096));
    } else if (msg.type === 'REQUEST_CONTROL') {
      const now = Date.now();
      if (share.controllerId === guest.id || guest.wantsControl) return;
      // One request per guest per cooldown, and at most one new toast every few seconds per share
      if (now - (guest.lastRequestAt || 0) < CONTROL_REQUEST_COOLDOWN_MS || now - share.lastControlRequestAt < 3000) {
        sendGuest(guest, 'CONTROL_DENIED', { reason: 'Please wait a moment before asking again.' });
        return;
      }
      guest.lastRequestAt = now;
      share.lastControlRequestAt = now;
      guest.wantsControl = true;
      broadcast('SHARE_CONTROL_REQUEST', { shareId: share.id, guestId: guest.id, name: guest.name, sessionId: share.sessionId });
      presence(share);
    } else if (msg.type === 'RELEASE_CONTROL') {
      if (share.controllerId === guest.id) setController(share.id, null);
    }
  });

  ws.on('close', () => {
    if (guest.ws !== ws) return; // replaced by a newer connection of the same guest
    guest.ws = null;
    presence(share);
    // Keep the guest (and their control) briefly so a network blip does not cost them their seat
    guest.graceTimer = setTimeout(() => {
      share.guests.delete(guest.id);
      if (share.controllerId === guest.id && shares.has(share.id)) setController(share.id, null);
    }, REJOIN_GRACE_MS);
    guest.graceTimer.unref?.();
  });
}

/**
 * Attaches a guest WebSocket (already upgraded; token not yet verified).
 * `rejoin` (secret key from WELCOME) lets a briefly disconnected guest keep their identity and control.
 */
export function handleGuestConnection(ws, url) {
  const share = findByToken(url.searchParams.get('share'));
  if (!share) {
    ws.send(META('SHARE_ENDED', { reason: 'This share link is invalid or has expired.' }));
    return ws.close(4404, 'invalid share');
  }

  const rejoinKey = url.searchParams.get('rejoin');
  if (rejoinKey) {
    const existing = [...share.guests.values()].find(g => !g.ws && safeEqual(g.rejoinKey, rejoinKey));
    if (existing) return attachGuest(share, existing, ws);
  }

  if (connectedGuests(share).length >= MAX_GUESTS) {
    ws.send(META('SHARE_ENDED', { reason: 'Too many viewers on this share.' }));
    return ws.close(4429, 'too many guests');
  }

  const guest = {
    id: crypto.randomUUID(),
    rejoinKey: crypto.randomBytes(16).toString('hex'),
    name: cleanName(url.searchParams.get('name')),
    color: COLORS[share.colorIndex++ % COLORS.length],
    joinedAt: new Date().toISOString(),
    wantsControl: false,
    ws: null,
  };
  share.guests.set(guest.id, guest);
  attachGuest(share, guest, ws);
}

// ── Live fan-out ─────────────────────────────────────────────────────

bus.on('output', (sessionId, data) => {
  for (const share of shares.values()) {
    if (share.sessionId !== sessionId) continue;
    share.mirror.write(data);
    for (const g of share.guests.values()) sendData(g, data);
  }
});

bus.on('resize', (sessionId, size) => {
  for (const share of shares.values()) {
    if (share.sessionId !== sessionId) continue;
    share.mirror.resize(size.cols, size.rows);
    for (const g of share.guests.values()) sendGuest(g, 'RESIZE', size);
  }
});

const endForSession = (sessionId, reason) => {
  for (const share of [...shares.values()]) if (share.sessionId === sessionId) endShare(share.id, reason);
};
bus.on('session-closed', (id) => endForSession(id, 'The shared terminal was closed.'));
bus.on('session-exited', (id) => endForSession(id, 'The shell in the shared terminal exited.'));

/** Test helper */
export function _endAll() {
  for (const id of [...shares.keys()]) endShare(id, 'reset');
}

import { EventEmitter } from 'events';

/**
 * Process-wide event bus.
 *
 * - `bus` is used by backend services (ptyManager, approvals, MCP) to talk to each other.
 * - `broadcast()` pushes a NEXUS_META event to every browser "control" WebSocket
 *   (one per open NexusTerm UI), independent of which terminal panes are visible.
 */
export const bus = new EventEmitter();
bus.setMaxListeners(100);

const controlClients = new Set();

export function addControlClient(ws) {
  controlClients.add(ws);
  bus.emit('ui-connected', controlClients.size);
  ws.on('close', () => {
    controlClients.delete(ws);
    bus.emit('ui-disconnected', controlClients.size);
  });
}

export function hasControlClients() {
  for (const ws of controlClients) {
    if (ws.readyState === 1) return true;
  }
  return false;
}

export function broadcast(type, payload) {
  const message = 'NEXUS_META:' + JSON.stringify({ type, payload });
  for (const ws of controlClients) {
    if (ws.readyState === 1) ws.send(message);
  }
}

/** Test helper */
export function _resetControlClients() {
  controlClients.clear();
}

// Mounted terminals by session id, so other features (live share) can read the visible screen.
const registry = new Map();

export function registerTerminal(sessionId, serializeAddon) {
  registry.set(sessionId, serializeAddon);
  return () => {
    if (registry.get(sessionId) === serializeAddon) registry.delete(sessionId);
  };
}

/** The visible screen of a mounted terminal (no scrollback), or '' when the tab is not mounted. */
export function serializeVisibleScreen(sessionId) {
  try {
    return registry.get(sessionId)?.serialize({ scrollback: 0 }) || '';
  } catch {
    return '';
  }
}

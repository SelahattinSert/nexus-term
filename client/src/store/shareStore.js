import { nexusFetchJSON } from '../utils/nexusFetch';
import { serializeVisibleScreen } from '../utils/termRegistry';

/**
 * Live share state on the owner's side. `shares` is keyed by terminal session id.
 */
export const createShareSlice = (set, get) => ({
  shares: {},
  shareDialogSessionId: null,
  shareNetwork: null,

  openShareDialog: (sessionId) => set({ shareDialogSessionId: sessionId }),
  closeShareDialog: () => set({ shareDialogSessionId: null }),

  fetchShares: async () => {
    const data = await nexusFetchJSON('/api/shares');
    const map = {};
    for (const s of data.shares || []) map[s.sessionId] = s;
    set({ shares: map });
  },

  fetchShareNetwork: async () => {
    set({ shareNetwork: await nexusFetchJSON('/api/shares/network') });
  },

  createShare: async (sessionId, ttlMinutes) => {
    const share = await nexusFetchJSON('/api/shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Only the visible screen is shared, never earlier (possibly cleared) output
      body: JSON.stringify({ sessionId, ttlMinutes, theme: get().theme, screen: serializeVisibleScreen(sessionId) }),
    });
    if (share.error) throw new Error(share.error);
    set((state) => ({ shares: { ...state.shares, [sessionId]: share } }));
    return share;
  },

  endShare: async (shareId) => {
    await nexusFetchJSON(`/api/shares/${encodeURIComponent(shareId)}`, { method: 'DELETE' });
    set((state) => ({ shares: Object.fromEntries(Object.entries(state.shares).filter(([, s]) => s.id !== shareId)) }));
  },

  setShareController: async (shareId, guestId) => {
    await nexusFetchJSON(`/api/shares/${encodeURIComponent(shareId)}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guestId }),
    });
  },

  denyShareControl: async (shareId, guestId) => {
    await nexusFetchJSON(`/api/shares/${encodeURIComponent(shareId)}/deny`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guestId }),
    });
  },

  stopPublicShare: async () => {
    await nexusFetchJSON('/api/shares/public', { method: 'DELETE' });
    set((state) => ({ shareNetwork: { ...(state.shareNetwork || {}), publicUrl: null } }));
  },

  openPublicShare: async () => {
    const res = await nexusFetchJSON('/api/shares/public', { method: 'POST' });
    if (res.error) throw new Error(res.error);
    set((state) => ({ shareNetwork: { ...(state.shareNetwork || {}), publicUrl: res.publicUrl } }));
    return res.publicUrl;
  },

  /** Live update from the control channel (has no token: keep the one we already know). */
  receiveShareUpdate: (share) => set((state) => {
    const prev = state.shares[share.sessionId];
    return { shares: { ...state.shares, [share.sessionId]: { ...share, token: share.token || prev?.token } } };
  }),

  receiveShareEnded: ({ sessionId }) => set((state) => {
    const next = { ...state.shares };
    delete next[sessionId];
    return { shares: next };
  }),
});

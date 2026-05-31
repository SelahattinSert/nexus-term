export const createPortSlice = (set, get) => ({
  ports: [],
  isScanning: false,
  lastScanned: null,
  autoRefreshPorts: true,
  portRefreshInterval: 3000,
  tunnelLoading: {}, // { [port]: boolean }

  fetchPorts: async () => {
    try {
      set({ isScanning: true });
      const token = new URLSearchParams(window.location.search).get('token');
      const res = await fetch(`/api/ports?token=${token}`);
      if (res.ok) {
        const data = await res.json();
        set({ ports: data.ports, lastScanned: new Date().toISOString(), isScanning: false });
      } else {
        set({ isScanning: false });
      }
    } catch (e) {
      console.error('Failed to fetch ports', e);
      set({ isScanning: false });
    }
  },

  killPortProcess: async (pid) => {
    try {
      const token = new URLSearchParams(window.location.search).get('token');
      const res = await fetch(`/api/ports/${pid}?token=${token}`, { method: 'DELETE' });
      if (res.ok) {
        await get().fetchPorts();
        return { success: true };
      }
      return { success: false, error: await res.text() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  startTunnel: async (port, provider) => {
    try {
      set(state => ({ tunnelLoading: { ...state.tunnelLoading, [port]: true } }));
      const token = new URLSearchParams(window.location.search).get('token');
      const res = await fetch(`/api/ports/${port}/tunnel?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
      });
      if (res.ok) {
        await get().fetchPorts();
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Tunnel failed');
      }
    } finally {
      set(state => ({ tunnelLoading: { ...state.tunnelLoading, [port]: false } }));
    }
  },

  stopTunnel: async (port) => {
    try {
      const token = new URLSearchParams(window.location.search).get('token');
      await fetch(`/api/ports/${port}/tunnel?token=${token}`, { method: 'DELETE' });
      await get().fetchPorts();
    } catch (e) {
      console.error('Failed to stop tunnel', e);
    }
  },

  setAutoRefreshPorts: (auto) => set({ autoRefreshPorts: auto })
});
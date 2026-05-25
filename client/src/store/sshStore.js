export const createSshSlice = (set, get) => ({
  sshProfiles: [],
  sshConnections: {}, // { [profileId]: 'connecting' | 'connected' | 'error' }

  fetchSshProfiles: async () => {
    try {
      const token = new URLSearchParams(window.location.search).get('token');
      const res = await fetch(`/api/ssh/profiles?token=${token}`);
      if (res.ok) {
        const data = await res.json();
        set({ sshProfiles: data });
      }
    } catch (e) {
      console.error('Failed to fetch SSH profiles', e);
    }
  },

  createSshProfile: async (profile) => {
    try {
      const token = new URLSearchParams(window.location.search).get('token');
      const res = await fetch(`/api/ssh/profiles?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      if (res.ok) {
        const saved = await res.json();
        set(state => ({ sshProfiles: [...state.sshProfiles, saved] }));
        return { success: true };
      }
      return { success: false, error: await res.text() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  updateSshProfile: async (id, profile) => {
    try {
      const token = new URLSearchParams(window.location.search).get('token');
      const res = await fetch(`/api/ssh/profiles/${id}?token=${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      if (res.ok) {
        const saved = await res.json();
        set(state => ({
          sshProfiles: state.sshProfiles.map(p => p.id === id ? saved : p)
        }));
        return { success: true };
      }
      return { success: false, error: await res.text() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  deleteSshProfile: async (id) => {
    try {
      const token = new URLSearchParams(window.location.search).get('token');
      const res = await fetch(`/api/ssh/profiles/${id}?token=${token}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        set(state => ({
          sshProfiles: state.sshProfiles.filter(p => p.id !== id)
        }));
      }
    } catch (e) {
      console.error('Failed to delete SSH profile', e);
    }
  },

  testSshConnection: async (id) => {
    try {
      const token = new URLSearchParams(window.location.search).get('token');
      const res = await fetch(`/api/ssh/test?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      return data;
    } catch (e) {
      return { reachable: false, error: e.message };
    }
  },

  setSshConnectionStatus: (id, status) => {
    set(state => ({
      sshConnections: { ...state.sshConnections, [id]: status }
    }));
  },

  connectToSshProfile: async (id) => {
    const profile = get().sshProfiles.find(p => p.id === id);
    if (!profile) return;

    set(state => ({
      sshConnections: { ...state.sshConnections, [id]: 'connecting' }
    }));

    try {
      // Use the generic /api/terminals endpoint but pass the sshProfile
      const token = new URLSearchParams(window.location.search).get('token');
      const sessionId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
      
      const res = await fetch(`/api/terminals?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, shell: 'ssh', sshProfile: profile })
      });

      if (res.ok) {
        set(state => ({
          sshConnections: { ...state.sshConnections, [id]: 'connected' }
        }));
        
        // Open a new terminal tab with the SSH session
        get().createSession({ 
          id: sessionId, 
          name: profile.name, 
          icon: 'server',
          isSsh: true,
          sshProfileId: profile.id
        });
      } else {
        const errData = await res.json();
        set(state => ({
          sshConnections: { ...state.sshConnections, [id]: 'error' }
        }));
        throw new Error(errData.error || 'Connection failed');
      }
    } catch (e) {
      set(state => ({
        sshConnections: { ...state.sshConnections, [id]: 'error' }
      }));
      throw e;
    }
  }
});
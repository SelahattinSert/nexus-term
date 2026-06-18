export const createEnvSlice = (set, get) => {
  // We keep timeouts in a module-level variable so they don't get serialized by Zustand
  const revealTimeouts = new Map();

  const clearRevealTimeout = (fileId, key) => {
    const mapKey = `${fileId}:${key}`;
    if (revealTimeouts.has(mapKey)) {
      clearTimeout(revealTimeouts.get(mapKey));
      revealTimeouts.delete(mapKey);
    }
  };

  const setRevealTimeout = (fileId, key) => {
    const mapKey = `${fileId}:${key}`;
    clearRevealTimeout(fileId, key);
    
    const timeout = setTimeout(() => {
      get().hideValue(fileId, key);
    }, 5 * 60 * 1000); // 5 minutes
    
    revealTimeouts.set(mapKey, timeout);
  };

  return {
    envFiles: [],
    activeEnvFileId: null,
    revealedKeys: {},       // { [fileId:key]: string }
    envDiffPair: null,      // { aId, bId }
    envValidationResults: {}, // { [fileId]: ValidationResult[] }
    isEnvLoading: false,

    fetchEnvFiles: async (cwd) => {
      try {
        set({ isEnvLoading: true });
        const token = new URLSearchParams(window.location.search).get('token');
        const url = new URL('/api/env/files', window.location.origin);
        url.searchParams.set('token', token);
        if (cwd) url.searchParams.set('cwd', cwd);

        const res = await fetch(url.toString());
        if (res.ok) {
          const data = await res.json();
          set({ envFiles: data.files });
        }
      } catch (err) {
        console.error('Failed to fetch env files:', err);
      } finally {
        set({ isEnvLoading: false });
      }
    },

    selectEnvFile: (id) => set({ activeEnvFileId: id, envDiffPair: null }),
    
    setEnvDiffPair: (aId, bId) => set({ envDiffPair: aId && bId ? { aId, bId } : null, activeEnvFileId: null }),

    revealValue: async (fileId, key, cwd) => {
      try {
        const token = new URLSearchParams(window.location.search).get('token');
        const url = new URL(`/api/env/files/${encodeURIComponent(fileId)}/reveal/${encodeURIComponent(key)}`, window.location.origin);
        url.searchParams.set('token', token);
        if (cwd) url.searchParams.set('cwd', cwd);

        const res = await fetch(url.toString());
        if (res.ok) {
          const data = await res.json();
          set((state) => ({
            revealedKeys: { ...state.revealedKeys, [`${fileId}:${key}`]: data.value }
          }));
          setRevealTimeout(fileId, key);
          return true;
        } else {
          const err = await res.json();
          throw new Error(err.error || 'Failed to reveal');
        }
      } catch (e) {
        console.error(e);
        throw e;
      }
    },

    hideValue: (fileId, key) => {
      clearRevealTimeout(fileId, key);
      set((state) => {
        const newKeys = { ...state.revealedKeys };
        delete newKeys[`${fileId}:${key}`];
        return { revealedKeys: newKeys };
      });
    },

    clearAllRevealed: () => {
      for (const timeout of revealTimeouts.values()) {
        clearTimeout(timeout);
      }
      revealTimeouts.clear();
      set({ revealedKeys: {} });
    },

    saveEnvFile: async (fileId, variables, cwd) => {
      try {
        const token = new URLSearchParams(window.location.search).get('token');
        const url = new URL(`/api/env/files/${encodeURIComponent(fileId)}`, window.location.origin);
        url.searchParams.set('token', token);
        if (cwd) url.searchParams.set('cwd', cwd);

        const res = await fetch(url.toString(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variables })
        });

        if (res.ok) {
          const updatedFile = await res.json();
          set((state) => ({
            envFiles: state.envFiles.map(f => f.id === fileId ? updatedFile : f)
          }));
          return { success: true };
        } else {
          const err = await res.json();
          return { success: false, error: err.error };
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    validateEnvFile: async (fileId, cwd) => {
      try {
        const token = new URLSearchParams(window.location.search).get('token');
        const url = new URL(`/api/env/files/${encodeURIComponent(fileId)}/validate`, window.location.origin);
        url.searchParams.set('token', token);
        if (cwd) url.searchParams.set('cwd', cwd);

        const res = await fetch(url.toString(), { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          set((state) => ({
            envValidationResults: { ...state.envValidationResults, [fileId]: data.results }
          }));
        }
      } catch (e) {
        console.error('Validation failed', e);
      }
    },

    addToGitIgnore: async (fileId, cwd) => {
      try {
        const token = new URLSearchParams(window.location.search).get('token');
        const url = new URL(`/api/env/gitignore-add`, window.location.origin);
        url.searchParams.set('token', token);
        if (cwd) url.searchParams.set('cwd', cwd);

        const res = await fetch(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: fileId })
        });
        if (res.ok) {
          await get().fetchEnvFiles(cwd);
          return { success: true };
        }
        return { success: false };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
  };
};
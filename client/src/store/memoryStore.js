export const createMemorySlice = (set, get) => ({
  memoryEntries: [],
  memoryStats: null,
  isMemoryLoading: false,
  memoryPagination: { page: 1, limit: 20, total: 0, totalPages: 0 },

  fetchMemory: async (page = 1, limit = 20, search = '') => {
    try {
      set({ isMemoryLoading: true });
      const token = new URLSearchParams(window.location.search).get('token');
      const url = new URL('/api/memory', window.location.origin);
      url.searchParams.set('token', token);
      url.searchParams.set('page', page);
      url.searchParams.set('limit', limit);
      if (search) url.searchParams.set('search', search);

      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        set({ 
          memoryEntries: data.entries, 
          memoryPagination: data.pagination,
          isMemoryLoading: false 
        });
      } else {
        set({ isMemoryLoading: false });
      }
    } catch (e) {
      console.error('Failed to fetch memory entries', e);
      set({ isMemoryLoading: false });
    }
  },

  fetchMemoryStats: async () => {
    try {
      const token = new URLSearchParams(window.location.search).get('token');
      const res = await fetch(`/api/memory/stats?token=${token}`);
      if (res.ok) {
        const data = await res.json();
        set({ memoryStats: data });
      }
    } catch (e) {
      console.error('Failed to fetch memory stats', e);
    }
  },

  deleteMemoryEntry: async (id) => {
    try {
      const token = new URLSearchParams(window.location.search).get('token');
      const res = await fetch(`/api/memory/${id}?token=${token}`, { method: 'DELETE' });
      if (res.ok) {
        // Refresh local state
        const page = get().memoryPagination.page;
        const limit = get().memoryPagination.limit;
        await get().fetchMemory(page, limit);
        await get().fetchMemoryStats();
        return { success: true };
      }
      return { success: false, error: await res.text() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  clearAllMemory: async () => {
    try {
      const token = new URLSearchParams(window.location.search).get('token');
      const res = await fetch(`/api/memory?token=${token}`, { method: 'DELETE' });
      if (res.ok) {
        set({ memoryEntries: [], memoryStats: null });
        await get().fetchMemory(1, 20);
        return { success: true };
      }
      return { success: false, error: await res.text() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
});

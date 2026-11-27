import { nexusFetch, nexusFetchJSON } from '../utils/nexusFetch';

/**
 * Notebook: recorded command blocks (command, exit code, output, duration, notes).
 */
export const createNotebookSlice = (set, get) => ({
  blocks: [],                 // newest first, for the current filter
  notebookFilter: { q: '', status: '', scope: 'all' }, // scope: 'all' | 'focused'
  notebookPersist: true,
  isNotebookLoading: false,
  selectedBlockIds: [],

  setNotebookFilter: (patch) => set((state) => ({ notebookFilter: { ...state.notebookFilter, ...patch } })),

  fetchBlocks: async () => {
    const { notebookFilter, focusedPane } = get();
    const params = new URLSearchParams({ limit: '200' });
    if (notebookFilter.q) params.set('q', notebookFilter.q);
    if (notebookFilter.status) params.set('status', notebookFilter.status);
    if (notebookFilter.scope === 'focused' && focusedPane) params.set('sessionId', focusedPane);
    set({ isNotebookLoading: true });
    try {
      const data = await nexusFetchJSON(`/api/blocks?${params}`);
      set({ blocks: data.blocks || [], notebookPersist: data.persist !== false });
    } finally {
      set({ isNotebookLoading: false });
    }
  },

  /** Live update from the control channel; only inserted when it matches the current filter. */
  receiveBlock: (block) => set((state) => {
    if (state.blocks.some(b => b.id === block.id)) return state;
    const f = state.notebookFilter;
    if (f.scope === 'focused' && block.sessionId !== state.focusedPane) return state;
    if (f.status === 'failed' && !(block.exitCode !== 0 && block.exitCode !== null)) return state;
    if (f.status === 'succeeded' && block.exitCode !== 0) return state;
    if (f.q) {
      const hay = `${block.command}\n${block.cwd}\n${block.output}`.toLowerCase();
      if (!f.q.toLowerCase().split(/\s+/).filter(Boolean).every(t => hay.includes(t))) return state;
    }
    return { blocks: [block, ...state.blocks].slice(0, 500) };
  }),

  annotateBlock: async (id, note) => {
    const updated = await nexusFetchJSON(`/api/blocks/${encodeURIComponent(id)}/note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    });
    set((state) => ({ blocks: state.blocks.map(b => (b.id === id ? { ...b, note: updated.note } : b)) }));
  },

  toggleBlockSelected: (id) => set((state) => ({
    selectedBlockIds: state.selectedBlockIds.includes(id)
      ? state.selectedBlockIds.filter(x => x !== id)
      : [...state.selectedBlockIds, id],
  })),

  clearBlockSelection: () => set({ selectedBlockIds: [] }),

  /** Returns Markdown for the selected blocks in chronological order. */
  exportRunbook: async (title, includeOutput = true) => {
    const { selectedBlockIds, blocks } = get();
    const chronological = blocks.filter(b => selectedBlockIds.includes(b.id))
      .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt))
      .map(b => b.id);
    const res = await nexusFetch('/api/blocks/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: chronological, title, includeOutput }),
    });
    return res.text();
  },

  setNotebookPersist: async (persist) => {
    await nexusFetchJSON('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persistBlocks: persist }),
    });
    set({ notebookPersist: persist });
  },

  clearNotebook: async () => {
    await nexusFetchJSON('/api/blocks', { method: 'DELETE' });
    set({ blocks: [], selectedBlockIds: [] });
  },
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../store';

describe('memoryStore slice', () => {
  beforeEach(() => {
    const initialState = useStore.getInitialState();
    useStore.setState(initialState, true);
    vi.restoreAllMocks();
  });

  it('should fetch memory entries', async () => {
    const mockEntries = [
      { id: 'm1', errorPattern: 'EADDRINUSE 3000', solutionSummary: 'Kill port 3000' }
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entries: mockEntries, pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    });

    const { fetchMemory } = useStore.getState();
    await fetchMemory();

    expect(useStore.getState().memoryEntries).toEqual(mockEntries);
    expect(useStore.getState().isMemoryLoading).toBe(false);
  });

  it('should delete memory entry by id and refresh memory stats', async () => {
    useStore.setState({ 
      memoryEntries: [{ id: 'm1' }, { id: 'm2' }],
      memoryPagination: { page: 1, limit: 20, total: 2, totalPages: 1 }
    });

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true }) // delete request
      .mockResolvedValueOnce({ ok: true, json: async () => ({ entries: [{ id: 'm2' }], pagination: {} }) }) // fetchMemory
      .mockResolvedValueOnce({ ok: true, json: async () => ({ totalEntries: 1 }) }); // fetchMemoryStats

    const { deleteMemoryEntry } = useStore.getState();
    const result = await deleteMemoryEntry('m1');

    expect(result.success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/memory/m1'), expect.objectContaining({ method: 'DELETE' }));
  });

  it('should clear all memory entries', async () => {
    useStore.setState({ 
      memoryEntries: [{ id: 'm1' }],
      memoryPagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
    });

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true }) // clearAllMemory request
      .mockResolvedValueOnce({ ok: true, json: async () => ({ entries: [], pagination: {} }) }); // fetchMemory

    const { clearAllMemory } = useStore.getState();
    const result = await clearAllMemory();

    expect(result.success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/memory'), expect.objectContaining({ method: 'DELETE' }));
  });
});

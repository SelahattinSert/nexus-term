import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../store';

describe('portStore slice', () => {
  beforeEach(() => {
    const initialState = useStore.getInitialState();
    useStore.setState(initialState, true);
    vi.restoreAllMocks();
  });

  it('should fetch ports and update store state', async () => {
    const mockPorts = [
      { port: 3000, protocol: 'tcp', state: 'LISTEN', processName: 'node', pid: 1234 }
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ports: mockPorts })
    });

    const { fetchPorts } = useStore.getState();
    await fetchPorts();

    const state = useStore.getState();
    expect(state.ports).toEqual(mockPorts);
    expect(state.isScanning).toBe(false);
    expect(state.lastScanned).not.toBeNull();
  });

  it('should trigger killPortProcess and refresh ports on success', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) }) // delete pid
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ports: [] }) }); // fetchPorts reload

    const { killPortProcess } = useStore.getState();
    const result = await killPortProcess(1234);

    expect(result.success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/ports/1234'), expect.anything());
  });

  it('should start and stop tunnel for a port', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: 'https://foo.ngrok.app', provider: 'ngrok' }) }) // startTunnel
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ports: [] }) }) // fetchPorts reload
      .mockResolvedValueOnce({ ok: true, json: async () => ({ stopped: true }) }) // stopTunnel
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ports: [] }) }); // fetchPorts reload

    const { startTunnel, stopTunnel } = useStore.getState();

    await startTunnel(3000, 'ngrok');
    expect(useStore.getState().tunnelLoading[3000]).toBe(false);

    await stopTunnel(3000);
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/ports/3000/tunnel'), expect.objectContaining({ method: 'DELETE' }));
  });

  it('should toggle autoRefreshPorts', () => {
    const { setAutoRefreshPorts } = useStore.getState();
    expect(useStore.getState().autoRefreshPorts).toBe(true);

    setAutoRefreshPorts(false);
    expect(useStore.getState().autoRefreshPorts).toBe(false);
  });
});

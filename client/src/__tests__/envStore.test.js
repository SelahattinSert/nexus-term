import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../store';

describe('envStore slice', () => {
  beforeEach(() => {
    const initialState = useStore.getInitialState();
    useStore.setState(initialState, true);
    vi.restoreAllMocks();
  });

  it('should fetch env files', async () => {
    const mockFiles = [
      { id: 'env1', filePath: '/app/.env', profileName: 'default', isActive: true, variables: [] }
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ files: mockFiles })
    });

    const { fetchEnvFiles } = useStore.getState();
    await fetchEnvFiles('/app');

    expect(useStore.getState().envFiles).toEqual(mockFiles);
    expect(useStore.getState().isEnvLoading).toBe(false);
  });

  it('should reveal a variable value and update revealedKeys store map', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ value: 'revealed_secret_123' })
    });

    const { revealValue } = useStore.getState();
    const result = await revealValue('env1', 'API_KEY');

    expect(result).toBe(true);
    expect(useStore.getState().revealedKeys['env1:API_KEY']).toBe('revealed_secret_123');
  });

  it('should hide a revealed variable value', () => {
    useStore.setState({ revealedKeys: { 'env1:API_KEY': 'secret' } });
    const { hideValue } = useStore.getState();

    hideValue('env1', 'API_KEY');
    expect(useStore.getState().revealedKeys['env1:API_KEY']).toBeUndefined();
  });
});

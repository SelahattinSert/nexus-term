import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../store';

describe('sshStore slice', () => {
  beforeEach(() => {
    const initialState = useStore.getInitialState();
    useStore.setState(initialState, true);
    vi.restoreAllMocks();
  });

  it('should fetch SSH profiles', async () => {
    const mockProfiles = [
      { id: '1', name: 'Server A', host: '10.0.0.1', username: 'ubuntu' }
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockProfiles
    });

    const { fetchSshProfiles } = useStore.getState();
    await fetchSshProfiles();

    expect(useStore.getState().sshProfiles).toEqual(mockProfiles);
  });

  it('should create SSH profile', async () => {
    const newProfile = { name: 'Server B', host: '10.0.0.2', username: 'root' };
    const savedProfile = { id: '2', ...newProfile };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => savedProfile
    });

    const { createSshProfile } = useStore.getState();
    const result = await createSshProfile(newProfile);

    expect(result.success).toBe(true);
    expect(useStore.getState().sshProfiles).toContainEqual(savedProfile);
  });

  it('should delete SSH profile and update store list', async () => {
    useStore.setState({ sshProfiles: [{ id: '1', name: 'Server A' }] });

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const { deleteSshProfile } = useStore.getState();
    await deleteSshProfile('1');

    expect(useStore.getState().sshProfiles.length).toBe(0);
  });
});

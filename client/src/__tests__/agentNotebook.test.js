import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../store';

describe('agent and notebook slices', () => {
  beforeEach(() => {
    useStore.setState(useStore.getInitialState(), true);
    vi.restoreAllMocks();
  });

  it('connects SSH with the profile id only, never the masked profile', async () => {
    useStore.setState({ sshProfiles: [{ id: 'p1', name: 'Prod', host: 'h', username: 'u', password: '••••••••' }] });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    await useStore.getState().connectToSshProfile('p1');

    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.sshProfileId).toBe('p1');
    expect(body.sshProfile).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('••••');
  });

  it('queues server approvals without duplicates and answers them', async () => {
    const { addServerApproval } = useStore.getState();
    addServerApproval({ id: 'a1', title: 'Run', command: 'ls' });
    addServerApproval({ id: 'a1', title: 'Run', command: 'ls' });
    addServerApproval({ id: 'a2', title: 'Run', command: 'pwd' });
    expect(useStore.getState().serverApprovals.map(a => a.id)).toEqual(['a1', 'a2']);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
    await useStore.getState().answerServerApproval('a1', false, 'use pnpm');

    expect(useStore.getState().serverApprovals.map(a => a.id)).toEqual(['a2']);
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/api/agents/approvals/a1');
    expect(JSON.parse(options.body)).toEqual({ approved: false, reason: 'use pnpm' });
  });

  it('inserts live blocks only when they match the notebook filter', () => {
    const { receiveBlock, setNotebookFilter } = useStore.getState();
    setNotebookFilter({ status: 'failed' });
    receiveBlock({ id: 'b1', sessionId: 's', command: 'ls', exitCode: 0, output: '', cwd: '/' });
    receiveBlock({ id: 'b2', sessionId: 's', command: 'npm test', exitCode: 1, output: 'FAIL', cwd: '/' });
    receiveBlock({ id: 'b2', sessionId: 's', command: 'npm test', exitCode: 1, output: 'FAIL', cwd: '/' });
    expect(useStore.getState().blocks.map(b => b.id)).toEqual(['b2']);
  });

  it('adds agent-created sessions without stealing focus', () => {
    const { createSession } = useStore.getState();
    createSession({ id: 'mine' });
    createSession({ id: 'agent-1', name: 'claude-code', focus: false, createdBy: 'mcp:claude-code' });
    const state = useStore.getState();
    expect(state.focusedPane).toBe('mine');
    expect(state.sessions.find(s => s.id === 'agent-1').name).toBe('claude-code');
  });
});

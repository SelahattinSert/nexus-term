import { nexusFetchJSON } from '../utils/nexusFetch';

/**
 * Agent gateway state: approval requests coming from the server (MCP agents), the audit log,
 * connection details, and which terminal sessions report shell integration.
 */
export const createAgentSlice = (set, get) => ({
  serverApprovals: [],      // pending approval requests from the server, oldest first
  auditEntries: [],         // newest first
  agentInfo: null,          // { mcpUrl, token, policy, setup }
  integratedSessions: {},   // sessionId -> true when the shell reports command blocks

  setServerApprovals: (list) => set({ serverApprovals: list || [] }),

  addServerApproval: (request) => set((state) => (
    state.serverApprovals.some(a => a.id === request.id)
      ? state
      : { serverApprovals: [...state.serverApprovals, request] }
  )),

  removeServerApproval: (id) => set((state) => ({
    serverApprovals: state.serverApprovals.filter(a => a.id !== id),
  })),

  answerServerApproval: async (id, approved, reason) => {
    get().removeServerApproval(id);
    try {
      await nexusFetchJSON(`/api/agents/approvals/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, reason }),
      });
    } catch (err) {
      console.error('Failed to answer approval request', err);
    }
  },

  addAuditEntry: (entry) => set((state) => ({
    auditEntries: [entry, ...state.auditEntries.filter(e => e.id !== entry.id)].slice(0, 200),
  })),

  fetchAgentInfo: async () => {
    const [info, audit] = await Promise.all([
      nexusFetchJSON('/api/agents'),
      nexusFetchJSON('/api/agents/audit?limit=100'),
    ]);
    set({ agentInfo: info, auditEntries: audit.entries || [] });
  },

  setAgentPolicy: async (policy) => {
    const res = await nexusFetchJSON('/api/agents/policy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policy }),
    });
    set((state) => ({ agentInfo: state.agentInfo ? { ...state.agentInfo, policy: res.policy } : state.agentInfo }));
  },

  rotateAgentToken: async () => {
    await nexusFetchJSON('/api/agents/token/rotate', { method: 'POST' });
    await get().fetchAgentInfo();
  },

  markSessionIntegrated: (sessionId) => set((state) => (
    state.integratedSessions[sessionId] ? state : { integratedSessions: { ...state.integratedSessions, [sessionId]: true } }
  )),
});

import express from 'express';
import { listPending, resolveApproval } from '../services/approvalService.js';
import * as audit from '../services/auditLog.js';
import { getMcpToken, rotateMcpToken } from '../mcp/token.js';
import { readRawConfig, writeConfig } from '../utils/configManager.js';

const quote = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

/**
 * UI-facing endpoints for the agent gateway: connection details, policy, approvals, audit log.
 * Protected by the UI token (mounted behind requireToken).
 */
export function createAgentsRouter({ getMcpUrl, stdio }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const config = await readRawConfig();
    const url = getMcpUrl();
    const token = getMcpToken();
    res.json({
      mcpUrl: url,
      token,
      policy: config.agentPolicy === 'read-only' ? 'read-only' : 'ask',
      setup: {
        claudeCode: `claude mcp add --transport http nexusterm ${url} --header "Authorization: Bearer ${token}"`,
        claudeCodeStdio: `claude mcp add nexusterm -- ${[stdio.command, ...stdio.args].map(quote).join(' ')}`,
        codex: `[mcp_servers.nexusterm]\ncommand = ${JSON.stringify(stdio.command)}\nargs = ${JSON.stringify(stdio.args)}`,
        json: JSON.stringify({ mcpServers: { nexusterm: { command: stdio.command, args: stdio.args } } }, null, 2),
      },
    });
  });

  router.post('/token/rotate', (req, res) => {
    res.json({ token: rotateMcpToken() });
  });

  router.post('/policy', async (req, res) => {
    const policy = req.body?.policy === 'read-only' ? 'read-only' : 'ask';
    await writeConfig({ agentPolicy: policy });
    res.json({ policy });
  });

  router.get('/approvals', (req, res) => {
    res.json({ approvals: listPending() });
  });

  router.post('/approvals/:id', (req, res) => {
    const ok = resolveApproval(req.params.id, { approved: req.body?.approved === true, reason: req.body?.reason });
    if (!ok) return res.status(404).json({ error: 'Approval request not found or already answered' });
    res.json({ success: true });
  });

  router.get('/audit', (req, res) => {
    res.json({ entries: audit.list(req.query.limit) });
  });

  return router;
}

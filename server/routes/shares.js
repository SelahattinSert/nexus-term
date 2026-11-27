import express from 'express';
import os from 'os';
import { createShare, listShares, endShare, setController, denyControl, setOnLastShareEnded } from '../services/shareService.js';
import { getAvailableProviders, startTunnel, stopTunnel, getActiveTunnels } from '../services/tunnelManager.js';

/**
 * Owner-side live share management (UI token required).
 */
export function createSharesRouter({ getBindHost, getPort }) {
  const router = express.Router();

  // A tunnel opened for sharing is closed again when the last share ends
  let shareTunnelPort = null;
  const closeShareTunnel = async () => {
    if (shareTunnelPort === null) return;
    const port = shareTunnelPort;
    shareTunnelPort = null;
    await stopTunnel(port);
  };
  setOnLastShareEnded(() => { closeShareTunnel().catch(() => {}); });

  router.get('/', (req, res) => res.json({ shares: listShares() }));

  router.post('/', (req, res) => {
    try {
      res.json(createShare(req.body?.sessionId, { ttlMinutes: req.body?.ttlMinutes, theme: req.body?.theme, screen: req.body?.screen }));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/public', async (req, res) => {
    await closeShareTunnel();
    res.json({ success: true });
  });

  router.post('/:id/deny', (req, res) => {
    if (!denyControl(req.params.id, req.body?.guestId)) return res.status(404).json({ error: 'Share or guest not found' });
    res.json({ success: true });
  });

  router.delete('/:id', (req, res) => {
    if (!endShare(req.params.id)) return res.status(404).json({ error: 'Share not found' });
    res.json({ success: true });
  });

  router.post('/:id/control', (req, res) => {
    const guestId = typeof req.body?.guestId === 'string' ? req.body.guestId : null;
    if (!setController(req.params.id, guestId)) return res.status(404).json({ error: 'Share or guest not found' });
    res.json({ success: true });
  });

  // How guests can reach this NexusTerm: loopback only, LAN addresses, or a public tunnel
  router.get('/network', async (req, res) => {
    const bindHost = getBindHost();
    const port = getPort();
    const loopbackOnly = ['127.0.0.1', 'localhost', '::1'].includes(bindHost);
    const lanUrls = [];
    if (!loopbackOnly) {
      for (const list of Object.values(os.networkInterfaces())) {
        for (const ni of list || []) {
          if (ni.family === 'IPv4' && !ni.internal) lanUrls.push(`http://${ni.address}:${port}`);
        }
      }
    }
    const tunnel = getActiveTunnels()[port];
    res.json({
      loopbackOnly,
      lanUrls,
      publicUrl: tunnel?.url || null,
      tunnelProviders: await getAvailableProviders(),
    });
  });

  // Opens a public tunnel to NexusTerm itself. Only share pages are usable through it:
  // /api and /mcp reject non-loopback Host headers and need their own tokens.
  router.post('/public', async (req, res) => {
    if (!listShares().length) return res.status(400).json({ error: 'Start sharing a terminal first.' });
    try {
      const t = await startTunnel(getPort(), null);
      shareTunnelPort = getPort();
      res.json({ publicUrl: t.url, provider: t.provider });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

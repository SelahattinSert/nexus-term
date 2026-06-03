import express from 'express';
import { scanPorts, killProcess } from '../services/portScanner.js';
import { startTunnel, stopTunnel, getActiveTunnels } from '../services/tunnelManager.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const includeEphemeral = req.query.includeEphemeral === 'true';
    const ports = await scanPorts(includeEphemeral);
    const tunnels = getActiveTunnels();
    
    // Merge tunnel info
    const enrichedPorts = ports.map(p => {
      if (tunnels[p.port]) {
        return { ...p, tunnelUrl: tunnels[p.port].url, tunnelProvider: tunnels[p.port].provider };
      }
      return p;
    });

    res.json({ ports: enrichedPorts });
  } catch (error) {
    console.error('[Ports Route] Error scanning ports:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:pid', async (req, res) => {
  try {
    const pid = parseInt(req.params.pid);
    const result = await killProcess(pid);
    res.json(result);
  } catch (error) {
    console.error('[Ports Route] Error killing process:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/:port/tunnel', async (req, res) => {
  try {
    const port = parseInt(req.params.port);
    const provider = req.body.provider;
    const session = await startTunnel(port, provider);
    res.json({ url: session.url, provider: session.provider });
  } catch (error) {
    console.error('[Ports Route] Error starting tunnel:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:port/tunnel', async (req, res) => {
  try {
    const port = parseInt(req.params.port);
    const stopped = await stopTunnel(port);
    res.json({ stopped });
  } catch (error) {
    console.error('[Ports Route] Error stopping tunnel:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
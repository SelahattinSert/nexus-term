import express from 'express';
import { readConfig, writeConfig } from '../utils/configManager.js';
import { setPersistEnabled } from '../services/blockStore.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    res.json(await readConfig());
  } catch {
    res.status(500).json({ error: 'Failed to read configuration' });
  }
});

router.post('/', async (req, res) => {
  try {
    const newConfig = await writeConfig(req.body);
    if ('persistBlocks' in (req.body || {})) setPersistEnabled(newConfig.persistBlocks !== false);
    res.json({ success: true, config: newConfig });
  } catch {
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

export default router;

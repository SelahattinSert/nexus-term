import express from 'express';
import { readConfig, writeConfig } from '../utils/configManager.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const config = await readConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read configuration' });
  }
});

router.post('/', async (req, res) => {
  try {
    const newConfig = await writeConfig(req.body);
    res.json({ success: true, config: newConfig });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

export default router;

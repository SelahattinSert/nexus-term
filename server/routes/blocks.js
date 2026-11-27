import express from 'express';
import * as blockStore from '../services/blockStore.js';

const router = express.Router();

// GET /api/blocks?q=&sessionId=&status=failed|succeeded&limit=&before=
router.get('/', (req, res) => {
  const { q, sessionId, status, limit, before } = req.query;
  res.json({
    blocks: blockStore.search({ q, sessionId, status, limit, before }),
    persist: blockStore.isPersistEnabled(),
  });
});

router.get('/:id', (req, res) => {
  const block = blockStore.getBlock(req.params.id);
  if (!block) return res.status(404).json({ error: 'Block not found' });
  res.json(block);
});

router.post('/:id/note', (req, res) => {
  const block = blockStore.annotate(req.params.id, req.body?.note);
  if (!block) return res.status(404).json({ error: 'Block not found' });
  res.json(block);
});

// POST /api/blocks/export { ids: [], title, includeOutput } -> text/markdown
router.post('/export', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(id => typeof id === 'string') : [];
  if (!ids.length) return res.status(400).json({ error: 'ids is required' });
  const markdown = blockStore.exportMarkdown(ids, {
    title: typeof req.body.title === 'string' && req.body.title.trim() ? req.body.title.trim().slice(0, 200) : 'NexusTerm runbook',
    includeOutput: req.body.includeOutput !== false,
  });
  res.type('text/markdown').send(markdown);
});

router.delete('/', (req, res) => {
  blockStore.clearAll();
  res.json({ success: true });
});

export default router;

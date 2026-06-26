import express from 'express';
import { getAll, deleteEntry, clear } from '../services/errorMemoryStore.js';

const router = express.Router();

// GET /api/memory - Get all memory entries (paginated)
router.get('/', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search ? req.query.search.toLowerCase() : '';

    let entries = getAll();

    // Perform filter if search query is provided
    if (search) {
      entries = entries.filter(e => 
        (e.errorPattern && e.errorPattern.toLowerCase().includes(search)) ||
        (e.solutionSummary && e.solutionSummary.toLowerCase().includes(search)) ||
        (e.errorKeywords && e.errorKeywords.some(k => k.toLowerCase().includes(search)))
      );
    }

    // Default sort by useCount descending
    entries = [...entries].sort((a, b) => b.useCount - a.useCount);

    const total = entries.length;
    const startIndex = (page - 1) * limit;
    const paginatedEntries = entries.slice(startIndex, startIndex + limit);

    res.json({
      entries: paginatedEntries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/memory/stats - Get aggregate stats
router.get('/stats', (req, res) => {
  try {
    const entries = getAll();
    const totalEntries = entries.length;
    const totalTimesUsed = entries.reduce((sum, e) => sum + (e.useCount || 0), 0);
    
    // Get top 5 most used entries
    const topErrors = [...entries]
      .sort((a, b) => (b.useCount || 0) - (a.useCount || 0))
      .slice(0, 5)
      .map(e => ({
        id: e.id,
        errorPattern: e.errorPattern,
        solutionSummary: e.solutionSummary,
        useCount: e.useCount
      }));

    res.json({
      totalEntries,
      totalTimesUsed,
      topErrors
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/memory/:id - Delete a specific entry
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    deleteEntry(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/memory - Clear all entries
router.delete('/', (req, res) => {
  try {
    clear();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

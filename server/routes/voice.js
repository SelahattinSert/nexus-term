import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { resolveIntent } from '../services/voiceService.js';
import { getSession } from '../ptyManager.js';
import { getGitStatus } from '../gitMonitor.js';
import { getProfiles } from '../services/sshService.js';
import { resolveInsideRoot } from '../utils/safePath.js';

/**
 * Voice assistant API. Speech recognition runs locally in the browser (Whisper via transformers.js),
 * so the server only receives text.
 */
const router = express.Router();

const MAX_TEXT = 2000;

// Spoken request (already transcribed in the browser)
router.post('/text', async (req, res) => {
  const { text, sessionId, raw, corrections } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'text is required.' });
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required.' });

  try {
    const result = await resolveIntent(text.slice(0, MAX_TEXT), sessionId, {
      speech: {
        raw: typeof raw === 'string' ? raw.slice(0, MAX_TEXT) : undefined,
        corrections: Array.isArray(corrections) ? corrections.filter(c => c && typeof c.from === 'string' && typeof c.to === 'string') : [],
      },
    });
    res.json({ success: true, text, action: result });
  } catch (error) {
    console.error('[Voice API] Intent resolution failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Autonomous ReAct loop: feedback about the previous actions
router.post('/react', async (req, res) => {
  const { message, sessionId } = req.body || {};
  if (!message || !sessionId) {
    return res.status(400).json({ error: 'message and sessionId are required.' });
  }

  try {
    // The feedback describes the results of the previous tool calls
    const result = await resolveIntent(String(message).slice(0, 8000), sessionId, { isToolResult: true });
    res.json({ success: true, text: 'Thinking...', action: result });
  } catch (error) {
    console.error('[Voice API ReAct] error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Words the speech recognizer should expect for this terminal: npm/yarn scripts, git branches,
 * file names in the working directory and SSH profile names. Used as Whisper prompt hints and for
 * correcting misheard commands in the browser.
 */
router.get('/context', async (req, res) => {
  const session = req.query.sessionId ? getSession(String(req.query.sessionId)) : null;
  const cwd = session?.cwd ? resolveInsideRoot(session.cwd) : null;
  const context = { cwd: session?.cwd || null, scripts: [], branches: [], files: [], sshProfiles: [] };

  const tasks = [];
  if (cwd) {
    tasks.push(fs.readFile(path.join(cwd, 'package.json'), 'utf8')
      .then(json => { context.scripts = Object.keys(JSON.parse(json).scripts || {}).slice(0, 40); })
      .catch(() => {}));
    tasks.push(fs.readdir(cwd)
      .then(names => { context.files = names.filter(n => !n.startsWith('.')).slice(0, 80); })
      .catch(() => {}));
    tasks.push(new Promise(resolve => getGitStatus(cwd, (status) => {
      if (status) context.branches = [...new Set([...(status.branches || []), ...(status.remoteBranches || [])])].slice(0, 40);
      resolve();
    })));
  }
  tasks.push(getProfiles().then(p => { context.sshProfiles = p.map(x => x.name).slice(0, 40); }).catch(() => {}));
  await Promise.all(tasks);
  res.json(context);
});

export default router;

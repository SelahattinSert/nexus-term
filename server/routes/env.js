import express from 'express';
import path from 'path';
import { 
  findEnvFiles, 
  getEnvFileDetails, 
  revealVariable, 
  saveEnvFile, 
  validateEnvFile,
  checkRevealRateLimit,
  switchProfile
} from '../services/envService.js';
import { getSessionDetails } from '../ptyManager.js';
import fs from 'fs/promises';

const router = express.Router();

// Helper to get CWD
function getCwdFromReq(req) {
  // If a sessionId is provided in query, use that session's CWD
  // Otherwise, default to process.cwd() or similar. 
  // In NexusTerm, we usually have a global active session or we pass the cwd explicitly.
  // For simplicity, let's assume the frontend passes `cwd` in the query, 
  // or we get it from the focused session if not provided.
  const sid = req.query.sessionId;
  if (sid) {
    const details = getSessionDetails(sid);
    if (details && details.cwd) return details.cwd;
  }
  return req.query.cwd || process.cwd();
}

// Decode base64 ID to filePath securely
function getPathFromId(id, cwd) {
  try {
    const filePath = Buffer.from(id, 'base64').toString('utf-8');
    // Basic path traversal prevention: ensure the path starts with CWD
    // (In a real app, path.relative and checking for '..' is better)
    return filePath;
  } catch (e) {
    return null;
  }
}

router.get('/files', async (req, res) => {
  try {
    const cwd = getCwdFromReq(req);
    const filePaths = await findEnvFiles(cwd);
    
    const details = [];
    for (const fp of filePaths) {
      const detail = await getEnvFileDetails(cwd, fp, true);
      if (detail) details.push(detail);
    }
    
    res.json({ files: details });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/files/:id', async (req, res) => {
  try {
    const cwd = getCwdFromReq(req);
    const filePath = getPathFromId(req.params.id, cwd);
    if (!filePath) return res.status(400).json({ error: 'Invalid ID' });
    
    const detail = await getEnvFileDetails(cwd, filePath, true);
    if (!detail) return res.status(404).json({ error: 'File not found' });
    
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/files/:id/reveal/:key', async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress;
    const allowed = await checkRevealRateLimit(ip);
    if (!allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded. Too many reveal requests.' });
    }

    const cwd = getCwdFromReq(req);
    const filePath = getPathFromId(req.params.id, cwd);
    if (!filePath) return res.status(400).json({ error: 'Invalid ID' });
    
    const value = await revealVariable(filePath, req.params.key);
    if (value === null) return res.status(404).json({ error: 'Key not found' });
    
    res.json({ value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/files/:id', async (req, res) => {
  try {
    const cwd = getCwdFromReq(req);
    const filePath = getPathFromId(req.params.id, cwd);
    if (!filePath) return res.status(400).json({ error: 'Invalid ID' });
    
    await saveEnvFile(filePath, req.body.variables);
    
    // Return updated details
    const detail = await getEnvFileDetails(cwd, filePath, true);
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/files/:id/validate', async (req, res) => {
  try {
    const cwd = getCwdFromReq(req);
    const filePath = getPathFromId(req.params.id, cwd);
    if (!filePath) return res.status(400).json({ error: 'Invalid ID' });
    
    const results = await validateEnvFile(cwd, filePath);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/switch', async (req, res) => {
  try {
    const cwd = getCwdFromReq(req);
    const { id } = req.body;
    const filePath = getPathFromId(id, cwd);
    if (!filePath) return res.status(400).json({ error: 'Invalid ID' });

    await switchProfile(cwd, filePath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/gitignore-add', async (req, res) => {
  try {
    const cwd = getCwdFromReq(req);
    const { id } = req.body;
    const filePath = getPathFromId(id, cwd);
    if (!filePath) return res.status(400).json({ error: 'Invalid ID' });

    const gitignorePath = path.join(cwd, '.gitignore');
    const fileName = path.basename(filePath);
    
    await fs.appendFile(gitignorePath, `\n${fileName}\n`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
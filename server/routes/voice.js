import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { transcribeAudio, resolveIntent } from '../services/voiceService.js';
import { injectCommand } from '../ptyManager.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file uploaded.' });
  }

  const audioFilePath = req.file.path;
  const sessionId = req.body.sessionId;

  if (!sessionId) {
    fs.unlinkSync(audioFilePath);
    return res.status(400).json({ error: 'sessionId is required.' });
  }

  try {
    const text = await transcribeAudio(audioFilePath);
    const action = await resolveIntent(text);

    if (action.type === 'execute_terminal_command' && action.command) {
      injectCommand(sessionId, action.command);
    }

    res.json({ success: true, text, action });
  } catch (error) {
    console.error('Voice processing error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    // Clean up the uploaded file
    if (fs.existsSync(audioFilePath)) {
      fs.unlinkSync(audioFilePath);
    }
  }
});

export default router;

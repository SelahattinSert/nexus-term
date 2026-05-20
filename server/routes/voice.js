import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { transcribeAudio, resolveIntent } from '../services/voiceService.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/', upload.single('audio'), async (req, res) => {
  console.log('[Voice API] Received audio upload request');
  if (!req.file) {
    console.log('[Voice API] Error: No audio file uploaded');
    return res.status(400).json({ error: 'No audio file uploaded.' });
  }

  const audioFilePath = req.file.path;
  const sessionId = req.body.sessionId;
  console.log(`[Voice API] Audio saved temporarily at ${audioFilePath}, sessionId: ${sessionId}`);

  if (!sessionId) {
    fs.unlinkSync(audioFilePath);
    console.log('[Voice API] Error: sessionId is missing');
    return res.status(400).json({ error: 'sessionId is required.' });
  }

  try {
    console.log('[Voice API] Starting local Whisper transcription...');
    const text = await transcribeAudio(audioFilePath);
    console.log(`[Voice API] Transcription successful: "${text}"`);

    console.log('[Voice API] Sending to LLM for intent resolution...');
    const result = await resolveIntent(text, sessionId);
    console.log(`[Voice API] LLM Action resolved:`, result);

    // Backend injection removed. All command execution logic, including Approval Modals 
    // and ReAct looping, is now orchestrated securely by the frontend.

    res.json({ success: true, text, action: result });
  } catch (error) {
    console.error('[Voice API] Voice processing error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    // Clean up the uploaded file
    if (fs.existsSync(audioFilePath)) {
      fs.unlinkSync(audioFilePath);
      console.log('[Voice API] Cleaned up temporary audio file.');
    }
  }
});

// Autonomous ReAct Loop Endpoint
router.post('/react', express.json(), async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) {
    return res.status(400).json({ error: 'message and sessionId are required.' });
  }

  try {
    console.log(`[Voice API ReAct] Sending feedback to LLM for autonomous loop...`);
    const result = await resolveIntent(message, sessionId);
    console.log(`[Voice API ReAct] LLM Action resolved:`, result);
    
    res.json({ success: true, text: "Thinking...", action: result });
  } catch (error) {
    console.error('[Voice API ReAct] error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

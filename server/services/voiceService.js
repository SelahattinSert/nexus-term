import { pipeline } from '@xenova/transformers';
import OpenAI from 'openai';
import { voiceFunctionSchemas } from '../utils/functionSchemas.js';
import { readConfig } from '../utils/configManager.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import pkg from 'wavefile';
const { WaveFile } = pkg;

ffmpeg.setFfmpegPath(ffmpegStatic);

let transcriber = null;
let currentTranscriberModel = null;
const globalConversationHistory = [];

export async function transcribeAudio(audioFilePath) {
  const config = await readConfig();
  const targetModel = config.whisperModel || 'Xenova/whisper-base';
  const targetLanguage = config.whisperLanguage || 'auto';

  // Initialize or re-initialize the transcriber if the model changed
  if (!transcriber || currentTranscriberModel !== targetModel) {
    console.log(`[Voice API] Loading ${targetModel} model into memory...`);
    transcriber = await pipeline('automatic-speech-recognition', targetModel);
    currentTranscriberModel = targetModel;
  }
  
  return new Promise((resolve, reject) => {
    const wavFilePath = audioFilePath + '.wav';
    
    // Convert WebM to 16kHz WAV format using ffmpeg
    ffmpeg(audioFilePath)
      .output(wavFilePath)
      .outputOptions([
        '-ar 16000', // Sample rate 16kHz
        '-ac 1',     // Mono channel
        '-c:a pcm_s16le' // 16-bit PCM
      ])
      .on('end', async () => {
        try {
          // Read the WAV file
          const buffer = fs.readFileSync(wavFilePath);
          const wav = new WaveFile(buffer);
          wav.toBitDepth('32f'); // Convert to 32-bit float
          wav.toSampleRate(16000); // Ensure 16kHz
          let audioData = wav.getSamples();
          
          if (Array.isArray(audioData)) {
            if (audioData.length > 0) audioData = audioData[0]; // Take first channel if it's an array of channels
            else audioData = new Float32Array(0);
          }

          console.log(`[Voice API] Sending audio data to local Whisper model (${targetModel}, Lang: ${targetLanguage})...`);
          
          const transcriptionOptions = {};
          if (targetLanguage !== 'auto' && !targetModel.endsWith('.en')) {
            transcriptionOptions.language = targetLanguage;
            transcriptionOptions.task = 'transcribe';
          }

          const result = await transcriber(audioData, transcriptionOptions);
          
          // Cleanup the converted wav file
          if (fs.existsSync(wavFilePath)) fs.unlinkSync(wavFilePath);
          
          resolve(result.text);
        } catch (err) {
          if (fs.existsSync(wavFilePath)) fs.unlinkSync(wavFilePath);
          reject(err);
        }
      })
      .on('error', (err) => {
        if (fs.existsSync(wavFilePath)) fs.unlinkSync(wavFilePath);
        reject(err);
      })
      .run();
  });
}

import { getSessionDetails } from '../ptyManager.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function resolveIntent(text, sessionId) {
  const config = await readConfig();
  
  const provider = config.provider || 'openai';
  let baseURL = config.url || 'https://api.openai.com/v1';

  // Normalize Gemini URL to prevent 404s
  if (provider === 'gemini') {
    baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
  }

  const openai = new OpenAI({
    apiKey: config.apiKey || process.env.LLM_API_KEY || 'dummy-local-key',
    baseURL: baseURL
  });

  // Load Persona
  let persona = 'You are a helpful CLI assistant.';
  try {
    const personaPath = path.join(__dirname, '..', 'utils', 'nexus_persona.md');
    persona = fs.readFileSync(personaPath, 'utf8');
  } catch (err) {
    console.error('[Voice API] Failed to load persona file:', err.message);
  }

  // Inject Context
  let contextStr = `\n\n## 📍 Current Context\n- Operating System: ${process.platform}\n`;
  if (sessionId) {
    const details = getSessionDetails(sessionId);
    if (details) {
      contextStr += `- Active Shell (Interpreter): ${details.shell}\n`;
      contextStr += `- Current Working Directory: ${details.cwd}\n`;
      contextStr += `\n### 📺 Recent Terminal Output (Screen)\n\`\`\`\n${details.recentOutput}\n\`\`\`\n`;
      contextStr += `\n*Note: Use the terminal output above to answer user questions about what happened, what failed, or what is currently on the screen. Treat it as your eyes.*`;
    }
  }
  
  const systemPrompt = persona + contextStr;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...globalConversationHistory,
    { role: 'user', content: text }
  ];

  const response = await openai.chat.completions.create({
    model: config.model || 'gpt-3.5-turbo',
    messages: messages,
    tools: voiceFunctionSchemas,
    tool_choice: 'auto' // Allow multiple tool calls natively
  });

  const message = response.choices[0].message;
  
  // Save to history
  globalConversationHistory.push({ role: 'user', content: text });
  
  if (message.tool_calls && message.tool_calls.length > 0) {
    const actions = message.tool_calls.map(tc => {
      const action = JSON.parse(tc.function.arguments);
      // Fallback for older schema if it wrapped it in {type, ...}
      return action.type ? action : { type: tc.function.name, ...action };
    });
    
    const actionStrings = actions.map(a => a.action || a.command || a.response);
    globalConversationHistory.push({ role: 'system', content: `System Note: In the previous turn, you executed these actions: ${actionStrings.join(', ')}` });
    if (globalConversationHistory.length > 20) globalConversationHistory.splice(0, globalConversationHistory.length - 20);
    return { type: 'multi_action', actions };
  }
  
  globalConversationHistory.push({ role: 'assistant', content: message.content || '' });
  if (globalConversationHistory.length > 20) globalConversationHistory.splice(0, globalConversationHistory.length - 20);

  return { type: 'text_response', response: message.content || 'I could not process that request.' };
}

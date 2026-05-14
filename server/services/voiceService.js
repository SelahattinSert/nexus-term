import { pipeline } from '@xenova/transformers';
import OpenAI from 'openai';
import { voiceFunctionSchema } from '../utils/functionSchemas.js';
import { readConfig } from '../utils/configManager.js';

let transcriber = null;

export async function transcribeAudio(audioFilePath) {
  // Initialize the local Whisper transcriber if not already done
  if (!transcriber) {
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny');
  }
  
  // Note: @xenova/transformers ASR typically expects a .wav file when running in Node.js.
  // Ensure the frontend sends a format that is readable by the pipeline.
  const result = await transcriber(audioFilePath);
  return result.text;
}

export async function resolveIntent(text) {
  const config = await readConfig();

  const openai = new OpenAI({
    apiKey: config.apiKey || process.env.LLM_API_KEY || 'dummy-local-key',
    baseURL: config.baseURL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  });

  const response = await openai.chat.completions.create({
    model: config.model || process.env.LLM_MODEL || 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'You are a helpful CLI assistant. You receive a transcribed text and must determine the intent to execute a terminal command, perform a UI action, or respond with text.' },
      { role: 'user', content: text }
    ],
    functions: [voiceFunctionSchema],
    function_call: { name: 'execute_action' }
  });

  const message = response.choices[0].message;
  if (message.function_call) {
    return JSON.parse(message.function_call.arguments);
  }
  return { type: 'text_response', response: message.content };
}

import { getLlama, LlamaChatSession } from 'node-llama-cpp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODEL_PATH = path.join(__dirname, 'models', 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf');

let llama = null;
let model = null;
let context = null;
let session = null;
let isInitializing = false;

/**
 * Initializes the local LLM model in the background.
 * Call this when the server starts to avoid delays on the first error.
 */
export async function initLlama() {
  if (isInitializing || session) return;
  isInitializing = true;
  try {
    console.log('[NEXUSTERM] Initializing embedded local LLM (Qwen2.5-Coder)...');
    llama = await getLlama();
    model = await llama.loadModel({
      modelPath: MODEL_PATH
    });
    context = await model.createContext();
    session = new LlamaChatSession({
      contextSequence: context.getSequence()
    });
    console.log('[NEXUSTERM] Local LLM loaded successfully into memory. AI is ready!');
  } catch (error) {
    console.error('[NEXUSTERM] Failed to load local LLM. Check if the model is downloaded.', error.message);
  } finally {
    isInitializing = false;
  }
}

/**
 * Sends the failed command details to the embedded local LLM for analysis.
 * @param {Object} payload - The structured error payload from the shell hook.
 * @returns {Promise<string>} - The suggested fix or command.
 */
export async function analyzeCommandError(payload) {
  if (!session) {
    await initLlama();
  }

  if (!session) {
    throw new Error('Local LLM engine is not available.');
  }

  const prompt = `Task: Fix the following shell command.
Rules:
- Output ONLY the fixed command. 
- No explanations, no markdown, no quotes.
- If the command name (1st word) is wrong, fix it (e.g. dpckre -> docker).
- Fix misspelled arguments/flags.

Examples:
Input: gti status
Output: git status

Input: nmp install react
Output: npm install react

Input: ssh @root 172.168.1.1
Output: ssh root@172.168.1.1

Input: dpckre runn -it alphine
Output: docker run -it alpine

Input: ${payload.cmd}
Output:`;

  // Clear previous history to ensure independent analysis and avoid sequence exhaustion
  session.setChatHistory([]);

  const answer = await session.prompt(prompt, {
    maxTokens: 50,
    temperature: 0.1
  });

  // Clean the output: remove markdown backticks, quotes, and whitespace
  let cleaned = answer.replace(/[`'"]/g, '').trim();
  
  if (cleaned.toUpperCase() === 'FAILED') return null;

  return cleaned;
}

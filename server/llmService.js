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
let isProcessing = false;

export function setSessionForTest(mockSession) {
  session = mockSession;
}

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

  // Simple concurrency management: wait if another request is being processed
  while (isProcessing) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  isProcessing = true;

  try {
    // Clear previous history to ensure independent analysis and avoid context pollution
    session.setChatHistory([]);

    const hintText = (payload.closestCommands && payload.closestCommands.length > 0)
      ? `Hint: The user likely misspelled the first word. Here are the 10 most similar valid commands installed on this system: [${payload.closestCommands.join(', ')}]. Choose the correct one from this list to replace the first word.\n` 
      : '';

    const prompt = `You are a command-line autocorrect AI.
Your ONLY task is to fix typos in the provided shell command.

Rules:
1. Fix the executable name if it is misspelled.
2. Fix misspelled subcommands, arguments, and flags.
3. Output ONLY the corrected command. No explanations, no markdown formatting, no quotes.

${hintText}
Broken command: ${payload.cmd}
Corrected command:`;

    const answer = await session.prompt(prompt, {
      maxTokens: 50,
      temperature: 0.1
    });

    // Clean the output: remove markdown backticks, quotes, and whitespace
    let cleaned = answer.replace(/[`'"]/g, '').trim();
    
    if (cleaned.toUpperCase() === 'FAILED') return null;

    return cleaned;
  } finally {
    isProcessing = false;
  }
}
import { getLlama, LlamaChatSession } from 'node-llama-cpp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODEL_PATH = path.join(__dirname, '..', 'models', 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf');

async function test() {
    const llama = await getLlama();
    const model = await llama.loadModel({ modelPath: MODEL_PATH });
    const context = await model.createContext();
    const session = new LlamaChatSession({ contextSequence: context.getSequence() });

    const payload = {
        cmd: 'dpckre runn -it --rmm alphine sh',
        exitCode: 1,
        cwd: 'C:\\Users\\Selahattin'
    };

    const prompt = `You are an expert developer assistant inside a terminal. 
The user ran a command that failed.
Command: ${payload.cmd}
Exit Code: ${payload.exitCode}
Working Directory: ${payload.cwd}

Analyze the error. What did the user mean to type? 
Provide ONLY the corrected command. No markdown, no quotes, no explanations. Just the raw command.`;

    console.log("Testing prompt...");
    const result = await session.prompt(prompt, { maxTokens: 50, temperature: 0.1 });
    console.log("Result:", result);
}

test().catch(console.error);

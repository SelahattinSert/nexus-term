import { getLlama, LlamaChatSession } from "node-llama-cpp";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODEL_PATH = path.join(__dirname, "..", "models", "qwen2.5-coder-1.5b-instruct-q4_k_m.gguf");

async function run() {
  console.log("Loading llama...");
  const llama = await getLlama();
  console.log("Loading model...");
  const model = await llama.loadModel({ modelPath: MODEL_PATH });
  console.log("Creating context...");
  const context = await model.createContext();
  const session = new LlamaChatSession({ contextSequence: context.getSequence() });
  
  console.log("Prompting...");
  const res = await session.prompt("The user typed 'np run dev' which failed. What did they mean? Output only the command.", { maxTokens: 50, temperature: 0.1 });
  console.log("Result:", res);
}

run().catch(console.error);

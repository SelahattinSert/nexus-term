import { getLlama, LlamaChatSession } from "node-llama-cpp";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODEL_PATH = path.join(__dirname, "..", "models", "qwen2.5-coder-1.5b-instruct-q4_k_m.gguf");

async function run() {
  const llama = await getLlama();
  const model = await llama.loadModel({ modelPath: MODEL_PATH });
  const context = await model.createContext();
  
  const session = new LlamaChatSession({ contextSequence: context.getSequence() });
  
  console.log("Prompt 1");
  await session.prompt("What is 1+1?", { maxTokens: 10 });
  console.log("History size:", session.getChatHistory().length);
  
  console.log("Resetting history...");
  session.setChatHistory([]);
  console.log("History size after reset:", session.getChatHistory().length);
  
  console.log("Prompt 2");
  await session.prompt("What is 2+2?", { maxTokens: 10 });
  console.log("Done");
}
run().catch(console.error);

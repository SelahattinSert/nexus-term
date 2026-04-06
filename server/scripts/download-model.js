import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Download model to /server/models/
const MODEL_DIR = path.join(__dirname, '..', 'models');
const MODEL_NAME = 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf';
const MODEL_PATH = path.join(MODEL_DIR, MODEL_NAME);

// Qwen2.5-Coder-1.5B GGUF file from HuggingFace
const MODEL_URL = 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf';

if (!fs.existsSync(MODEL_DIR)) {
  fs.mkdirSync(MODEL_DIR, { recursive: true });
}

if (fs.existsSync(MODEL_PATH)) {
  console.log(`[+] Model ${MODEL_NAME} already exists. Skipping download.`);
  process.exit(0);
}

console.log(`[+] Downloading ${MODEL_NAME} (approx. 1.1GB). This may take a while depending on your connection...`);

const file = fs.createWriteStream(MODEL_PATH);

https.get(MODEL_URL, function handleResponse(response) {
  if (response.statusCode === 301 || response.statusCode === 302) {
    // Follow redirect
    https.get(response.headers.location, handleResponse).on('error', handleError);
  } else if (response.statusCode === 200) {
    const totalSize = parseInt(response.headers['content-length'], 10);
    let downloadedSize = 0;
    
    response.on('data', (chunk) => {
      downloadedSize += chunk.length;
      const progress = ((downloadedSize / totalSize) * 100).toFixed(2);
      process.stdout.write(`\rDownloading... ${progress}%`);
    });

    response.pipe(file);
    
    file.on('finish', () => {
      file.close();
      console.log(`\n[+] Download complete: ${MODEL_NAME}`);
      console.log(`[+] NexusTerm Smart Terminal is now fully configured with local AI!`);
    });
  } else {
    console.error(`\n[-] Failed to download: Server responded with status code ${response.statusCode}`);
    fs.unlinkSync(MODEL_PATH);
    process.exit(1);
  }
}).on('error', handleError);

function handleError(err) {
  fs.unlinkSync(MODEL_PATH);
  console.error(`\n[-] Error downloading model: ${err.message}`);
  process.exit(1);
}

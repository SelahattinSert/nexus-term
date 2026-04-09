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

function downloadWithRedirects(url, dest, maxRedirects = 10) {
  if (maxRedirects === 0) {
    console.error('\n[-] Too many redirects. Download failed.');
    process.exit(1);
  }

  const req = https.get(url, function handleResponse(response) {
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      // Follow redirect
      downloadWithRedirects(response.headers.location, dest, maxRedirects - 1);
    } else if (response.statusCode === 200) {
      const file = fs.createWriteStream(dest);
      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize) {
          const progress = ((downloadedSize / totalSize) * 100).toFixed(2);
          process.stdout.write(`\rDownloading... ${progress}%`);
        } else {
          process.stdout.write(`\rDownloading... ${(downloadedSize / (1024 * 1024)).toFixed(2)} MB`);
        }
      });

      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`\n[+] Download complete: ${MODEL_NAME}`);
        console.log(`[+] NexusTerm Smart Terminal is now fully configured with local AI!`);
      });
    } else {
      console.error(`\n[-] Failed to download: Server responded with status code ${response.statusCode}`);
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      process.exit(1);
    }
  }).on('error', (err) => {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    console.error(`\n[-] Error downloading model: ${err.message}`);
    process.exit(1);
  });
}

downloadWithRedirects(MODEL_URL, MODEL_PATH);
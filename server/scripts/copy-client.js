// Copies the client production build into server/public so the npm package is self-contained.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(serverDir, '..', 'client', 'dist');
const target = path.join(serverDir, 'public');

if (!fs.existsSync(path.join(source, 'index.html'))) {
  console.error(`Client build not found at ${source}. Run "npm run build" in client/ first.`);
  process.exit(1);
}
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
console.log(`Copied client build to ${target}`);

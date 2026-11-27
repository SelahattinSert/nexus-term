// Loaded with --import before every test file: isolate all NexusTerm state in a temporary directory
// so tests never read or wipe the developer's real ~/.nexusterm (config, SSH profiles, AI memory).
import fs from 'fs';
import os from 'os';
import path from 'path';

if (!process.env.NEXUSTERM_HOME) {
  process.env.NEXUSTERM_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nexusterm-test-'));
  process.on('exit', () => {
    try { fs.rmSync(process.env.NEXUSTERM_HOME, { recursive: true, force: true }); } catch { /* ignore */ }
  });
}

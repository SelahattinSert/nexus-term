import fs from 'fs';
import path from 'path';

let cachedExecutables = null;

export function getSystemExecutables() {
  if (cachedExecutables) return cachedExecutables;

  const executables = new Set();
  const paths = process.env.PATH ? process.env.PATH.split(path.delimiter) : [];

  for (const dir of paths) {
    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          // In Windows, executables usually end with .exe, .cmd, .bat, etc., but we can just strip the extension or store it.
          // For simplicity, we store the base name without extension for comparison, but it might be better to just store as is
          // and strip extensions during comparison.
          const ext = path.extname(file).toLowerCase();
          const isWindows = process.platform === 'win32';
          
          if (isWindows) {
            const validExts = ['.exe', '.cmd', '.bat', '.ps1'];
            if (validExts.includes(ext) || ext === '') {
               executables.add(path.basename(file, ext));
            }
          } else {
             executables.add(file);
          }
        }
      }
    } catch (err) {
      // Ignore directories we can't read
    }
  }

  // Add some common built-ins that might not be discrete files in PATH
  const builtins = ['cd', 'echo', 'exit', 'pwd', 'clear', 'cls', 'dir', 'ls', 'history', 'alias'];
  builtins.forEach(cmd => executables.add(cmd));

  cachedExecutables = Array.from(executables);
  return cachedExecutables;
}

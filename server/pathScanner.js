import fs from 'fs/promises';
import path from 'path';

let cachedExecutables = null;
let isScanning = false;
let scanPromise = null;

export async function getSystemExecutables() {
  if (cachedExecutables) return cachedExecutables;
  
  if (isScanning) return scanPromise;
  
  isScanning = true;
  scanPromise = new Promise(async (resolve) => {
    const executables = new Set();
    const paths = process.env.PATH ? process.env.PATH.split(path.delimiter) : [];

    // Process directories in parallel for faster scanning
    const scanPromises = paths.map(async (dir) => {
      try {
        const files = await fs.readdir(dir);
        for (const file of files) {
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
      } catch (err) {
        // Ignore directories we can't read or don't exist
      }
    });

    await Promise.all(scanPromises);

    // Add some common built-ins that might not be discrete files in PATH
    const builtins = ['cd', 'echo', 'exit', 'pwd', 'clear', 'cls', 'dir', 'ls', 'history', 'alias'];
    builtins.forEach(cmd => executables.add(cmd));

    cachedExecutables = Array.from(executables);
    isScanning = false;
    resolve(cachedExecutables);
  });
  
  return scanPromise;
}
import fs from 'fs/promises';
import path from 'path';
import util from 'util';
import globPkg from 'glob';
import { parseEnv, serializeEnv, isKeySensitive } from './envParser.js';

const globAsync = util.promisify(globPkg.glob);

// Simple in-memory rate limiting for reveals
const revealRateLimits = new Map();

export async function checkRevealRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 10;

  if (!revealRateLimits.has(ip)) {
    revealRateLimits.set(ip, []);
  }

  const timestamps = revealRateLimits.get(ip);
  // Clean up old timestamps
  while (timestamps.length > 0 && timestamps[0] <= now - windowMs) {
    timestamps.shift();
  }

  if (timestamps.length >= maxRequests) {
    return false; // Rate limited
  }

  timestamps.push(now);
  return true;
}

export async function findEnvFiles(cwd) {
  try {
    const normalizedCwd = cwd.replace(/\\/g, '/');
    const ignoreDirs = new Set(['node_modules', 'dist', 'build', '.next', 'coverage', '.turbo', '.cache', '.git']);
    let files = [];

    async function scanDir(currentDir, currentDepth) {
      if (currentDepth > 2) return;
      if (files.length >= 20) return; // Hard limit

      let entries;
      try {
        entries = await fs.readdir(currentDir, { withFileTypes: true });
      } catch (err) {
        // Ignore EPERM or access errors on specific directories
        return;
      }

      for (const entry of entries) {
        if (files.length >= 20) break;

        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          if (!ignoreDirs.has(entry.name) && !entry.name.startsWith('.')) {
            await scanDir(fullPath, currentDepth + 1);
          }
        } else if (entry.isFile() && entry.name.startsWith('.env')) {
          files.push(fullPath.replace(/\\/g, '/'));
        }
      }
    }

    await scanDir(normalizedCwd, 0);

    return [...new Set(files)];
  } catch (err) {
    console.error('[EnvService] Error finding env files:', err);
    return [];
  }
}

export async function isGitIgnored(cwd, filePath) {
  try {
    // Quick check using git CLI
    const { exec } = await import('child_process');
    const util = await import('util');
    const execAsync = util.promisify(exec);
    
    await execAsync(`git check-ignore -q "${filePath}"`, { cwd });
    return true; // if exit code 0, it is ignored
  } catch (e) {
    // exit code 1 means NOT ignored, or not a git repo
    return false;
  }
}

export async function getEnvFileDetails(cwd, filePath, redact = true) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const stat = await fs.stat(filePath);
    const variables = parseEnv(content);
    
    const fileName = path.basename(filePath);
    let profileName = 'default';
    if (fileName !== '.env') {
      profileName = fileName.replace('.env.', '');
    }

    const hasGitIgnore = await isGitIgnored(cwd, filePath);

    if (redact) {
      for (const v of variables) {
        if (v.isMasked && v.key) {
          v.value = null; // Redact!
        }
      }
    }

    return {
      id: Buffer.from(filePath).toString('base64'), // simple ID
      filePath,
      profileName,
      isActive: fileName === '.env',
      variables,
      lastModified: stat.mtime.toISOString(),
      hasGitIgnore
    };
  } catch (err) {
    console.error(`[EnvService] Error reading ${filePath}:`, err);
    return null;
  }
}

export async function revealVariable(filePath, key) {
  const content = await fs.readFile(filePath, 'utf-8');
  const variables = parseEnv(content);
  const v = variables.find(v => v.key === key);
  return v ? v.value : null;
}

export async function saveEnvFile(filePath, variablesPayload) {
  // variablesPayload contains the updated variables from frontend.
  // BUT frontend sends `null` for masked values it didn't reveal.
  // We need to merge it with the disk values so we don't overwrite secrets with `null`.
  
  const content = await fs.readFile(filePath, 'utf-8').catch(() => '');
  const existingVars = parseEnv(content);
  const existingMap = new Map();
  for (const v of existingVars) {
    if (v.key) existingMap.set(v.key, v.value);
  }

  const mergedVars = variablesPayload.map(frontendVar => {
    if (frontendVar.isMasked && frontendVar.value === null) {
      // User didn't edit this secret, keep original
      return { ...frontendVar, value: existingMap.get(frontendVar.key) || '' };
    }
    return frontendVar;
  });

  const newContent = serializeEnv(mergedVars);
  await fs.writeFile(filePath, newContent, 'utf-8');
}

export async function switchProfile(cwd, sourceFilePath) {
  const targetPath = path.join(cwd, '.env');
  
  // Backup existing .env if it exists
  try {
    await fs.access(targetPath);
    const timestamp = Math.floor(Date.now() / 1000);
    await fs.copyFile(targetPath, path.join(cwd, `.env.backup.${timestamp}`));
  } catch (e) {
    // .env doesn't exist, fine
  }

  await fs.copyFile(sourceFilePath, targetPath);
}

export async function validateEnvFile(cwd, filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const vars = parseEnv(content);
  const results = [];

  // Check for duplicates
  for (const v of vars) {
    if (v.isDuplicate) {
      results.push({ severity: 'error', key: v.key, message: 'Duplicate key definition' });
    }
    if (v.isMalformed) {
      results.push({ severity: 'error', key: null, message: `Malformed syntax: ${v.raw}` });
    }
    if (v.isEmpty && v.key) {
      results.push({ severity: 'warning', key: v.key, message: 'Empty value' });
    }
    // Check for unmasked secrets
    if (v.key && !v.isMasked && v.value && v.value.length > 20) {
      if (/^[a-zA-Z0-9_-]{20,}$/.test(v.value) || v.value.startsWith('eyJ')) {
        results.push({ severity: 'warning', key: v.key, message: 'Value looks like a secret but key name is not recognized as sensitive' });
      }
    }
  }

  // Check against .env.example
  try {
    const examplePath = path.join(path.dirname(filePath), '.env.example');
    const exampleContent = await fs.readFile(examplePath, 'utf-8');
    const exampleVars = parseEnv(exampleContent);
    
    const currentKeys = new Set(vars.filter(v => v.key).map(v => v.key));
    
    for (const exVar of exampleVars) {
      if (exVar.key && !currentKeys.has(exVar.key)) {
        results.push({ severity: 'error', key: exVar.key, message: `Missing required key from .env.example: ${exVar.key}` });
      }
    }
  } catch (e) {
    // No .env.example, skip
  }

  return results;
}
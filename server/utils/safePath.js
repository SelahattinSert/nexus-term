import fs from 'fs';
import path from 'path';

export function getRoot() {
  return process.env.HOME || process.env.USERPROFILE || process.cwd();
}

function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}

/**
 * Resolves `requested` and returns its real path if it stays inside `root` after following symlinks.
 * For paths that do not exist yet (e.g. a file about to be written) the parent directory is checked.
 * Returns null when the path escapes the root.
 */
export function resolveInsideRoot(requested, root = getRoot()) {
  if (typeof requested !== 'string' || !requested) return null;
  let realRoot;
  try { realRoot = fs.realpathSync(root); } catch { realRoot = path.resolve(root); }

  const absolute = path.resolve(requested);
  let real;
  try {
    real = fs.realpathSync(absolute);
  } catch {
    try {
      real = path.join(fs.realpathSync(path.dirname(absolute)), path.basename(absolute));
    } catch {
      return null;
    }
  }
  return isInside(realRoot, real) ? real : null;
}

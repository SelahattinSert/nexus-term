import { exec } from 'child_process';

/**
 * Returns status information if the given directory is a git repo,
 * otherwise callback(null) is called. Never throws (no-throw).
 */
export function getGitStatus(cwd, callback) {
  // Step 1: Is it a valid git repo?
  exec('git rev-parse --is-inside-work-tree', { cwd }, (err) => {
    if (err) return callback(null);

    // Step 2: Get branch name
    exec('git branch --show-current', { cwd }, (err, branchOut) => {
      const branch = branchOut?.trim() || 'HEAD detached';

      // Step 3: Get number of changed files
      exec('git status --porcelain', { cwd }, (err, statusOut) => {
        const changedFiles = statusOut
          ? statusOut.trim().split('\n').filter(Boolean).length
          : 0;

        callback({ branch, changedFiles });
      });
    });
  });
}

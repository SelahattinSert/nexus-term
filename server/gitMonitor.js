import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

/**
 * Returns status information if the given directory is a git repo,
 * otherwise callback(null) is called. Never throws (no-throw).
 */
export async function getGitStatus(cwd, callback) {
  try {
    // Step 1: Is it a valid git repo?
    await execAsync('git rev-parse --is-inside-work-tree', { cwd });

    // Step 2: Get branch name
    const { stdout: branchOut } = await execAsync('git branch --show-current', { cwd });
    const branch = branchOut?.trim() || 'HEAD detached';

    // Step 3: Get detailed file status
    const { stdout: statusOut } = await execAsync('git status --porcelain', { cwd });
    const files = statusOut
      ? statusOut.trim().split('\n').filter(Boolean).map(line => {
          return {
            status: line.substring(0, 2),
            file: line.substring(3).trim()
          };
        })
      : [];
    const changedFiles = files.length;

    // Step 4: Get all local branches
    const { stdout: branchesOut } = await execAsync('git branch --format="%(refname:short)"', { cwd });
    const branches = branchesOut
      ? branchesOut.trim().split('\n').filter(Boolean)
      : [];

    // Step 5: Get remote branches
    const { stdout: remoteBranchesOut } = await execAsync('git branch -r --format="%(refname:short)"', { cwd });
    const remoteBranches = remoteBranchesOut
      ? remoteBranchesOut.trim().split('\n').filter(Boolean).filter(b => !b.includes('->'))
      : [];

    callback({ branch, changedFiles, files, branches, remoteBranches });
  } catch (err) {
    callback(null);
  }
}

export async function fetchAndGetGitStatus(cwd, callback) {
  try {
    await execAsync('git fetch', { cwd });
  } catch (e) {
    // Ignore fetch errors
  }
  return getGitStatus(cwd, callback);
}


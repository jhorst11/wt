import { simpleGit } from 'simple-git';
import { join, basename, relative } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { resolveConfig } from './config.js';

export async function getGit(cwd = process.cwd()) {
  return simpleGit(cwd);
}

export async function isGitRepo(cwd = process.cwd()) {
  try {
    const git = await getGit(cwd);
    await git.revparse(['--git-dir']);
    return true;
  } catch {
    return false;
  }
}

export async function getRepoRoot(cwd = process.cwd()) {
  try {
    const git = await getGit(cwd);
    const root = await git.revparse(['--show-toplevel']);
    return root.trim();
  } catch {
    return null;
  }
}

export async function getCurrentBranch(cwd = process.cwd()) {
  try {
    const git = await getGit(cwd);
    const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
    return branch.trim();
  } catch {
    return null;
  }
}

export async function getLocalBranches(cwd = process.cwd()) {
  try {
    const git = await getGit(cwd);
    const result = await git.branchLocal();
    return result.all.map((name) => ({
      name,
      isCurrent: name === result.current,
    }));
  } catch {
    return [];
  }
}

export async function getRemoteBranches(cwd = process.cwd()) {
  try {
    const git = await getGit(cwd);
    // Fetch latest from remote first
    await git.fetch(['--all', '--prune']).catch(() => {});
    const result = await git.branch(['-r']);
    return result.all
      .filter((name) => !name.includes('HEAD'))
      .map((name) => ({
        name: name.replace(/^origin\//, ''),
        fullName: name,
        isRemote: true,
      }));
  } catch {
    return [];
  }
}

export async function getAllBranches(cwd = process.cwd()) {
  const [local, remote] = await Promise.all([
    getLocalBranches(cwd),
    getRemoteBranches(cwd),
  ]);

  // Merge and dedupe, preferring local branches
  const localNames = new Set(local.map((b) => b.name));
  const uniqueRemote = remote.filter((b) => !localNames.has(b.name));

  return {
    local,
    remote: uniqueRemote,
    all: [...local.map((b) => ({ ...b, type: 'local' })), ...uniqueRemote.map((b) => ({ ...b, type: 'remote' }))],
  };
}

export function getWorktreesBase(repoRoot, config) {
  const projectsDir = config.projectsDir.replace(/\/$/, '');
  let repoRel;

  if (repoRoot.startsWith(projectsDir + '/')) {
    repoRel = repoRoot.slice(projectsDir.length + 1);
  } else {
    repoRel = basename(repoRoot);
  }

  return join(config.worktreesDir, repoRel);
}

export async function getWorktrees(cwd = process.cwd()) {
  try {
    const git = await getGit(cwd);
    const result = await git.raw(['worktree', 'list', '--porcelain']);
    const worktrees = [];
    let current = {};

    for (const line of result.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.path) worktrees.push(current);
        current = { path: line.slice(9) };
      } else if (line.startsWith('branch ')) {
        current.branch = line.slice(7).replace('refs/heads/', '');
      } else if (line === 'bare') {
        current.bare = true;
      } else if (line === 'detached') {
        current.detached = true;
      }
    }
    if (current.path) worktrees.push(current);

    // Add name (last part of path) and identify main vs worktrees
    return worktrees.map((wt, index) => ({
      ...wt,
      name: basename(wt.path),
      isMain: index === 0,
    }));
  } catch {
    return [];
  }
}

export async function getWorktreesInBase(repoRoot, config) {
  const base = getWorktreesBase(repoRoot, config);
  if (!existsSync(base)) return [];

  try {
    const entries = readdirSync(base);
    const worktrees = [];

    for (const entry of entries) {
      const entryPath = join(base, entry);
      if (statSync(entryPath).isDirectory()) {
        // Check if it's a valid git worktree
        const gitFile = join(entryPath, '.git');
        if (existsSync(gitFile)) {
          const branch = await getCurrentBranch(entryPath);
          worktrees.push({
            name: entry,
            path: entryPath,
            branch: branch || 'unknown',
          });
        }
      }
    }

    return worktrees;
  } catch {
    return [];
  }
}

export async function getMainRepoPath(cwd = process.cwd()) {
  try {
    const git = await getGit(cwd);
    const result = await git.raw(['worktree', 'list', '--porcelain']);
    const firstLine = result.split('\n').find((l) => l.startsWith('worktree '));
    return firstLine ? firstLine.slice(9) : null;
  } catch {
    return null;
  }
}

export function buildBranchName(leaf, config) {
  const cleanLeaf = leaf.replace(/^\//, '').replace(/ /g, '-');
  const prefix = config.branchPrefix || '';
  if (prefix) {
    return `${prefix.replace(/\/$/, '')}/${cleanLeaf}`;
  }
  return cleanLeaf;
}

export async function branchExistsLocal(branchName, cwd = process.cwd()) {
  try {
    const git = await getGit(cwd);
    // Do not use --quiet: simple-git swallows non-zero exit codes when output is
    // empty, so `--quiet` (which suppresses output) causes the try-block to
    // succeed even when the ref does not exist.  Without --quiet the command
    // prints the SHA on success (keeping the try path) and writes to stderr on
    // failure (causing simple-git to throw into the catch path).
    const result = await git.raw(['show-ref', '--verify', `refs/heads/${branchName}`]);
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

export async function branchExistsRemote(branchName, cwd = process.cwd()) {
  try {
    const git = await getGit(cwd);
    const result = await git.raw(['ls-remote', '--exit-code', '--heads', 'origin', branchName]);
    return result.length > 0;
  } catch {
    return false;
  }
}

export async function ensureBranch(branchName, baseBranch = null, cwd = process.cwd()) {
  const git = await getGit(cwd);

  // Resolve detached HEAD to the actual commit SHA so it's usable as a base
  if (baseBranch === 'HEAD') {
    try {
      baseBranch = (await git.revparse(['HEAD'])).trim();
    } catch {
      throw new Error('HEAD does not point to a valid commit. Is this a new repository with no commits?');
    }
  }

  // If baseBranch is a remote ref, fetch it first to ensure it's up to date
  if (baseBranch && baseBranch.startsWith('origin/')) {
    const remoteBranchName = baseBranch.replace('origin/', '');
    try {
      await git.fetch(['origin', `${remoteBranchName}:refs/remotes/origin/${remoteBranchName}`]);
    } catch (fetchErr) {
      // Fetch failed - verify the remote ref still exists locally from a previous fetch
      try {
        await git.revparse(['--verify', baseBranch]);
      } catch {
        throw new Error(`Failed to fetch remote branch '${remoteBranchName}' and no local copy exists. The remote branch may have been deleted.`);
      }
    }
  }

  // If baseBranch is specified, verify it resolves to a valid ref
  if (baseBranch) {
    try {
      await git.revparse(['--verify', baseBranch]);
    } catch {
      throw new Error(`Base branch '${baseBranch}' does not exist or is not a valid reference.`);
    }
  }

  // Check if branch exists locally
  if (await branchExistsLocal(branchName, cwd)) {
    // If we have a remote baseBranch, update local branch to match it
    if (baseBranch && baseBranch.startsWith('origin/')) {
      try {
        const localSha = (await git.revparse([branchName])).trim();
        const remoteSha = (await git.revparse([baseBranch])).trim();

        if (localSha !== remoteSha) {
          await git.raw(['branch', '-f', branchName, baseBranch]);
          return { created: false, source: 'updated-from-remote' };
        }
      } catch {
        // If we can't compare, fall through to use local as-is
      }
    }
    return { created: false, source: 'local' };
  }

  // Check if branch exists on remote (with same name as branchName)
  if (await branchExistsRemote(branchName, cwd)) {
    await git.fetch(['origin', `${branchName}:${branchName}`]);
    return { created: false, source: 'remote' };
  }

  // Create new branch from base
  if (baseBranch) {
    await git.raw(['branch', branchName, baseBranch]);
  } else {
    await git.raw(['branch', branchName]);
  }

  return { created: true, source: 'new' };
}

export async function createWorktree(name, branchName, baseBranch = null, cwd = process.cwd()) {
  const git = await getGit(cwd);
  const repoRoot = await getRepoRoot(cwd);
  const config = resolveConfig(cwd, repoRoot);
  const worktreesBase = getWorktreesBase(repoRoot, config);

  // Prune stale worktree references before creating a new one
  await pruneWorktrees(cwd);

  // Ensure worktrees directory exists
  if (!existsSync(worktreesBase)) {
    mkdirSync(worktreesBase, { recursive: true });
  }

  const worktreePath = join(worktreesBase, name);

  // Check if worktree already exists
  if (existsSync(worktreePath)) {
    return { success: false, error: 'Worktree directory already exists', path: worktreePath };
  }

  // Fetch all remotes
  await git.fetch(['--all', '--prune']).catch(() => {});

  // Ensure branch exists (or determine if we need to create it)
  const branchResult = await ensureBranch(branchName, baseBranch, cwd);

  // Create worktree — ensureBranch guarantees the branch already exists, so we
  // just attach the worktree to it.
  await git.raw(['worktree', 'add', worktreePath, branchName]);

  return {
    success: true,
    path: worktreePath,
    branch: branchName,
    branchCreated: branchResult.created,
    branchSource: branchResult.source,
  };
}

export async function removeWorktree(path, force = false, cwd = process.cwd()) {
  const git = await getGit(cwd);

  // Prune stale worktree references before removing
  await pruneWorktrees(cwd);

  const args = ['worktree', 'remove'];
  if (force) args.push('--force');
  args.push(path);

  await git.raw(args);
  return { success: true };
}

export async function pruneWorktrees(cwd = process.cwd()) {
  const git = await getGit(cwd);
  await git.raw(['worktree', 'prune']);
  return { success: true };
}

export function isValidBranchName(name) {
  // Basic validation - git allows most characters but not some special ones
  if (!name || name.length === 0) return false;
  if (name.startsWith('-') || name.startsWith('.')) return false;
  if (name.endsWith('/') || name.endsWith('.')) return false;
  if (name.includes('..') || name.includes('//')) return false;
  if (/[\s~^:?*\[\]\\]/.test(name)) return false;
  return true;
}

export async function mergeBranch(sourceBranch, targetBranch = null, cwd = process.cwd()) {
  const git = await getGit(cwd);

  // If target specified, checkout to it first
  if (targetBranch) {
    await git.checkout(targetBranch);
  }

  // Merge the source branch
  const result = await git.merge([sourceBranch, '--no-edit']);

  return {
    success: true,
    merged: sourceBranch,
    into: targetBranch || await getCurrentBranch(cwd),
    result,
  };
}

export async function getMainBranch(cwd = process.cwd()) {
  const git = await getGit(cwd);

  // Try common main branch names
  const candidates = ['main', 'master', 'develop'];
  const branches = await getLocalBranches(cwd);
  const branchNames = branches.map(b => b.name);

  for (const candidate of candidates) {
    if (branchNames.includes(candidate)) {
      return candidate;
    }
  }

  // Fall back to first branch
  return branchNames[0] || 'main';
}

export async function hasUncommittedChanges(cwd = process.cwd()) {
  const git = await getGit(cwd);
  const status = await git.status();
  return !status.isClean();
}

export async function deleteBranch(branchName, force = false, cwd = process.cwd()) {
  const git = await getGit(cwd);
  const flag = force ? '-D' : '-d';
  await git.branch([flag, branchName]);
  return { success: true };
}

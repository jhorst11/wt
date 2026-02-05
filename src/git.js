import { simpleGit } from 'simple-git';
import { homedir } from 'os';
import { join, basename, relative } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';

// Configuration - can be overridden via environment variables
const config = {
  projectsDir: process.env.W_PROJECTS_DIR || join(homedir(), 'projects'),
  worktreesDir: process.env.W_WORKTREES_DIR || join(homedir(), 'projects', 'worktrees'),
  branchPrefix: process.env.W_DEFAULT_BRANCH_PREFIX || '',
};

export function getConfig() {
  return { ...config };
}

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

export function getWorktreesBase(repoRoot) {
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

export async function getWorktreesInBase(repoRoot) {
  const base = getWorktreesBase(repoRoot);
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

export function buildBranchName(leaf, prefix = config.branchPrefix) {
  const cleanLeaf = leaf.replace(/^\//, '').replace(/ /g, '-');
  if (prefix) {
    return `${prefix.replace(/\/$/, '')}/${cleanLeaf}`;
  }
  return cleanLeaf;
}

export async function branchExistsLocal(branchName, cwd = process.cwd()) {
  try {
    const git = await getGit(cwd);
    await git.raw(['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`]);
    return true;
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

  // Check if branch exists locally
  if (await branchExistsLocal(branchName, cwd)) {
    return { created: false, source: 'local' };
  }

  // Check if branch exists on remote
  if (await branchExistsRemote(branchName, cwd)) {
    await git.fetch(['origin', `${branchName}:${branchName}`]);
    return { created: false, source: 'remote' };
  }

  // Create new branch from base
  if (baseBranch) {
    // If baseBranch is remote, make sure we have it locally
    if (baseBranch.startsWith('origin/')) {
      const localName = baseBranch.replace('origin/', '');
      await git.fetch(['origin', localName]).catch(() => {});
    }
    await git.branch([branchName, baseBranch]);
  } else {
    await git.branch([branchName]);
  }

  return { created: true, source: 'new' };
}

export async function createWorktree(name, branchName, baseBranch = null, cwd = process.cwd()) {
  const git = await getGit(cwd);
  const repoRoot = await getRepoRoot(cwd);
  const worktreesBase = getWorktreesBase(repoRoot);

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

  // Ensure branch exists
  const branchResult = await ensureBranch(branchName, baseBranch, cwd);

  // Create worktree
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

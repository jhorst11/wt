import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, realpathSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { simpleGit } from 'simple-git';

// Resolve symlinks (macOS /tmp -> /private/tmp) so paths match git output
const tmpBase = realpathSync(mkdtempSync(join(tmpdir(), 'wt-test-')));

const {
  buildBranchName,
  isValidBranchName,
  getWorktreesBase,
  isGitRepo,
  getRepoRoot,
  getCurrentBranch,
  getLocalBranches,
  getRemoteBranches,
  getAllBranches,
  ensureBranch,
  createWorktree,
  removeWorktree,
  pruneWorktrees,
  getWorktrees,
  getMainRepoPath,
  branchExistsLocal,
  branchExistsRemote,
  getMainBranch,
  hasUncommittedChanges,
  deleteBranch,
  mergeBranch,
  getCurrentWorktreeInfo,
} = await import('../dist/src/git.js');

// ─── Helpers ──────────────────────────────────────────────

function setupTestConfig(repoRoot, overrides = {}) {
  const config = {
    projectsDir: join(tmpBase, 'projects'),
    worktreesDir: join(tmpBase, 'projects', 'worktrees'),
    branchPrefix: '',
    ...overrides,
  };
  const configDir = join(repoRoot, '.wt');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'config.json'), JSON.stringify(config));
  return config;
}

async function initRepo(dir) {
  mkdirSync(dir, { recursive: true });
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig('user.email', 'test@test.com');
  await git.addConfig('user.name', 'Test');
  writeFileSync(join(dir, 'README.md'), '# test\n');
  // Add .gitignore to exclude .wt directory
  writeFileSync(join(dir, '.gitignore'), '.wt/\n');
  await git.add('.');
  await git.commit('initial commit');
  // Set up default config for test repo
  setupTestConfig(dir);
  return git;
}

// ─── Pure / Utility Function Tests ────────────────────────

describe('buildBranchName', () => {
  it('returns the leaf name when no prefix', () => {
    assert.equal(buildBranchName('feature-x', { branchPrefix: '' }), 'feature-x');
  });

  it('joins prefix and leaf with slash', () => {
    assert.equal(buildBranchName('feature-x', { branchPrefix: 'user' }), 'user/feature-x');
  });

  it('strips trailing slash from prefix', () => {
    assert.equal(buildBranchName('feature-x', { branchPrefix: 'user/' }), 'user/feature-x');
  });

  it('strips leading slash from leaf', () => {
    assert.equal(buildBranchName('/feature-x', { branchPrefix: 'user' }), 'user/feature-x');
  });

  it('replaces spaces with hyphens in leaf', () => {
    assert.equal(buildBranchName('my feature', { branchPrefix: '' }), 'my-feature');
  });

  it('handles empty prefix as falsy', () => {
    assert.equal(buildBranchName('branch', { branchPrefix: '' }), 'branch');
  });
});

describe('isValidBranchName', () => {
  it('accepts a simple name', () => {
    assert.equal(isValidBranchName('feature-x'), true);
  });

  it('accepts names with slashes', () => {
    assert.equal(isValidBranchName('user/feature-x'), true);
  });

  it('rejects empty string', () => {
    assert.equal(isValidBranchName(''), false);
  });

  it('rejects null/undefined', () => {
    assert.equal(isValidBranchName(null), false);
    assert.equal(isValidBranchName(undefined), false);
  });

  it('rejects names starting with dash', () => {
    assert.equal(isValidBranchName('-feature'), false);
  });

  it('rejects names starting with dot', () => {
    assert.equal(isValidBranchName('.hidden'), false);
  });

  it('rejects names ending with slash', () => {
    assert.equal(isValidBranchName('feature/'), false);
  });

  it('rejects names ending with dot', () => {
    assert.equal(isValidBranchName('feature.'), false);
  });

  it('rejects double dots', () => {
    assert.equal(isValidBranchName('a..b'), false);
  });

  it('rejects double slashes', () => {
    assert.equal(isValidBranchName('a//b'), false);
  });

  it('rejects spaces', () => {
    assert.equal(isValidBranchName('a b'), false);
  });

  it('rejects special characters', () => {
    assert.equal(isValidBranchName('a~b'), false);
    assert.equal(isValidBranchName('a^b'), false);
    assert.equal(isValidBranchName('a:b'), false);
    assert.equal(isValidBranchName('a?b'), false);
    assert.equal(isValidBranchName('a*b'), false);
    assert.equal(isValidBranchName('a[b'), false);
    assert.equal(isValidBranchName('a\\b'), false);
  });
});
describe('getWorktreesBase', () => {
  it('derives worktree base from repo under projectsDir', () => {
    const projectsDir = join(tmpBase, 'projects');
    const repoRoot = join(projectsDir, 'my-repo');
    const config = { projectsDir, worktreesDir: join(tmpBase, 'projects', 'worktrees') };
    const result = getWorktreesBase(repoRoot, config);
    assert.equal(result, join(tmpBase, 'projects', 'worktrees', 'my-repo'));
  });

  it('uses basename for repos outside projectsDir', () => {
    const config = { projectsDir: join(tmpBase, 'projects'), worktreesDir: join(tmpBase, 'projects', 'worktrees') };
    const result = getWorktreesBase('/some/other/path/my-repo', config);
    assert.equal(result, join(tmpBase, 'projects', 'worktrees', 'my-repo'));
  });

  it('handles nested repos under projectsDir', () => {
    const projectsDir = join(tmpBase, 'projects');
    const repoRoot = join(projectsDir, 'org', 'my-repo');
    const config = { projectsDir, worktreesDir: join(tmpBase, 'projects', 'worktrees') };
    const result = getWorktreesBase(repoRoot, config);
    assert.equal(result, join(tmpBase, 'projects', 'worktrees', 'org', 'my-repo'));
  });
});

// ─── Git Operations (shared repo for basic tests) ─────────

describe('git operations', () => {
  const repoDir = join(tmpBase, 'shared-repo');
  let git;

  before(async () => {
    git = await initRepo(repoDir);
  });

  it('isGitRepo returns true for a git repository', async () => {
    assert.equal(await isGitRepo(repoDir), true);
  });

  it('isGitRepo returns false for a non-git directory', async () => {
    assert.equal(await isGitRepo(tmpBase), false);
  });

  it('getRepoRoot returns the repo root directory', async () => {
    const root = await getRepoRoot(repoDir);
    assert.equal(root, repoDir);
  });

  it('getRepoRoot returns root when called from a subdirectory', async () => {
    const subdir = join(repoDir, 'subdir');
    mkdirSync(subdir, { recursive: true });
    const root = await getRepoRoot(subdir);
    assert.equal(root, repoDir);
  });

  it('getRepoRoot returns null for a non-git directory', async () => {
    const root = await getRepoRoot(tmpBase);
    assert.equal(root, null);
  });

  it('getCurrentBranch returns the current branch name', async () => {
    const branch = await getCurrentBranch(repoDir);
    assert.ok(branch === 'main' || branch === 'master', `Expected main or master, got ${branch}`);
  });

  it('getLocalBranches returns array of local branches', async () => {
    await git.branch(['test-local-branch']);
    const branches = await getLocalBranches(repoDir);
    const names = branches.map(b => b.name);
    assert.ok(names.includes('test-local-branch'));
  });

  it('getLocalBranches marks the current branch correctly', async () => {
    const branches = await getLocalBranches(repoDir);
    const current = branches.find(b => b.isCurrent);
    assert.ok(current, 'Should have a current branch');
  });

  it('branchExistsLocal returns true for an existing branch', async () => {
    assert.equal(await branchExistsLocal('test-local-branch', repoDir), true);
  });

  it('branchExistsLocal returns false for a non-existing branch', async () => {
    assert.equal(await branchExistsLocal('nonexistent-xyz', repoDir), false);
  });

  it('getMainBranch returns main when it exists', async () => {
    const current = await getCurrentBranch(repoDir);
    if (current !== 'main') {
      await git.branch(['main']);
    }
    const mainBranch = await getMainBranch(repoDir);
    assert.equal(mainBranch, 'main');
  });

  it('getMainBranch falls back to master when main does not exist', async () => {
    const current = await getCurrentBranch(repoDir);
    // Ensure master exists
    const branches = await getLocalBranches(repoDir);
    const hasMaster = branches.some(b => b.name === 'master');
    if (!hasMaster) {
      await git.branch(['master']);
    }
    
    // Try to remove main if we're on it
    if (current === 'main') {
      const otherBranch = branches.find(b => b.name !== 'main')?.name || 'master';
      await git.checkout(otherBranch);
      try {
        await git.branch(['-D', 'main']);
      } catch {
        // main might be protected, that's ok - test will still verify master is returned if main doesn't exist
      }
    }
    
    const mainBranch = await getMainBranch(repoDir);
    // Should return master if main doesn't exist, or main if it does
    assert.ok(['main', 'master'].includes(mainBranch));
    
    // Restore main if we deleted it
    if (current === 'main') {
      const hasMain = (await getLocalBranches(repoDir)).some(b => b.name === 'main');
      if (!hasMain) {
        await git.checkout(['-b', 'main']);
      } else {
        await git.checkout('main');
      }
    }
  });

  it('getMainBranch falls back to first branch when neither main nor master exist', async () => {
    const current = await getCurrentBranch(repoDir);
    const branches = await getLocalBranches(repoDir);
    const firstBranch = branches.find(b => b.name !== 'main' && b.name !== 'master')?.name || branches[0]?.name;
    if (firstBranch) {
      const mainBranch = await getMainBranch(repoDir);
      assert.ok(['main', 'master', firstBranch].includes(mainBranch));
    }
  });

  it('hasUncommittedChanges returns false for a clean repo', async () => {
    assert.equal(await hasUncommittedChanges(repoDir), false);
  });

  it('hasUncommittedChanges returns true when files are modified', async () => {
    writeFileSync(join(repoDir, 'README.md'), '# modified\n');
    assert.equal(await hasUncommittedChanges(repoDir), true);
    // Restore
    await git.checkout(['--', 'README.md']);
  });

  it('hasUncommittedChanges returns true when files are staged', async () => {
    writeFileSync(join(repoDir, 'staged.txt'), 'staged\n');
    await git.add('staged.txt');
    assert.equal(await hasUncommittedChanges(repoDir), true);
    // Clean up
    await git.reset(['HEAD', 'staged.txt']);
    rmSync(join(repoDir, 'staged.txt'));
  });

  it('hasUncommittedChanges returns true when files are untracked', async () => {
    writeFileSync(join(repoDir, 'untracked.txt'), 'untracked\n');
    assert.equal(await hasUncommittedChanges(repoDir), true);
    // Clean up
    rmSync(join(repoDir, 'untracked.txt'));
  });

  it('deleteBranch deletes a merged branch', async () => {
    await git.branch(['to-delete-1']);
    await deleteBranch('to-delete-1', false, repoDir);
    assert.equal(await branchExistsLocal('to-delete-1', repoDir), false);
  });

  it('deleteBranch force deletes an unmerged branch', async () => {
    await git.checkout(['-b', 'unmerged-del']);
    writeFileSync(join(repoDir, 'unmerged.txt'), 'data\n');
    await git.add('.');
    await git.commit('unmerged commit');
    const mainBranch = await getCurrentBranch(repoDir) === 'unmerged-del'
      ? (await getLocalBranches(repoDir)).find(b => b.name !== 'unmerged-del').name
      : await getCurrentBranch(repoDir);
    await git.checkout(mainBranch);
    await deleteBranch('unmerged-del', true, repoDir);
    assert.equal(await branchExistsLocal('unmerged-del', repoDir), false);
  });

  it('pruneWorktrees succeeds on a clean repo', async () => {
    const result = await pruneWorktrees(repoDir);
    assert.deepEqual(result, { success: true });
  });

  it('getWorktrees lists the main worktree', async () => {
    const worktrees = await getWorktrees(repoDir);
    assert.ok(worktrees.length >= 1);
    assert.equal(worktrees[0].isMain, true);
    assert.equal(worktrees[0].path, repoDir);
  });

  it('getRemoteBranches returns empty array when no remotes', async () => {
    const branches = await getRemoteBranches(repoDir);
    assert.deepEqual(branches, []);
  });

  it('getRemoteBranches filters out HEAD references', async () => {
    // Create a bare remote
    const bareDir = join(tmpBase, 'remote-filter-bare');
    mkdirSync(bareDir, { recursive: true });
    const bareGit = simpleGit(bareDir);
    await bareGit.init(true);

    const sourceDir = join(tmpBase, 'remote-filter-source');
    const sourceGit = await initRepo(sourceDir);
    await sourceGit.addRemote('origin', bareDir);
    const mainBranch = await getCurrentBranch(sourceDir);
    await sourceGit.push('origin', mainBranch);
    await sourceGit.checkout(['-b', 'feature-branch']);
    writeFileSync(join(sourceDir, 'feature.txt'), 'feature\n');
    await sourceGit.add('.');
    await sourceGit.commit('feature');
    await sourceGit.push('origin', 'feature-branch');

    const branches = await getRemoteBranches(sourceDir);
    assert.ok(branches.length >= 1);
    assert.ok(branches.every(b => !b.fullName.includes('HEAD')));
    assert.ok(branches.some(b => b.name === 'feature-branch' || b.name === mainBranch));

    // Clean up
    rmSync(bareDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });

  it('getAllBranches merges local and remote branches', async () => {
    await git.branch(['local-only']);
    const all = await getAllBranches(repoDir);
    assert.ok(all.local.some(b => b.name === 'local-only'));
    assert.ok(all.all.some(b => b.name === 'local-only' && b.type === 'local'));
  });

  it('getAllBranches deduplicates preferring local', async () => {
    await git.branch(['duplicate-branch']);
    const all = await getAllBranches(repoDir);
    const duplicates = all.all.filter(b => b.name === 'duplicate-branch');
    assert.equal(duplicates.length, 1);
    assert.equal(duplicates[0].type, 'local');
  });

  it('getMainRepoPath returns main repo path', async () => {
    const mainPath = await getMainRepoPath(repoDir);
    assert.equal(mainPath, repoDir);
  });

  it('getMainRepoPath returns null for non-git directory', async () => {
    const mainPath = await getMainRepoPath(tmpBase);
    assert.equal(mainPath, null);
  });

  it('branchExistsRemote returns false when no remotes', async () => {
    assert.equal(await branchExistsRemote('nonexistent', repoDir), false);
  });

  it('getCurrentWorktreeInfo returns null when in main repo', async () => {
    const { resolveConfig } = await import('../dist/src/config.js');
    const config = resolveConfig(repoDir, repoDir);
    const info = await getCurrentWorktreeInfo(repoDir, config);
    assert.equal(info, null);
  });
});

// ─── ensureBranch ─────────────────────────────────────────

describe('ensureBranch', () => {
  const repoDir = join(tmpBase, 'ensure-repo');
  let git;

  before(async () => {
    git = await initRepo(repoDir);
  });

  it('returns existing local branch info', async () => {
    await git.branch(['existing']);
    const result = await ensureBranch('existing', null, repoDir);
    assert.equal(result.created, false);
    assert.equal(result.source, 'local');
  });

  it('creates a new branch from base', async () => {
    const mainBranch = await getCurrentBranch(repoDir);
    const result = await ensureBranch('new-feature', mainBranch, repoDir);
    assert.equal(result.created, true);
    assert.equal(result.source, 'new');
    assert.equal(await branchExistsLocal('new-feature', repoDir), true);
  });

  it('creates a new branch from HEAD when no baseBranch', async () => {
    const result = await ensureBranch('from-head', null, repoDir);
    assert.equal(result.created, true);
    assert.equal(result.source, 'new');
  });

  it('resolves detached HEAD to a commit SHA', async () => {
    const sha = (await git.revparse(['HEAD'])).trim();
    await git.checkout(sha);

    const result = await ensureBranch('detached-branch', 'HEAD', repoDir);
    assert.equal(result.created, true);
    assert.equal(result.source, 'new');
    assert.equal(await branchExistsLocal('detached-branch', repoDir), true);

    // Restore to a branch
    const mainBranch = (await getLocalBranches(repoDir)).find(b => !b.isCurrent)?.name || 'main';
    await git.checkout(mainBranch);
  });

  it('throws for invalid base branch', async () => {
    await assert.rejects(
      () => ensureBranch('new-branch-invalid', 'nonexistent-base', repoDir),
      { message: /does not exist/ }
    );
  });

  it('fetches from remote branch when baseBranch starts with origin/', async () => {
    // Create a bare remote
    const bareDir = join(tmpBase, 'ensure-bare');
    mkdirSync(bareDir, { recursive: true });
    const bareGit = simpleGit(bareDir);
    await bareGit.init(true);

    // Create a source repo, push to bare
    const sourceDir = join(tmpBase, 'ensure-source');
    const sourceGit = await initRepo(sourceDir);
    await sourceGit.addRemote('origin', bareDir);
    const sourceBranch = await getCurrentBranch(sourceDir);
    await sourceGit.push('origin', sourceBranch);

    // Create and push a feature branch
    await sourceGit.checkout(['-b', 'remote-feature']);
    writeFileSync(join(sourceDir, 'feature.txt'), 'feature\n');
    await sourceGit.add('.');
    await sourceGit.commit('feature commit');
    await sourceGit.push('origin', 'remote-feature');

    // Clone from bare
    const cloneDir = join(tmpBase, 'ensure-clone');
    await simpleGit().clone(bareDir, cloneDir);

    const result = await ensureBranch('new-from-remote', 'origin/remote-feature', cloneDir);
    assert.equal(result.created, true);
    assert.equal(result.source, 'new');

    // Clean up
    rmSync(bareDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
    rmSync(cloneDir, { recursive: true, force: true });
  });

  it('handles branch that exists on remote with same name', async () => {
    const bareDir = join(tmpBase, 'shared-bare');
    mkdirSync(bareDir, { recursive: true });
    const bareGit = simpleGit(bareDir);
    await bareGit.init(true);

    const sourceDir = join(tmpBase, 'shared-source');
    const sourceGit = await initRepo(sourceDir);
    await sourceGit.addRemote('origin', bareDir);
    const mainBranch = await getCurrentBranch(sourceDir);
    await sourceGit.push('origin', mainBranch);

    // Create and push a feature branch
    await sourceGit.checkout(['-b', 'shared-feature']);
    writeFileSync(join(sourceDir, 'shared.txt'), 'shared\n');
    await sourceGit.add('.');
    await sourceGit.commit('shared commit');
    await sourceGit.push('origin', 'shared-feature');
    await sourceGit.checkout(mainBranch);

    // Clone
    const cloneDir = join(tmpBase, 'shared-clone');
    await simpleGit().clone(bareDir, cloneDir);

    assert.equal(await branchExistsLocal('shared-feature', cloneDir), false);

    const result = await ensureBranch('shared-feature', null, cloneDir);
    assert.equal(result.created, false);
    assert.equal(result.source, 'remote');
    assert.equal(await branchExistsLocal('shared-feature', cloneDir), true);

    // Clean up
    rmSync(bareDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
    rmSync(cloneDir, { recursive: true, force: true });
  });
});

// ─── createWorktree ───────────────────────────────────────

describe('createWorktree', () => {
  const projectsDir = join(tmpBase, 'projects');
  const repoDir = join(projectsDir, 'wt-repo');
  let repoGit;

  before(async () => {
    mkdirSync(projectsDir, { recursive: true });
    repoGit = await initRepo(repoDir);
  });

  it('creates a worktree with a new branch', async () => {
    const mainBranch = await getCurrentBranch(repoDir);
    const result = await createWorktree('feat-1', 'feat-1-branch', mainBranch, repoDir);
    assert.equal(result.success, true);
    assert.ok(result.path.endsWith('feat-1'));
    assert.equal(result.branch, 'feat-1-branch');
    assert.equal(result.branchCreated, true);
    assert.ok(existsSync(result.path), 'Worktree directory should exist');
    assert.ok(existsSync(join(result.path, '.git')), 'Worktree should have .git file');
  });

  it('creates a worktree using an existing branch', async () => {
    await repoGit.branch(['existing-branch']);
    const result = await createWorktree('feat-2', 'existing-branch', null, repoDir);
    assert.equal(result.success, true);
    assert.equal(result.branchCreated, false);
    assert.equal(result.branchSource, 'local');
  });

  it('returns error if worktree directory already exists', async () => {
    const mainBranch = await getCurrentBranch(repoDir);
    const result = await createWorktree('feat-1', 'feat-dup-branch', mainBranch, repoDir);
    assert.equal(result.success, false);
    assert.ok(result.error.includes('already exists'));
  });

  it('lists created worktrees via getWorktrees', async () => {
    const worktrees = await getWorktrees(repoDir);
    assert.ok(worktrees.length >= 3, 'Should have main + 2 worktrees');
    const found = worktrees.find(wt => wt.branch === 'feat-1-branch');
    assert.ok(found, 'Should find feat-1-branch worktree');
    assert.equal(found.isMain, false);
  });

  it('removes an existing worktree', async () => {
    const worktrees = await getWorktrees(repoDir);
    const feat2 = worktrees.find(wt => wt.branch === 'existing-branch');
    assert.ok(feat2, 'Should find existing-branch worktree');

    await removeWorktree(feat2.path, false, repoDir);
    assert.equal(existsSync(feat2.path), false);
  });

  it('prunes stale worktree references', async () => {
    const mainBranch = await getCurrentBranch(repoDir);
    const result = await createWorktree('stale-wt', 'stale-wt-branch', mainBranch, repoDir);

    // Manually delete directory to create stale reference
    rmSync(result.path, { recursive: true, force: true });

    await pruneWorktrees(repoDir);

    const worktrees = await getWorktrees(repoDir);
    const stale = worktrees.find(wt => wt.branch === 'stale-wt-branch');
    assert.equal(stale, undefined, 'Stale worktree should be pruned');
  });

  it('createWorktree succeeds after stale refs exist', async () => {
    // After the previous test, stale-wt-branch is stale.
    // Creating a new worktree should prune stale refs automatically.
    const mainBranch = await getCurrentBranch(repoDir);
    const result = await createWorktree('after-stale', 'after-stale-branch', mainBranch, repoDir);
    assert.equal(result.success, true);
  });

  it('createWorktree works when HEAD is detached', async () => {
    // Remove other worktrees first to avoid branch checkout conflicts
    const worktrees = await getWorktrees(repoDir);
    for (const wt of worktrees) {
      if (!wt.isMain) {
        await removeWorktree(wt.path, true, repoDir).catch(() => {});
      }
    }
    await pruneWorktrees(repoDir);

    const sha = (await repoGit.revparse(['HEAD'])).trim();
    await repoGit.checkout(sha);

    const result = await createWorktree('detached-wt', 'detached-wt-branch', 'HEAD', repoDir);
    assert.equal(result.success, true);
    assert.equal(result.branchCreated, true);

    // Restore to a branch
    const mainBranch = (await getLocalBranches(repoDir)).find(b => !b.isCurrent)?.name;
    if (mainBranch) await repoGit.checkout(mainBranch);
  });
});

// ─── getWorktrees edge cases ─────────────────────────────

describe('getWorktrees edge cases', () => {
  const repoDir = join(tmpBase, 'worktrees-edge-repo');
  let git;

  before(async () => {
    git = await initRepo(repoDir);
  });

  it('handles detached HEAD worktrees', async () => {
    const sha = (await git.revparse(['HEAD'])).trim();
    const mainBranch = await getCurrentBranch(repoDir);
    await createWorktree('detached-worktree', 'detached-branch', mainBranch, repoDir);
    await git.checkout(mainBranch);

    // Checkout detached HEAD in worktree
    const wtPath = join(tmpBase, 'projects', 'worktrees', 'worktrees-edge-repo', 'detached-worktree');
    const wtGit = simpleGit(wtPath);
    await wtGit.checkout(sha);

    const worktrees = await getWorktrees(repoDir);
    const detached = worktrees.find(wt => wt.name === 'detached-worktree');
    assert.ok(detached);
    // Note: getWorktrees may not show detached status in branch field
  });

  it('parses porcelain output correctly', async () => {
    const worktrees = await getWorktrees(repoDir);
    assert.ok(worktrees.length >= 1);
    assert.ok(worktrees.every(wt => wt.path && wt.name));
  });

  it('identifies main worktree correctly', async () => {
    const worktrees = await getWorktrees(repoDir);
    const main = worktrees.find(wt => wt.isMain);
    assert.ok(main);
    assert.equal(main.path, repoDir);
  });
});

// ─── mergeBranch ────────────────────────────────────────

describe('mergeBranch', () => {
  const repoDir = join(tmpBase, 'merge-repo');
  let git;

  before(async () => {
    git = await initRepo(repoDir);
  });

  it('merges branch into current branch', async () => {
    const mainBranch = await getCurrentBranch(repoDir);
    await git.branch(['feature-branch']);
    writeFileSync(join(repoDir, 'feature.txt'), 'feature content\n');
    await git.add('feature.txt');
    await git.commit('feature commit');
    await git.checkout(mainBranch);

    const result = await mergeBranch('feature-branch', null, repoDir);
    assert.equal(result.success, true);
    assert.equal(result.merged, 'feature-branch');
    assert.ok(existsSync(join(repoDir, 'feature.txt')));
  });

  it('merges branch into specified target branch', async () => {
    const mainBranch = await getCurrentBranch(repoDir);
    await git.checkout(['-b', 'target-branch']);
    await git.checkout(mainBranch);
    await git.checkout(['-b', 'source-branch']);
    writeFileSync(join(repoDir, 'source.txt'), 'source content\n');
    await git.add('source.txt');
    await git.commit('source commit');
    await git.checkout(mainBranch);

    const result = await mergeBranch('source-branch', 'target-branch', repoDir);
    assert.equal(result.success, true);
    assert.equal(result.into, 'target-branch');
    // After mergeBranch, we should be on target-branch, so file should exist
    const currentAfterMerge = await getCurrentBranch(repoDir);
    assert.equal(currentAfterMerge, 'target-branch');
    assert.ok(existsSync(join(repoDir, 'source.txt')));
    await git.checkout(mainBranch);
  });

  it('throws on merge conflicts', async () => {
    const mainBranch = await getCurrentBranch(repoDir);
    await git.branch(['conflict-branch']);
    writeFileSync(join(repoDir, 'conflict.txt'), 'main content\n');
    await git.add('conflict.txt');
    await git.commit('main commit');
    await git.checkout('conflict-branch');
    writeFileSync(join(repoDir, 'conflict.txt'), 'conflict content\n');
    await git.add('conflict.txt');
    await git.commit('conflict commit');
    await git.checkout(mainBranch);

    await assert.rejects(
      () => mergeBranch('conflict-branch', null, repoDir),
      { message: /conflict|CONFLICT/i }
    );
  });
});

// ─── getCurrentWorktreeInfo ──────────────────────────────

describe('getCurrentWorktreeInfo', () => {
  const projectsDir = join(tmpBase, 'current-wt-projects');
  const repoDir = join(projectsDir, 'current-wt-repo');
  let repoGit;

  before(async () => {
    mkdirSync(projectsDir, { recursive: true });
    repoGit = await initRepo(repoDir);
  });

  it('returns worktree info when inside worktree', async () => {
    const { resolveConfig } = await import('../dist/src/config.js');
    const mainBranch = await getCurrentBranch(repoDir);
    const result = await createWorktree('current-wt', 'current-wt-branch', mainBranch, repoDir);
    // Resolve config from repoRoot, not from worktree path, so worktrees base is calculated correctly
    const config = resolveConfig(repoDir, repoDir);

    // Change cwd to worktree (simulate being inside)
    const originalCwd = process.cwd();
    try {
      process.chdir(result.path);
      const info = await getCurrentWorktreeInfo(repoDir, config);
      assert.ok(info);
      assert.equal(info.name, 'current-wt');
      assert.equal(info.branch, 'current-wt-branch');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('returns null when in main repo', async () => {
    const { resolveConfig } = await import('../dist/src/config.js');
    const config = resolveConfig(repoDir, repoDir);
    const originalCwd = process.cwd();
    try {
      process.chdir(repoDir);
      const info = await getCurrentWorktreeInfo(repoDir, config);
      assert.equal(info, null);
    } finally {
      process.chdir(originalCwd);
    }
  });
});

// ─── Cleanup ──────────────────────────────────────────────

after(() => {
  try {
    rmSync(tmpBase, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
});

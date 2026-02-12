import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, realpathSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

const BIN = join(process.cwd(), 'dist', 'bin', 'wt.js');

function run(args, opts = {}) {
  const cmd = `node ${BIN} ${args}`;
  return execSync(cmd, {
    encoding: 'utf-8',
    timeout: 30000,
    env: {
      ...process.env,
      // Disable color output for predictable assertions
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      ...opts.env,
    },
    cwd: opts.cwd || process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  });
}

// Test that bin/wt.js exists and has correct shebang
describe('bin/wt.js', () => {
  it('exists and has correct shebang', () => {
    const binPath = join(process.cwd(), 'dist', 'bin', 'wt.js');
    const content = readFileSync(binPath, 'utf-8');
    assert.ok(content.startsWith('#!/usr/bin/env node'));
  });

  it('imports commander', () => {
    const binPath = join(process.cwd(), 'dist', 'bin', 'wt.js');
    const content = readFileSync(binPath, 'utf-8');
    assert.ok(content.includes('commander'));
  });

  it('imports command functions', () => {
    const binPath = join(process.cwd(), 'dist', 'bin', 'wt.js');
    const content = readFileSync(binPath, 'utf-8');
    assert.ok(content.includes('createWorktreeFlow'));
    assert.ok(content.includes('listWorktrees'));
    assert.ok(content.includes('mainMenu'));
  });
});

describe('CLI shorthand arguments', () => {
  let tmpDir;
  let repoDir;
  let worktreesDir;

  before(() => {
    tmpDir = realpathSync(mkdtempSync(join(tmpdir(), 'wt-cli-test-')));
    repoDir = join(tmpDir, 'test-repo');
    worktreesDir = join(tmpDir, 'worktrees', 'test-repo');

    // Create a git repo with an initial commit
    execSync(`mkdir -p "${repoDir}"`, { cwd: tmpDir });
    execSync('git init', { cwd: repoDir });
    execSync('git config user.email "test@test.com"', { cwd: repoDir });
    execSync('git config user.name "Test"', { cwd: repoDir });
    execSync('touch README.md', { cwd: repoDir });
    execSync('git add .', { cwd: repoDir });
    execSync('git commit -m "initial"', { cwd: repoDir });
    // Ensure we're on main branch
    execSync('git branch -M main', { cwd: repoDir });

    // Write wt config so worktrees go to our temp dir
    execSync(`mkdir -p "${repoDir}/.wt"`, { cwd: tmpDir });
    const config = JSON.stringify({
      projectsDir: tmpDir,
      worktreesDir: join(tmpDir, 'worktrees'),
    });
    execSync(`echo '${config}' > "${repoDir}/.wt/config.json"`, { cwd: tmpDir });
    // Commit config so the repo stays clean (merge checks for uncommitted changes)
    execSync('git add .wt/', { cwd: repoDir });
    execSync('git commit -m "add wt config"', { cwd: repoDir });
  });

  after(() => {
    execSync(`rm -rf "${tmpDir}"`);
  });

  it('wt new <name> --from main creates worktree non-interactively', () => {
    const output = run('new my-feature --from main', { cwd: repoDir });
    assert.ok(output.includes('Worktree created') || output.includes('Created worktree'), `Expected success message, got: ${output}`);
    assert.ok(existsSync(join(worktreesDir, 'my-feature')), 'Worktree directory should exist');
  });

  it('wt new <name> --from main --no-hooks skips hooks', () => {
    const output = run('new no-hooks-test --from main --no-hooks', { cwd: repoDir });
    assert.ok(output.includes('Worktree created') || output.includes('Created worktree'), `Expected success message, got: ${output}`);
    assert.ok(existsSync(join(worktreesDir, 'no-hooks-test')), 'Worktree directory should exist');
    // With --no-hooks, should mention skipping
    if (output.includes('hook')) {
      assert.ok(output.includes('skip') || output.includes('--no-hooks'), 'Should mention skipping hooks');
    }
  });

  it('wt rm <name> --force removes worktree without prompts', () => {
    // Create a worktree to remove
    run('new to-remove --from main', { cwd: repoDir });
    assert.ok(existsSync(join(worktreesDir, 'to-remove')), 'Worktree should exist before removal');

    const output = run('rm to-remove --force', { cwd: repoDir });
    assert.ok(output.includes('removed') || output.includes('Removed'), `Expected removal message, got: ${output}`);
    assert.ok(!existsSync(join(worktreesDir, 'to-remove')), 'Worktree directory should be gone');
  });

  it('wt rm with unknown name shows error', () => {
    try {
      const output = run('rm nonexistent --force', { cwd: repoDir });
      // If it doesn't throw, the output should contain the error
      assert.ok(output.includes('not found') || output.includes('Not found'), `Expected not found message, got: ${output}`);
    } catch (err) {
      // execSync throws on non-zero exit - check both stdout and stderr
      const output = (err.stdout || '') + (err.stderr || '');
      assert.ok(output.includes('not found') || output.includes('Not found') || output.includes('No worktrees'), `Expected not found message, got: ${output}`);
    }
  });

  it('wt list works after creating worktrees', () => {
    const output = run('list', { cwd: repoDir });
    assert.ok(output.includes('my-feature'), 'Should list existing worktree');
  });

  it('wt merge accepts --into and --cleanup flags', () => {
    // Create a worktree with a commit to merge
    run('new merge-test --from main', { cwd: repoDir });
    // Commit any new untracked files (e.g. worktree-colors.json) so repo stays clean
    execSync('git add -A && git diff --cached --quiet || git commit -m "track wt files"', { cwd: repoDir });
    const wtPath = join(worktreesDir, 'merge-test');
    execSync('touch merge-file.txt', { cwd: wtPath });
    execSync('git add .', { cwd: wtPath });
    execSync('git commit -m "merge test commit"', { cwd: wtPath });

    const output = run('merge merge-test --into main --cleanup --no-hooks', { cwd: repoDir });
    assert.ok(output.includes('Merged') || output.includes('merged'), `Expected merge message, got: ${output}`);
    // Cleanup should have removed the worktree
    assert.ok(!existsSync(wtPath), 'Worktree should be cleaned up after merge');
  });
});

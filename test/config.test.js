import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';

const tmpBase = realpathSync(mkdtempSync(join(tmpdir(), 'wt-config-test-')));

const { loadConfig, runHooks, resolveConfig } = await import('../src/config.js');

// ─── Helpers ──────────────────────────────────────────────

function makeRepo(name) {
  const dir = join(tmpBase, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeConfig(repoRoot, config) {
  const configDir = join(repoRoot, '.wt');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'config.json'), JSON.stringify(config));
}

// ─── loadConfig ───────────────────────────────────────────

describe('loadConfig', () => {
  it('returns defaults when no .wt directory exists', () => {
    const dir = makeRepo('no-config');
    const config = loadConfig(dir);
    assert.equal(config.branchPrefix, undefined);
    assert.deepEqual(config.hooks, {});
  });

  it('returns defaults when config.json is missing', () => {
    const dir = makeRepo('empty-wt-dir');
    mkdirSync(join(dir, '.wt'), { recursive: true });
    const config = loadConfig(dir);
    assert.equal(config.branchPrefix, undefined);
    assert.deepEqual(config.hooks, {});
  });

  it('returns defaults when config.json is invalid JSON', () => {
    const dir = makeRepo('bad-json');
    mkdirSync(join(dir, '.wt'), { recursive: true });
    writeFileSync(join(dir, '.wt', 'config.json'), 'not json{{{');
    const config = loadConfig(dir);
    assert.equal(config.branchPrefix, undefined);
    assert.deepEqual(config.hooks, {});
  });

  it('returns defaults when config.json is an array', () => {
    const dir = makeRepo('array-config');
    writeConfig(dir, [1, 2, 3]);
    const config = loadConfig(dir);
    assert.equal(config.branchPrefix, undefined);
    assert.deepEqual(config.hooks, {});
  });

  it('parses branchPrefix', () => {
    const dir = makeRepo('with-prefix');
    writeConfig(dir, { branchPrefix: 'user/' });
    const config = loadConfig(dir);
    assert.equal(config.branchPrefix, 'user/');
  });

  it('parses empty branchPrefix as empty string', () => {
    const dir = makeRepo('empty-prefix');
    writeConfig(dir, { branchPrefix: '' });
    const config = loadConfig(dir);
    assert.equal(config.branchPrefix, '');
  });

  it('ignores non-string branchPrefix', () => {
    const dir = makeRepo('numeric-prefix');
    writeConfig(dir, { branchPrefix: 42 });
    const config = loadConfig(dir);
    assert.equal(config.branchPrefix, undefined);
  });

  it('parses post-create hooks', () => {
    const dir = makeRepo('with-hooks');
    writeConfig(dir, { hooks: { 'post-create': ['npm install', 'echo done'] } });
    const config = loadConfig(dir);
    assert.deepEqual(config.hooks['post-create'], ['npm install', 'echo done']);
  });

  it('ignores hooks that are not arrays of strings', () => {
    const dir = makeRepo('bad-hooks');
    writeConfig(dir, { hooks: { 'post-create': 'npm install' } });
    const config = loadConfig(dir);
    assert.deepEqual(config.hooks, {});
  });

  it('ignores hooks array with non-string elements', () => {
    const dir = makeRepo('mixed-hooks');
    writeConfig(dir, { hooks: { 'post-create': ['npm install', 42] } });
    const config = loadConfig(dir);
    assert.deepEqual(config.hooks, {});
  });

  it('ignores non-object hooks field', () => {
    const dir = makeRepo('string-hooks');
    writeConfig(dir, { hooks: 'npm install' });
    const config = loadConfig(dir);
    assert.deepEqual(config.hooks, {});
  });

  it('handles unknown fields gracefully', () => {
    const dir = makeRepo('extra-fields');
    writeConfig(dir, { branchPrefix: 'x/', unknown: true, hooks: {} });
    const config = loadConfig(dir);
    assert.equal(config.branchPrefix, 'x/');
    assert.deepEqual(config.hooks, {});
  });

  it('parses projectsDir', () => {
    const dir = makeRepo('with-projects-dir');
    writeConfig(dir, { projectsDir: '/custom/projects' });
    const config = loadConfig(dir);
    assert.equal(config.projectsDir, '/custom/projects');
  });

  it('parses worktreesDir', () => {
    const dir = makeRepo('with-worktrees-dir');
    writeConfig(dir, { worktreesDir: '/custom/worktrees' });
    const config = loadConfig(dir);
    assert.equal(config.worktreesDir, '/custom/worktrees');
  });

  it('ignores non-string projectsDir', () => {
    const dir = makeRepo('numeric-projects-dir');
    writeConfig(dir, { projectsDir: 123 });
    const config = loadConfig(dir);
    assert.equal(config.projectsDir, undefined);
  });

  it('ignores non-string worktreesDir', () => {
    const dir = makeRepo('numeric-worktrees-dir');
    writeConfig(dir, { worktreesDir: 123 });
    const config = loadConfig(dir);
    assert.equal(config.worktreesDir, undefined);
  });
});

// ─── resolveConfig ────────────────────────────────────────

describe('resolveConfig', () => {
  it('uses defaults when no configs exist', () => {
    const repoDir = makeRepo('no-config-resolve');
    const config = resolveConfig(repoDir, repoDir);
    assert.equal(config.projectsDir, join(homedir(), 'projects'));
    assert.equal(config.worktreesDir, join(homedir(), 'projects', 'worktrees'));
    assert.equal(config.branchPrefix, '');
    assert.deepEqual(config.hooks, {});
  });

  it('loads repo root config', () => {
    const repoDir = makeRepo('repo-root-config');
    writeConfig(repoDir, { projectsDir: '/repo/projects' });
    const config = resolveConfig(repoDir, repoDir);
    assert.equal(config.projectsDir, '/repo/projects');
  });

  it('loads from subdirectory using nested config', () => {
    const repoDir = makeRepo('nested-config');
    const subDir = join(repoDir, 'subdir');
    mkdirSync(subDir, { recursive: true });

    writeConfig(repoDir, { projectsDir: '/repo/projects' });
    writeConfig(subDir, { branchPrefix: 'feature/' });

    const config = resolveConfig(subDir, repoDir);
    assert.equal(config.projectsDir, '/repo/projects');
    assert.equal(config.branchPrefix, 'feature/');
  });

  it('child directory config overrides parent', () => {
    const repoDir = makeRepo('override-config');
    const subDir = join(repoDir, 'subdir');
    mkdirSync(subDir, { recursive: true });

    writeConfig(repoDir, { branchPrefix: 'parent/' });
    writeConfig(subDir, { branchPrefix: 'child/' });

    const config = resolveConfig(subDir, repoDir);
    assert.equal(config.branchPrefix, 'child/');
  });

  it('handles multiple nested directories', () => {
    const repoDir = makeRepo('deep-nesting');
    const level1 = join(repoDir, 'level1');
    const level2 = join(level1, 'level2');
    mkdirSync(level2, { recursive: true });

    writeConfig(repoDir, { projectsDir: '/base' });
    writeConfig(level1, { worktreesDir: '/level1' });
    writeConfig(level2, { branchPrefix: 'deep/' });

    const config = resolveConfig(level2, repoDir);
    assert.equal(config.projectsDir, '/base');
    assert.equal(config.worktreesDir, '/level1');
    assert.equal(config.branchPrefix, 'deep/');
  });

  it('merges hooks from multiple levels', () => {
    const repoDir = makeRepo('merge-hooks');
    const subDir = join(repoDir, 'subdir');
    mkdirSync(subDir, { recursive: true });

    writeConfig(repoDir, { hooks: { 'post-create': ['echo root'] } });
    writeConfig(subDir, { hooks: { 'post-merge': ['echo subdir'] } });

    const config = resolveConfig(subDir, repoDir);
    assert.deepEqual(config.hooks['post-create'], ['echo root']);
    assert.deepEqual(config.hooks['post-merge'], ['echo subdir']);
  });

  it('child hooks override parent hooks for same hook name', () => {
    const repoDir = makeRepo('override-hooks');
    const subDir = join(repoDir, 'subdir');
    mkdirSync(subDir, { recursive: true });

    writeConfig(repoDir, { hooks: { 'post-create': ['npm install'] } });
    writeConfig(subDir, { hooks: { 'post-create': ['yarn install'] } });

    const config = resolveConfig(subDir, repoDir);
    assert.deepEqual(config.hooks['post-create'], ['yarn install']);
  });

  it('handles custom globalConfigPath for testing', () => {
    const repoDir = makeRepo('custom-global');
    const globalConfigDir = join(tmpBase, 'global-config');
    mkdirSync(globalConfigDir, { recursive: true });
    const globalConfigPath = join(globalConfigDir, 'config.json');
    writeFileSync(globalConfigPath, JSON.stringify({ projectsDir: '/global' }));

    writeConfig(repoDir, { worktreesDir: '/repo' });

    const config = resolveConfig(repoDir, repoDir, globalConfigPath);
    assert.equal(config.projectsDir, '/global');
    assert.equal(config.worktreesDir, '/repo');
  });

  it('stops at repo root and does not walk beyond', () => {
    const parentDir = makeRepo('parent-of-repo');
    const repoDir = join(parentDir, 'repo');
    mkdirSync(repoDir, { recursive: true });

    writeConfig(parentDir, { projectsDir: '/parent' });
    writeConfig(repoDir, { projectsDir: '/repo' });

    const config = resolveConfig(repoDir, repoDir);
    assert.equal(config.projectsDir, '/repo');
  });

  it('handles cwd outside repo root gracefully', () => {
    const repoDir = makeRepo('repo-outside');
    const outsideDir = join(tmpBase, 'outside');
    mkdirSync(outsideDir, { recursive: true });

    writeConfig(repoDir, { projectsDir: '/repo' });

    const config = resolveConfig(outsideDir, repoDir);
    // Should use defaults since cwd is outside repo
    assert.equal(config.projectsDir, join(homedir(), 'projects'));
  });
});

// ─── runHooks ─────────────────────────────────────────────

describe('runHooks', () => {
  let hookDir;

  before(() => {
    hookDir = makeRepo('hook-runner');
  });

  it('returns empty array when no hooks are defined', () => {
    const config = { hooks: {} };
    const results = runHooks('post-create', config, {
      source: '/src',
      path: hookDir,
      branch: 'test',
    });
    assert.deepEqual(results, []);
  });

  it('returns empty array when hook name does not exist', () => {
    const config = { hooks: { 'post-create': ['echo hi'] } };
    const results = runHooks('pre-create', config, {
      source: '/src',
      path: hookDir,
      branch: 'test',
    });
    assert.deepEqual(results, []);
  });

  it('runs commands successfully', () => {
    const config = { hooks: { 'post-create': ['echo hello'] } };
    const results = runHooks('post-create', config, {
      source: '/src',
      path: hookDir,
      branch: 'feat',
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].success, true);
    assert.equal(results[0].command, 'echo hello');
  });

  it('runs multiple commands sequentially', () => {
    const markerFile = join(hookDir, 'hook-test-marker');
    const config = {
      hooks: {
        'post-create': [
          `echo first > "${markerFile}"`,
          `echo second >> "${markerFile}"`,
        ],
      },
    };
    const results = runHooks('post-create', config, {
      source: '/src',
      path: hookDir,
      branch: 'feat',
    });
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.success));
  });

  it('provides WT_SOURCE, WT_BRANCH, WT_PATH env vars', () => {
    const config = {
      hooks: {
        'post-create': [
          'test "$WT_SOURCE" = "/my/source"',
          'test "$WT_BRANCH" = "my-branch"',
          `test "$WT_PATH" = "${hookDir}"`,
        ],
      },
    };
    const results = runHooks('post-create', config, {
      source: '/my/source',
      path: hookDir,
      branch: 'my-branch',
    });
    assert.equal(results.length, 3);
    for (const r of results) {
      assert.equal(r.success, true, `Command failed: ${r.command} — ${r.error || ''}`);
    }
  });

  it('continues after a failing command', () => {
    const config = {
      hooks: {
        'post-create': [
          'false',       // exits with code 1
          'echo after',  // should still run
        ],
      },
    };
    const results = runHooks('post-create', config, {
      source: '/src',
      path: hookDir,
      branch: 'feat',
    });
    assert.equal(results.length, 2);
    assert.equal(results[0].success, false);
    assert.equal(results[1].success, true);
  });

  it('reports error message on failure', () => {
    const config = {
      hooks: {
        'post-create': ['exit 1'],
      },
    };
    const results = runHooks('post-create', config, {
      source: '/src',
      path: hookDir,
      branch: 'feat',
    });
    assert.equal(results[0].success, false);
    assert.ok(results[0].error.length > 0);
  });

  it('runs commands with cwd set to worktree path', () => {
    const config = {
      hooks: {
        'post-create': [`test "$(pwd)" = "${hookDir}"`],
      },
    };
    const results = runHooks('post-create', config, {
      source: '/src',
      path: hookDir,
      branch: 'feat',
    });
    assert.equal(results[0].success, true, `cwd mismatch: ${results[0].error || ''}`);
  });
});

// ─── Cleanup ──────────────────────────────────────────────

after(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

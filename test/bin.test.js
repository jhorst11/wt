import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';

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

// Note: Full integration tests for CLI would require:
// - Spawning child processes
// - Testing command line argument parsing
// - Testing help output
// - Testing version display
// - Testing SIGINT handling
// These are better tested manually or with E2E tests.

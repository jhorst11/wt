import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test that commands module exports all expected functions
describe('commands module exports', () => {
  it('exports all expected command functions', async () => {
    const commands = await import('../dist/src/commands.js');
    assert.ok(typeof commands.mainMenu === 'function');
    assert.ok(typeof commands.createWorktreeFlow === 'function');
    assert.ok(typeof commands.listWorktrees === 'function');
    assert.ok(typeof commands.removeWorktreeFlow === 'function');
    assert.ok(typeof commands.mergeWorktreeFlow === 'function');
    assert.ok(typeof commands.goHome === 'function');
    assert.ok(typeof commands.goToWorktree === 'function');
  });
});

// Note: Full integration tests for commands would require:
// - Mocking @inquirer/prompts (select, input, confirm, search)
// - Mocking git operations
// - Mocking file system operations
// - Testing error handling and user cancellation flows
// These are complex and would require extensive setup.
// The TypeScript port will add type safety which will catch many integration issues.

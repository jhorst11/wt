import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync, readFileSync } from 'fs';

const tmpBase = mkdtempSync(join(tmpdir(), 'wt-ui-test-'));

const {
  icons,
  colors,
  hexToChalk,
  colorIndicator,
  hexToRgb,
  detectTerminal,
  formatBranchChoice,
  formatWorktreeChoice,
} = await import('../dist/src/ui.js');

// ─── Icons and Colors ────────────────────────────────────

describe('icons and colors', () => {
  it('exports icons object with expected keys', () => {
    assert.ok('tree' in icons);
    assert.ok('branch' in icons);
    assert.ok('rocket' in icons);
    assert.ok('check' in icons);
    assert.ok('cross' in icons);
  });

  it('exports colors object with expected keys', () => {
    assert.ok('primary' in colors);
    assert.ok('secondary' in colors);
    assert.ok('success' in colors);
    assert.ok('warning' in colors);
    assert.ok('error' in colors);
    assert.ok('muted' in colors);
  });
});

// ─── hexToChalk ─────────────────────────────────────────

describe('hexToChalk', () => {
  it('converts valid hex with hash', () => {
    const chalkFn = hexToChalk('#E53935');
    assert.ok(typeof chalkFn === 'function');
  });

  it('converts valid hex without hash', () => {
    const chalkFn = hexToChalk('E53935');
    assert.ok(typeof chalkFn === 'function');
  });

  it('returns gray for null', () => {
    const chalkFn = hexToChalk(null);
    assert.ok(typeof chalkFn === 'function');
  });

  it('returns gray for undefined', () => {
    const chalkFn = hexToChalk(undefined);
    assert.ok(typeof chalkFn === 'function');
  });

  it('returns gray for empty string', () => {
    const chalkFn = hexToChalk('');
    assert.ok(typeof chalkFn === 'function');
  });

  it('returns gray for invalid hex', () => {
    const chalkFn = hexToChalk('GGGGGG');
    assert.ok(typeof chalkFn === 'function');
  });

  it('returns gray for short hex', () => {
    const chalkFn = hexToChalk('#E53');
    assert.ok(typeof chalkFn === 'function');
  });
});

// ─── colorIndicator ──────────────────────────────────────

describe('colorIndicator', () => {
  it('returns colored circle for valid hex', () => {
    const indicator = colorIndicator('#E53935');
    assert.ok(indicator.length > 0);
    assert.ok(indicator.includes('●'));
  });

  it('returns empty string for null', () => {
    const indicator = colorIndicator(null);
    assert.equal(indicator, '');
  });

  it('returns empty string for undefined', () => {
    const indicator = colorIndicator(undefined);
    assert.equal(indicator, '');
  });

  it('returns empty string for empty string', () => {
    const indicator = colorIndicator('');
    assert.equal(indicator, '');
  });
});

// ─── hexToRgb ───────────────────────────────────────────

describe('hexToRgb', () => {
  it('converts valid hex with hash to RGB', () => {
    const rgb = hexToRgb('#E53935');
    assert.equal(rgb.r, 0xE5);
    assert.equal(rgb.g, 0x39);
    assert.equal(rgb.b, 0x35);
  });

  it('converts valid hex without hash to RGB', () => {
    const rgb = hexToRgb('E53935');
    assert.equal(rgb.r, 0xE5);
    assert.equal(rgb.g, 0x39);
    assert.equal(rgb.b, 0x35);
  });

  it('converts lowercase hex', () => {
    const rgb = hexToRgb('#e53935');
    assert.equal(rgb.r, 0xE5);
    assert.equal(rgb.g, 0x39);
    assert.equal(rgb.b, 0x35);
  });

  it('handles mixed case hex', () => {
    const rgb = hexToRgb('#E5aB3c');
    assert.equal(rgb.r, 0xE5);
    assert.equal(rgb.g, 0xAB);
    assert.equal(rgb.b, 0x3C);
  });
});

// ─── detectTerminal ─────────────────────────────────────

describe('detectTerminal', () => {
  const originalTermProgram = process.env.TERM_PROGRAM;
  const originalTerm = process.env.TERM;
  const originalColorTerm = process.env.COLORTERM;
  const originalWtSession = process.env.WT_SESSION;

  after(() => {
    if (originalTermProgram !== undefined) process.env.TERM_PROGRAM = originalTermProgram;
    else delete process.env.TERM_PROGRAM;
    if (originalTerm !== undefined) process.env.TERM = originalTerm;
    else delete process.env.TERM;
    if (originalColorTerm !== undefined) process.env.COLORTERM = originalColorTerm;
    else delete process.env.COLORTERM;
    if (originalWtSession !== undefined) process.env.WT_SESSION = originalWtSession;
    else delete process.env.WT_SESSION;
  });

  it('detects iTerm2', () => {
    process.env.TERM_PROGRAM = 'iTerm.app';
    assert.equal(detectTerminal(), 'iterm2');
  });

  it('detects WezTerm', () => {
    delete process.env.TERM_PROGRAM;
    process.env.TERM_PROGRAM = 'WezTerm';
    assert.equal(detectTerminal(), 'wezterm');
  });

  it('detects ghostty', () => {
    delete process.env.TERM_PROGRAM;
    process.env.TERM_PROGRAM = 'ghostty';
    assert.equal(detectTerminal(), 'ghostty');
  });

  it('detects vscode', () => {
    delete process.env.TERM_PROGRAM;
    process.env.TERM_PROGRAM = 'vscode';
    assert.equal(detectTerminal(), 'vscode');
  });

  it('detects Windows Terminal', () => {
    delete process.env.TERM_PROGRAM;
    delete process.env.TERM;
    process.env.WT_SESSION = 'some-session-id';
    assert.equal(detectTerminal(), 'windows-terminal');
  });

  it('detects kitty from TERM', () => {
    delete process.env.TERM_PROGRAM;
    delete process.env.WT_SESSION;
    process.env.TERM = 'xterm-kitty';
    assert.equal(detectTerminal(), 'kitty');
  });

  it('detects Alacritty from TERM_PROGRAM', () => {
    delete process.env.TERM;
    process.env.TERM_PROGRAM = 'Alacritty.app';
    assert.equal(detectTerminal(), 'alacritty');
  });

  it('detects Alacritty from TERM', () => {
    delete process.env.TERM_PROGRAM;
    process.env.TERM = 'alacritty';
    assert.equal(detectTerminal(), 'alacritty');
  });

  it('detects osc-generic from COLORTERM truecolor', () => {
    delete process.env.TERM_PROGRAM;
    delete process.env.TERM;
    delete process.env.WT_SESSION;
    process.env.COLORTERM = 'truecolor';
    assert.equal(detectTerminal(), 'osc-generic');
  });

  it('detects osc-generic from COLORTERM 24bit', () => {
    process.env.COLORTERM = '24bit';
    assert.equal(detectTerminal(), 'osc-generic');
  });

  it('returns unsupported when no terminal indicators', () => {
    delete process.env.TERM_PROGRAM;
    delete process.env.TERM;
    delete process.env.COLORTERM;
    delete process.env.WT_SESSION;
    assert.equal(detectTerminal(), 'unsupported');
  });
});

// ─── formatBranchChoice ──────────────────────────────────

describe('formatBranchChoice', () => {
  it('formats local branch', () => {
    const formatted = formatBranchChoice('feature-a', 'local');
    assert.ok(formatted.includes('feature-a'));
    assert.ok(formatted.includes('💻'));
  });

  it('formats remote branch', () => {
    const formatted = formatBranchChoice('feature-a', 'remote');
    assert.ok(formatted.includes('feature-a'));
    assert.ok(formatted.includes('☁️'));
    assert.ok(formatted.includes('remote'));
  });

  it('defaults to local when type not specified', () => {
    const formatted = formatBranchChoice('feature-a');
    assert.ok(formatted.includes('feature-a'));
    assert.ok(formatted.includes('💻'));
  });
});

// ─── formatWorktreeChoice ────────────────────────────────

describe('formatWorktreeChoice', () => {
  it('formats worktree without color', () => {
    const wt = { name: 'feature-a', branch: 'feature-a-branch' };
    const formatted = formatWorktreeChoice(wt);
    assert.ok(formatted.includes('feature-a'));
    assert.ok(formatted.includes('feature-a-branch'));
    assert.ok(formatted.includes('📁'));
  });

  it('formats worktree with color', () => {
    const wt = { name: 'feature-a', branch: 'feature-a-branch' };
    const formatted = formatWorktreeChoice(wt, '#E53935');
    assert.ok(formatted.includes('feature-a'));
    assert.ok(formatted.includes('feature-a-branch'));
    assert.ok(formatted.includes('●'));
  });

  it('handles null color', () => {
    const wt = { name: 'feature-a', branch: 'feature-a-branch' };
    const formatted = formatWorktreeChoice(wt, null);
    assert.ok(formatted.includes('feature-a'));
  });
});

// ─── Cleanup ──────────────────────────────────────────────

after(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

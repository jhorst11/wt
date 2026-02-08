import chalk from 'chalk';
import gradient from 'gradient-string';
import figures from 'figures';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

// Custom gradient for the logo
const wtGradient = gradient(['#00d4ff', '#7c3aed', '#f472b6']);
const successGradient = gradient(['#10b981', '#34d399']);
const warningGradient = gradient(['#f59e0b', '#fbbf24']);

export const icons = {
  tree: '🌳',
  branch: '🌿',
  rocket: '🚀',
  sparkles: '✨',
  folder: '📁',
  trash: '🗑️',
  home: '🏠',
  check: figures.tick,
  cross: figures.cross,
  pointer: figures.pointer,
  arrowRight: figures.arrowRight,
  bullet: figures.bullet,
  star: '⭐',
  git: '󰊢',
  plus: '➕',
  warning: '⚠️',
  info: 'ℹ️',
  remote: '☁️',
  local: '💻',
};

export const colors = {
  primary: chalk.hex('#7c3aed'),
  secondary: chalk.hex('#00d4ff'),
  success: chalk.hex('#10b981'),
  warning: chalk.hex('#f59e0b'),
  error: chalk.hex('#ef4444'),
  muted: chalk.gray,
  highlight: chalk.hex('#f472b6'),
  branch: chalk.hex('#34d399'),
  path: chalk.hex('#60a5fa'),
};

export function showLogo() {
  const logo = `
  ${wtGradient('╦ ╦╔═╗╦═╗╦╔═╔╦╗╦═╗╔═╗╔═╗')}
  ${wtGradient('║║║║ ║╠╦╝╠╩╗ ║ ╠╦╝║╣ ║╣ ')}
  ${wtGradient('╚╩╝╚═╝╩╚═╩ ╩ ╩ ╩╚═╚═╝╚═╝')}
  ${chalk.gray('       Git Worktree Manager')}
`;
  console.log(logo);
}

export function showMiniLogo(worktreeInfo = null) {
  console.log(`\n  ${icons.tree} ${wtGradient('worktree')} ${colors.muted(`v${version}`)}`);
  if (worktreeInfo) {
    const colorDot = colorIndicator(worktreeInfo.color);
    console.log(`  ${colorDot} ${colors.highlight(worktreeInfo.name)} ${colors.muted(`→ ${worktreeInfo.branch}`)}`);
  }
  console.log('');
}

export function success(message) {
  console.log(`  ${colors.success(icons.check)} ${message}`);
}

export function error(message) {
  console.log(`  ${colors.error(icons.cross)} ${message}`);
}

export function warning(message) {
  console.log(`  ${colors.warning(icons.warning)} ${message}`);
}

export function info(message) {
  console.log(`  ${colors.secondary(icons.info)} ${message}`);
}

export function heading(text) {
  console.log(`\n  ${colors.primary.bold(text)}\n`);
}

export function subheading(text) {
  console.log(`  ${colors.muted(text)}`);
}

export function listItem(text, indent = 2) {
  const spaces = ' '.repeat(indent);
  console.log(`${spaces}${colors.secondary(icons.bullet)} ${text}`);
}

export function branchItem(name, isCurrent = false, isRemote = false) {
  const icon = isRemote ? icons.remote : icons.local;
  const prefix = isCurrent ? colors.success(icons.pointer) : ' ';
  const branchName = isCurrent ? colors.success.bold(name) : colors.branch(name);
  const typeLabel = isRemote ? colors.muted(' (remote)') : '';
  console.log(`  ${prefix} ${icon} ${branchName}${typeLabel}`);
}

export function worktreeItem(name, path, isCurrent = false, color = null) {
  const prefix = isCurrent ? colors.success(icons.pointer) : ' ';
  const nameDisplay = isCurrent ? colors.success.bold(name) : colors.highlight(name);
  const colorDot = colorIndicator(color);
  const displayName = colorDot ? `${colorDot} ${nameDisplay}` : nameDisplay;
  console.log(`  ${prefix} ${icons.folder} ${displayName}`);
  console.log(`      ${colors.muted(path)}`);
}

export function divider() {
  console.log(colors.muted('  ─'.repeat(20)));
}

export function spacer() {
  console.log('');
}

/**
 * Convert hex color to chalk color function.
 * Falls back to gray for invalid hex.
 * @param {string} hex - Hex color like "#E53935" or "E53935"
 * @returns {Function} Chalk color function
 */
export function hexToChalk(hex) {
  if (!hex) return chalk.gray;
  const clean = hex.replace(/^#/, '');
  if (!/^[0-9A-Fa-f]{6}$/.test(clean)) return chalk.gray;
  return chalk.hex(clean);
}

/**
 * Create a colored circle indicator (●) for visual color display.
 * Returns empty string if hex is null/invalid.
 * @param {string} hex - Hex color like "#E53935"
 * @returns {string} Colored circle character or empty string
 */
export function colorIndicator(hex) {
  if (!hex) return '';
  const color = hexToChalk(hex);
  return color('●'); // U+25CF filled circle
}

/**
 * Convert hex to RGB components for terminal sequences.
 * @param {string} hex - Hex color like "#E53935"
 * @returns {{r: number, g: number, b: number}} RGB components 0-255
 */
export function hexToRgb(hex) {
  const clean = hex.replace(/^#/, '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

/**
 * Create a colored divider using the specified hex color.
 * Falls back to muted color if hex is invalid.
 * @param {string} hex - Hex color like "#E53935"
 */
export function coloredDivider(hex) {
  const color = hex ? hexToChalk(hex) : colors.muted;
  console.log(color('  ─'.repeat(20)));
}

/**
 * Detect terminal type for appropriate color sequences.
 * Checks TERM_PROGRAM, TERM, WT_SESSION, and COLORTERM env vars.
 * @returns {string} Terminal type: 'iterm2' | 'wezterm' | 'alacritty' |
 *                   'kitty' | 'ghostty' | 'windows-terminal' | 'vscode' |
 *                   'osc-generic' | 'unsupported'
 */
export function detectTerminal() {
  const termProgram = process.env.TERM_PROGRAM || '';
  const term = process.env.TERM || '';
  const colorTerm = process.env.COLORTERM || '';

  if (termProgram === 'iTerm.app') return 'iterm2';
  if (termProgram === 'WezTerm') return 'wezterm';
  if (termProgram === 'ghostty') return 'ghostty';
  if (termProgram === 'vscode') return 'vscode';
  if (process.env.WT_SESSION) return 'windows-terminal';
  if (term.includes('kitty')) return 'kitty';
  if (termProgram.includes('Alacritty') || term.includes('alacritty')) return 'alacritty';

  // Generic OSC support for truecolor terminals
  if (colorTerm === 'truecolor' || colorTerm === '24bit') return 'osc-generic';

  return 'unsupported';
}

/**
 * Set terminal tab color (supports multiple terminal types).
 * Works with iTerm2, WezTerm, Kitty, Alacritty, Windows Terminal.
 * No-op if stdout is not a TTY or terminal is unsupported.
 * @param {string} hex - Hex color like "#E53935" or "E53935"
 */
export function setTabColor(hex) {
  if (!process.stdout.isTTY || !hex) return;

  const terminal = detectTerminal();
  const rgb = hex.replace(/^#/, '');

  if (!/^[0-9A-Fa-f]{6}$/.test(rgb)) return;

  switch (terminal) {
    case 'iterm2':
    case 'osc-generic':
      process.stdout.write(`\x1b]1337;SetColors=tab=${rgb}\x07`);
      break;
    case 'wezterm':
      // WezTerm uses base64-encoded user vars
      const b64 = Buffer.from(rgb).toString('base64');
      process.stdout.write(`\x1b]1337;SetUserVar=tab_color=${b64}\x07`);
      break;
    case 'kitty':
      process.stdout.write(`\x1b]30001;rgb:${rgb}\x07`);
      break;
    case 'alacritty':
      // Background color as fallback
      const r = rgb.slice(0, 2);
      const g = rgb.slice(2, 4);
      const b = rgb.slice(4, 6);
      process.stdout.write(`\x1b]10;rgb:${r}/${g}/${b}\x07`);
      break;
    case 'windows-terminal':
      process.stdout.write(`\x1b]9;4;1;${rgb}\x07`);
      break;
    // 'ghostty', 'vscode' and 'unsupported' - no-op
  }
}

/**
 * Reset terminal tab color to default.
 * Gracefully handles multiple terminal types.
 */
export function resetTabColor() {
  if (!process.stdout.isTTY) return;

  const terminal = detectTerminal();

  switch (terminal) {
    case 'iterm2':
    case 'osc-generic':
      process.stdout.write('\x1b]1337;SetColors=tab=default\x07');
      break;
    case 'wezterm':
      const b64 = Buffer.from('').toString('base64');
      process.stdout.write(`\x1b]1337;SetUserVar=tab_color=${b64}\x07`);
      break;
    case 'kitty':
      process.stdout.write('\x1b]30001;rgb:000000\x07');
      break;
    case 'alacritty':
      process.stdout.write('\x1b]10;rgb:00/00/00\x07');
      break;
    case 'windows-terminal':
      process.stdout.write('\x1b]9;4;0\x07');
      break;
  }
}

export function formatBranchChoice(branch, type = 'local') {
  const icon = type === 'remote' ? icons.remote : icons.local;
  const typeLabel = type === 'remote' ? chalk.dim(' (remote)') : '';
  return `${icon}  ${branch}${typeLabel}`;
}

export function formatWorktreeChoice(wt, color = null) {
  const colorDot = colorIndicator(color);
  const prefix = colorDot ? `${colorDot} ` : '';
  return `${prefix}${icons.folder}  ${colors.highlight(wt.name)} ${colors.muted(`→ ${wt.branch}`)}`;
}

export function showHelp() {
  showLogo();

  console.log(colors.primary.bold('  Commands:\n'));

  const commands = [
    ['wt', 'Interactive menu to manage worktrees'],
    ['wt new', 'Create a new worktree interactively'],
    ['wt list|ls', 'List all worktrees for current repo'],
    ['wt go [name]', 'Jump to a worktree (interactive if no name)'],
    ['wt merge', 'Merge a worktree branch into another branch'],
    ['wt remove|rm', 'Remove a worktree interactively'],
    ['wt home', 'Jump back to the main repository'],
    ['wt setup', 'Configure shell integration for auto-navigation'],
  ];

  commands.forEach(([cmd, desc]) => {
    console.log(`  ${colors.secondary(cmd.padEnd(18))} ${colors.muted(desc)}`);
  });

  spacer();
  console.log(colors.muted('  Run any command without arguments for interactive mode'));
  spacer();
}

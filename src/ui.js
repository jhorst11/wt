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

export function showMiniLogo() {
  console.log(`\n  ${icons.tree} ${wtGradient('worktree')} ${colors.muted(`v${version}`)}\n`);
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

export function worktreeItem(name, path, isCurrent = false) {
  const prefix = isCurrent ? colors.success(icons.pointer) : ' ';
  const nameDisplay = isCurrent ? colors.success.bold(name) : colors.highlight(name);
  console.log(`  ${prefix} ${icons.folder} ${nameDisplay}`);
  console.log(`      ${colors.muted(path)}`);
}

export function divider() {
  console.log(colors.muted('  ─'.repeat(20)));
}

export function spacer() {
  console.log('');
}

export function formatBranchChoice(branch, type = 'local') {
  const icon = type === 'remote' ? icons.remote : icons.local;
  const typeLabel = type === 'remote' ? chalk.dim(' (remote)') : '';
  return `${icon}  ${branch}${typeLabel}`;
}

export function formatWorktreeChoice(wt) {
  return `${icons.folder}  ${colors.highlight(wt.name)} ${colors.muted(`→ ${wt.branch}`)}`;
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

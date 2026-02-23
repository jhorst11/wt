#!/usr/bin/env node

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { program } from 'commander';
import {
  mainMenu,
  createWorktreeFlow,
  listWorktrees,
  removeWorktreeFlow,
  mergeWorktreeFlow,
  goHome,
  goToWorktree,
} from '../src/commands/index.js';
import { showHelp, showLogo, spacer, colors } from '../src/ui.js';
import { setupCommand } from '../src/setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
// Resolve package.json relative to project root (one level up from bin/)
const packagePath = join(__dirname, '..', '..', 'package.json');
const { version } = require(packagePath) as { version: string };

program
  .name('wt')
  .description('🌳 Beautiful interactive git worktree manager')
  .version(version)
  .option('--verbose', 'Show full hook command output (default: show command name with spinner only)');

program
  .command('new [name...]', { isDefault: false })
  .description('Create a new worktree (from current branch if name provided, interactive otherwise). Can create multiple worktrees: wt new one two three')
  .option('--open', 'Open the new worktree in a new terminal window')
  .option('--tab', 'Open the new worktree in a new terminal tab')
  .action((names?: string[], options?: { open?: boolean; tab?: boolean }) => {
    const open = options?.open;
    const tab = options?.tab;
    const verbose = program.opts().verbose;
    const nameArg = names?.length ? (names.length === 1 ? names[0] : names) : undefined;
    // Determine open mode: 'tab' takes precedence over 'window'
    const openMode = tab ? 'tab' : (open ? 'window' : false);
    createWorktreeFlow({ verbose: !!verbose }, nameArg, openMode);
  });

program
  .command('list')
  .alias('ls')
  .description('List all worktrees for the current repo')
  .action(listWorktrees);

program
  .command('remove [name]')
  .alias('rm')
  .description('Remove a worktree (interactive if no name)')
  .option('--all', 'Remove all worktrees')
  .action((name?: string, options?: { all?: boolean }) => {
    const all = options?.all ?? false;
    const verbose = program.opts().verbose;
    removeWorktreeFlow({ verbose: !!verbose }, name, all);
  });

program
  .command('merge [name]')
  .description('Merge a worktree branch back to main (interactive if no name)')
  .action((name?: string, cmd?: { parent?: { opts?: () => { verbose?: boolean } } }) => {
    mergeWorktreeFlow({ verbose: !!cmd?.parent?.opts?.()?.verbose }, name);
  });

program
  .command('home')
  .description('Return to the main repository')
  .action(goHome);

program
  .command('go [name]')
  .alias('jump')
  .description('Jump to a worktree (interactive if no name)')
  .action((name?: string) => {
    goToWorktree(name);
  });

program
  .command('setup')
  .description('Configure shell integration for directory jumping')
  .action(setupCommand);

// Default action (no command = interactive menu)
program.action(async () => {
  await mainMenu();
});

// Custom help
program.on('--help', () => {
  spacer();
  console.log('Examples:');
  console.log(`  ${colors.muted('$')} wt              ${colors.muted('# Interactive menu')}`);
  console.log(`  ${colors.muted('$')} wt new one      ${colors.muted('# Create worktree "one" from current branch')}`);
  console.log(`  ${colors.muted('$')} wt new one two three ${colors.muted('# Create multiple worktrees in parallel')}`);
  console.log(`  ${colors.muted('$')} wt new one --open ${colors.muted('# Create worktree and open in new terminal window')}`);
  console.log(`  ${colors.muted('$')} wt new one --tab ${colors.muted('# Create worktree and open in new terminal tab')}`);
  console.log(`  ${colors.muted('$')} wt new one two three --open ${colors.muted('# Create multiple worktrees and open each in new terminal')}`);
  console.log(`  ${colors.muted('$')} wt list         ${colors.muted('# List all worktrees')}`);
  console.log(`  ${colors.muted('$')} wt go feature-x ${colors.muted('# Jump to worktree')}`);
  console.log(`  ${colors.muted('$')} wt rm feature-x ${colors.muted('# Remove worktree')}`);
  console.log(`  ${colors.muted('$')} wt rm --all ${colors.muted('# Remove all worktrees')}`);
  console.log(`  ${colors.muted('$')} wt merge feature-x ${colors.muted('# Merge worktree to main')}`);
  console.log(`  ${colors.muted('$')} wt home         ${colors.muted('# Return to main repo')}`);
  console.log(`  ${colors.muted('$')} wt setup        ${colors.muted('# Configure shell integration')}`);
  spacer();
});

// Handle graceful exit
process.on('SIGINT', () => {
  console.log('\n');
  process.exit(0);
});

program.parse();

#!/usr/bin/env node

import { createRequire } from 'module';
import { program } from 'commander';
import {
  mainMenu,
  createWorktreeFlow,
  listWorktrees,
  removeWorktreeFlow,
  mergeWorktreeFlow,
  goHome,
  goToWorktree,
} from '../src/commands.js';
import { showHelp, showLogo, spacer, colors } from '../src/ui.js';
import { setupCommand } from '../src/setup.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

program
  .name('wt')
  .description('🌳 Beautiful interactive git worktree manager')
  .version(version)
  .option('--verbose', 'Show full hook command output (default: show command name with spinner only)');

program
  .command('new', { isDefault: false })
  .description('Create a new worktree interactively')
  .option('--no-hooks', 'Skip post-create hooks')
  .action((args, cmd) => createWorktreeFlow({ verbose: !!cmd.parent?.opts?.()?.verbose, hooks: args.hooks }));

program
  .command('list')
  .alias('ls')
  .description('List all worktrees for the current repo')
  .action(listWorktrees);

program
  .command('remove')
  .alias('rm')
  .description('Remove a worktree interactively')
  .action((_args, cmd) => removeWorktreeFlow({ verbose: !!cmd.parent?.opts?.()?.verbose }));

program
  .command('merge')
  .description('Merge a worktree branch back to main')
  .action((_args, cmd) => mergeWorktreeFlow({ verbose: !!cmd.parent?.opts?.()?.verbose }));

program
  .command('home')
  .description('Return to the main repository')
  .action(goHome);

program
  .command('go [name]')
  .alias('jump')
  .description('Jump to a worktree (interactive if no name)')
  .action(goToWorktree);

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
  console.log(`  ${colors.muted('$')} wt new          ${colors.muted('# Create new worktree')}`);
  console.log(`  ${colors.muted('$')} wt list         ${colors.muted('# List all worktrees')}`);
  console.log(`  ${colors.muted('$')} wt go feature-x ${colors.muted('# Jump to worktree')}`);
  console.log(`  ${colors.muted('$')} wt merge        ${colors.muted('# Merge worktree to main')}`);
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

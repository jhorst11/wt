#!/usr/bin/env node

import { program } from 'commander';
import {
  mainMenu,
  createWorktreeFlow,
  listWorktrees,
  removeWorktreeFlow,
  goHome,
  goToWorktree,
} from '../src/commands.js';
import { showHelp, showLogo, spacer, colors } from '../src/ui.js';

program
  .name('wt')
  .description('🌳 Beautiful interactive git worktree manager')
  .version('1.0.0');

program
  .command('new', { isDefault: false })
  .description('Create a new worktree interactively')
  .action(createWorktreeFlow);

program
  .command('list')
  .alias('ls')
  .description('List all worktrees for the current repo')
  .action(listWorktrees);

program
  .command('remove')
  .alias('rm')
  .description('Remove a worktree interactively')
  .action(removeWorktreeFlow);

program
  .command('home')
  .description('Return to the main repository')
  .action(goHome);

program
  .command('go [name]')
  .description('Jump to a worktree (interactive if no name)')
  .action(goToWorktree);

// Default action (no command = interactive menu)
program.action(async () => {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    await mainMenu();
  }
});

// Custom help
program.on('--help', () => {
  spacer();
  console.log('Examples:');
  console.log(`  ${colors.muted('$')} wt              ${colors.muted('# Interactive menu')}`);
  console.log(`  ${colors.muted('$')} wt new          ${colors.muted('# Create new worktree')}`);
  console.log(`  ${colors.muted('$')} wt list         ${colors.muted('# List all worktrees')}`);
  console.log(`  ${colors.muted('$')} wt go feature-x ${colors.muted('# Jump to worktree')}`);
  console.log(`  ${colors.muted('$')} wt home         ${colors.muted('# Return to main repo')}`);
  spacer();
});

// Handle graceful exit
process.on('SIGINT', () => {
  console.log('\n');
  process.exit(0);
});

program.parse();

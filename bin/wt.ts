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
} from '../src/commands.js';
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
  .command('new', { isDefault: false })
  .argument('[name]', 'Worktree name (skip name prompt)')
  .description('Create a new worktree')
  .option('--from <branch>', 'Base branch (skip source selection)')
  .option('--no-hooks', 'Skip post-create hooks')
  .action((name: string | undefined, args: { hooks?: boolean; from?: string }, cmd: { parent?: { opts?: () => { verbose?: boolean } } }) => {
    createWorktreeFlow({ verbose: !!cmd.parent?.opts?.()?.verbose, hooks: args.hooks, name, from: args.from });
  });

program
  .command('list')
  .alias('ls')
  .description('List all worktrees for the current repo')
  .action(listWorktrees);

program
  .command('remove')
  .alias('rm')
  .argument('[name]', 'Worktree name to remove')
  .description('Remove a worktree')
  .option('--force', 'Skip confirmation and force-remove dirty worktrees')
  .option('--no-hooks', 'Skip pre-destroy hooks')
  .action((name: string | undefined, args: { force?: boolean; hooks?: boolean }, cmd: { parent?: { opts?: () => { verbose?: boolean } } }) => {
    removeWorktreeFlow({ verbose: !!cmd.parent?.opts?.()?.verbose, name, force: args.force, hooks: args.hooks });
  });

program
  .command('merge')
  .argument('[name]', 'Worktree name to merge')
  .description('Merge a worktree branch back to main')
  .option('--into <branch>', 'Target branch to merge into')
  .option('--cleanup', 'Auto-remove worktree after merge')
  .option('--no-hooks', 'Skip pre-destroy hooks during cleanup')
  .action((name: string | undefined, args: { into?: string; cleanup?: boolean; hooks?: boolean }, cmd: { parent?: { opts?: () => { verbose?: boolean } } }) => {
    mergeWorktreeFlow({ verbose: !!cmd.parent?.opts?.()?.verbose, name, into: args.into, cleanup: args.cleanup, hooks: args.hooks });
  });

program
  .command('home')
  .description('Return to the main repository')
  .option('--delete', 'Delete the current worktree after returning home')
  .option('--no-hooks', 'Skip pre-destroy hooks when using --delete')
  .action((args: { delete?: boolean; hooks?: boolean }, cmd: { parent?: { opts?: () => { verbose?: boolean } } }) => {
    goHome({ delete: args.delete, hooks: args.hooks, verbose: !!cmd.parent?.opts?.()?.verbose });
  });

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
  console.log(`  ${colors.muted('$')} wt                                ${colors.muted('# Interactive menu')}`);
  console.log(`  ${colors.muted('$')} wt new                            ${colors.muted('# Create new worktree (interactive)')}`);
  console.log(`  ${colors.muted('$')} wt new my-feature --from main     ${colors.muted('# Create worktree (non-interactive)')}`);
  console.log(`  ${colors.muted('$')} wt list                           ${colors.muted('# List all worktrees')}`);
  console.log(`  ${colors.muted('$')} wt go feature-x                   ${colors.muted('# Jump to worktree')}`);
  console.log(`  ${colors.muted('$')} wt merge my-wt --into main        ${colors.muted('# Merge worktree to branch')}`);
  console.log(`  ${colors.muted('$')} wt rm my-wt --force               ${colors.muted('# Remove worktree without prompts')}`);
  console.log(`  ${colors.muted('$')} wt home                           ${colors.muted('# Return to main repo')}`);
  console.log(`  ${colors.muted('$')} wt home --delete                  ${colors.muted('# Go home and delete current worktree')}`);
  console.log(`  ${colors.muted('$')} wt setup                          ${colors.muted('# Configure shell integration')}`);
  spacer();
});

// Handle graceful exit
process.on('SIGINT', () => {
  console.log('\n');
  process.exit(0);
});

program.parse();

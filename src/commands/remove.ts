import { select, confirm, checkbox } from '@inquirer/prompts';
import ora from 'ora';
import { ensureGitRepo, handlePromptError } from './utils.js';
import { getRepoRoot, getWorktreesInBase, removeWorktree, getCurrentWorktreeInfo, getMainRepoPath } from '../git.js';
import { resolveConfig, runHooks, getWorktreeColor, removeWorktreeColor } from '../config.js';
import { showMiniLogo, heading, success, error, warning, info, spacer, colors, icons, formatWorktreeChoice, colorIndicator, listItem } from '../ui.js';
import type { CommandOptions } from '../types.js';

async function removeSingleWorktree(
  selected: { name: string; path: string; branch: string },
  repoRoot: string,
  config: ReturnType<typeof resolveConfig>,
  currentPath: string,
  options: CommandOptions,
  skipConfirmation: boolean = false,
  wasNamedDirectly: boolean = false
): Promise<boolean> {
  // Warn if user is inside the worktree they're removing
  const isInsideSelected = currentPath === selected.path || currentPath.startsWith(selected.path + '/');
  if (isInsideSelected) {
    spacer();
    warning('You are currently inside this worktree!');
    info(`You will need to ${colors.primary('cd')} out after removal.`);
  }

  spacer();
  const selectedColor = getWorktreeColor(repoRoot, selected.name);
  const colorDot = colorIndicator(selectedColor);
  warning(`${colorDot} This will remove: ${colors.path(selected.path)}`);
  const preDestroyHooks = config.hooks?.['pre-destroy'];
  if (preDestroyHooks?.length) {
    info(`Hooks:    ${colors.muted(`pre-destroy (${preDestroyHooks.length} command${preDestroyHooks.length === 1 ? '' : 's'}) will run first`)}`);
  }
  spacer();

  // Skip confirmation if:
  // 1. Explicitly requested (for bulk operations after initial confirmation)
  // 2. Named directly AND user is not inside the worktree (preserve original behavior)
  let confirmed = true;
  if (!skipConfirmation && (!wasNamedDirectly || isInsideSelected)) {
    confirmed = await confirm({
      message: `Are you sure you want to remove "${selected.name}"?`,
      default: false,
      theme: { prefix: icons.warning },
    });

    if (!confirmed) {
      return false;
    }
  }

  // Run pre-destroy hooks
  const preDestroyCommands = config.hooks?.['pre-destroy'];
  if (preDestroyCommands && preDestroyCommands.length > 0) {
    spacer();
    const hookSpinner = ora({
      text: 'Running pre-destroy hooks...',
      color: 'magenta',
    }).start();

    const hookResults = await runHooks(
      'pre-destroy',
      config,
      { source: repoRoot, path: selected.path, branch: selected.branch, name: selected.name, color: getWorktreeColor(repoRoot, selected.name) },
      {
        verbose: options.verbose,
        onCommandStart: (cmd: string, i: number, total: number) => {
          hookSpinner.text = total > 1
            ? `Running pre-destroy hooks... (${i}/${total}: ${cmd})`
            : `Running pre-destroy hooks... (${cmd})`;
        },
      }
    );

    const failed = hookResults.filter((r) => !r.success);
    if (failed.length === 0) {
      hookSpinner.succeed(colors.success(`Ran ${hookResults.length} pre-destroy hook${hookResults.length === 1 ? '' : 's'}`));
    } else {
      hookSpinner.warn(colors.warning(`${failed.length} of ${hookResults.length} hook${hookResults.length === 1 ? '' : 's'} failed`));
      for (const f of failed) {
        warning(`Hook failed: ${colors.muted(f.command)}`);
        if (f.error) info(colors.muted(f.error));
      }
    }
    spacer();
  }

  const spinner = ora({
    text: 'Removing worktree...',
    color: 'yellow',
  }).start();

  try {
    // First try normal remove, then force if needed
    try {
      await removeWorktree(selected.path, false);
    } catch {
      // Stop spinner before showing interactive prompt
      spinner.stop();

      warning('Worktree has uncommitted or untracked changes.');
      const forceRemove = await confirm({
        message: 'Force remove anyway? (changes will be lost)',
        default: false,
        theme: { prefix: icons.warning },
      });

      if (forceRemove) {
        spinner.start('Force removing worktree...');
        await removeWorktree(selected.path, true);
      } else {
        info('Aborted. Commit or stash your changes first.');
        return false;
      }
    }

    spinner.succeed(colors.success('Worktree removed!'));
    spacer();
    const removedColor = getWorktreeColor(repoRoot, selected.name);
    const removedColorDot = colorIndicator(removedColor);
    removeWorktreeColor(repoRoot, selected.name);
    success(`${removedColorDot} Removed ${colors.highlight(selected.name)}`);

    if (isInsideSelected) {
      spacer();
      const mainPath = await getMainRepoPath();
      if (mainPath) {
        info(`Run ${colors.primary('wt home')} or ${colors.primary(`cd "${mainPath}"`)} to return to the main repo.`);
      }
    }

    spacer();
    return true;
  } catch (err) {
    spinner.fail(colors.error('Failed to remove worktree'));
    const errorMessage = err instanceof Error ? err.message : String(err);
    error(errorMessage);
    return false;
  }
}

export async function removeWorktreeFlow(options: CommandOptions = {}, name?: string, all: boolean = false): Promise<void> {
  await ensureGitRepo();
  const repoRoot = await getRepoRoot();
  if (!repoRoot) {
    error('Not in a git repository');
    return;
  }
  const config = resolveConfig(process.cwd(), repoRoot);
  const currentWt = await getCurrentWorktreeInfo(repoRoot, config);
  const wtColor = currentWt ? getWorktreeColor(repoRoot, currentWt.name) : null;
  showMiniLogo(currentWt ? { ...currentWt, color: wtColor } : null);

  heading(`${icons.trash} Remove Worktree`);

  const worktrees = await getWorktreesInBase(repoRoot, config);
  const currentPath = process.cwd();

  if (worktrees.length === 0) {
    info('No worktrees found to remove');
    spacer();
    console.log(`  ${colors.muted('Create one with')} ${colors.primary('wt new')}`);
    spacer();
    return;
  }

  let selected: Array<{ name: string; path: string; branch: string }> = [];

  if (all) {
    // Select all worktrees
    selected = worktrees;
  } else if (name) {
    // Direct remove by name - also try partial/fuzzy match
    const found = worktrees.find((wt) => wt.name === name) || null;
    if (!found) {
      // Try partial match
      const partialMatches = worktrees.filter((wt) => wt.name.includes(name));
      if (partialMatches.length === 1) {
        selected = [partialMatches[0]];
      } else {
        error(`Worktree "${name}" not found`);
        spacer();
        if (partialMatches.length > 1) {
          info('Did you mean one of these?');
          partialMatches.forEach((wt) => listItem(`${wt.name} ${colors.muted(`→ ${wt.branch}`)}`));
        } else {
          info('Available worktrees:');
          worktrees.forEach((wt) => listItem(`${wt.name} ${colors.muted(`→ ${wt.branch}`)}`));
        }
        spacer();
        return;
      }
    } else {
      selected = [found];
    }
  } else {
    // Interactive multi-select
    try {
      const choices: Array<{ name: string; value: { name: string; path: string; branch: string }; description?: string }> = worktrees.map((wt) => {
        const isCurrent = currentPath === wt.path || currentPath.startsWith(wt.path + '/');
        const currentLabel = isCurrent ? colors.warning(' (you are here)') : '';
        const wtColor = getWorktreeColor(repoRoot, wt.name);
        return {
          name: formatWorktreeChoice(wt, wtColor) + currentLabel,
          value: wt,
          description: wt.path,
        };
      });

      selected = await checkbox<{ name: string; path: string; branch: string }>({
        message: 'Select worktrees to remove:',
        choices,
        theme: { prefix: icons.trash },
        required: false,
      });

      if (selected.length === 0) {
        info('No worktrees selected. Cancelled.');
        return;
      }
    } catch (err) {
      handlePromptError(err);
      return;
    }
  }

  if (selected.length === 0) {
    return;
  }

  try {
    // For bulk removal or --all, show summary and confirm once
    if (selected.length > 1 || all) {
      spacer();
      info(`You are about to remove ${selected.length} worktree${selected.length === 1 ? '' : 's'}:`);
      selected.forEach((wt) => {
        const wtColor = getWorktreeColor(repoRoot, wt.name);
        const colorDot = colorIndicator(wtColor);
        const isCurrent = currentPath === wt.path || currentPath.startsWith(wt.path + '/');
        const currentLabel = isCurrent ? colors.warning(' (you are here)') : '';
        listItem(`${colorDot} ${colors.highlight(wt.name)} ${colors.muted(`→ ${wt.branch}`)}${currentLabel}`);
      });
      spacer();

      const confirmed = await confirm({
        message: `Are you sure you want to remove ${selected.length} worktree${selected.length === 1 ? '' : 's'}?`,
        default: false,
        theme: { prefix: icons.warning },
      });

      if (!confirmed) {
        info('Cancelled');
        return;
      }
    }

    // Remove each worktree in parallel
    const wasNamedDirectly = !!name;
    if (selected.length > 1 || all) {
      spacer();
      info(`Removing ${selected.length} worktree${selected.length === 1 ? '' : 's'} in parallel...`);
      spacer();
    }
    
    const removalPromises = selected.map(async (wt) => {
      try {
        const success = await removeSingleWorktree(wt, repoRoot, config, currentPath, options, selected.length > 1 || all, wasNamedDirectly);
        return { worktree: wt, success };
      } catch (err) {
        return { worktree: wt, success: false };
      }
    });
    
    const results = await Promise.all(removalPromises);

    // Show summary for bulk operations
    if (selected.length > 1 || all) {
      spacer();
      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      if (successful > 0) {
        success(`Successfully removed ${successful} worktree${successful === 1 ? '' : 's'}`);
      }
      if (failed > 0) {
        error(`Failed to remove ${failed} worktree${failed === 1 ? '' : 's'}`);
        results.filter((r) => !r.success).forEach((r) => {
          listItem(`${colors.error(r.worktree.name)}`);
        });
      }
      spacer();
    }
  } catch (err) {
    handlePromptError(err);
  }
}

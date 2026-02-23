import { select, confirm } from '@inquirer/prompts';
import ora from 'ora';
import { ensureGitRepo, handlePromptError } from './utils.js';
import { getRepoRoot, getWorktreesInBase, getCurrentWorktreeInfo, getMainRepoPath, getMainBranch, getCurrentBranch, getLocalBranches, hasUncommittedChanges, mergeBranch, removeWorktree, deleteBranch } from '../git.js';
import { resolveConfig, runHooks, getWorktreeColor, removeWorktreeColor } from '../config.js';
import { showMiniLogo, heading, success, error, warning, info, spacer, divider, colors, icons, formatWorktreeChoice, colorIndicator, listItem } from '../ui.js';
import type { CommandOptions } from '../types.js';

export async function mergeWorktreeFlow(options: CommandOptions = {}, name?: string): Promise<void> {
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

  heading(`🔀 Merge Worktree`);

  const mainPath = await getMainRepoPath();
  const worktrees = await getWorktreesInBase(repoRoot, config);
  const currentPath = process.cwd();
  const isAtHome = currentPath === mainPath;

  if (worktrees.length === 0) {
    info('No worktrees found to merge');
    spacer();
    console.log(`  ${colors.muted('Create one with')} ${colors.primary('wt new')}`);
    spacer();
    return;
  }

  let selectedWt: { name: string; path: string; branch: string } | null = null;

  if (name) {
    // Direct merge by name - also try partial/fuzzy match
    selectedWt = worktrees.find((wt) => wt.name === name) || null;
    if (!selectedWt) {
      // Try partial match
      const partialMatches = worktrees.filter((wt) => wt.name.includes(name));
      if (partialMatches.length === 1) {
        selectedWt = partialMatches[0];
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
    }
  } else {
    // Interactive selection
    try {
      const wtChoices: Array<{ name: string; value: { name: string; path: string; branch: string } | null; description?: string }> = worktrees.map((wt) => {
        const wtColor = getWorktreeColor(repoRoot, wt.name);
        return {
          name: formatWorktreeChoice(wt, wtColor),
          value: wt,
          description: wt.path,
        };
      });

      wtChoices.push({
        name: `${colors.muted(icons.cross + '  Cancel')}`,
        value: null as unknown as { name: string; path: string; branch: string },
      });

      selectedWt = await select<{ name: string; path: string; branch: string } | null>({
        message: 'Select worktree branch to merge:',
        choices: wtChoices,
        theme: { prefix: '🔀' },
      });

      if (!selectedWt) {
        info('Cancelled');
        return;
      }
    } catch (err) {
      handlePromptError(err);
      return;
    }
  }

  if (!selectedWt) {
    return;
  }

  try {

    // Select target branch
    const mainBranch = await getMainBranch(mainPath || repoRoot);
    const currentBranch = await getCurrentBranch();
    const localBranches = await getLocalBranches(mainPath || repoRoot);

    const targetChoices: Array<{ name: string; value: string }> = [];

    // Add main branch first if it exists
    if (localBranches.some(b => b.name === mainBranch)) {
      targetChoices.push({
        name: `${icons.home}  ${colors.branch(mainBranch)} ${colors.muted('(main branch)')}`,
        value: mainBranch,
      });
    }

    // Add current branch if different and we're at home
    if (isAtHome && currentBranch && currentBranch !== mainBranch && currentBranch !== 'HEAD') {
      targetChoices.push({
        name: `${icons.pointer}  ${colors.branch(currentBranch)} ${colors.muted('(current)')}`,
        value: currentBranch,
      });
    }

    // Add other branches (excluding the source worktree branch to prevent merging into itself)
    for (const branch of localBranches) {
      if (branch.name !== mainBranch && branch.name !== currentBranch && branch.name !== selectedWt.branch) {
        targetChoices.push({
          name: `${icons.branch}  ${colors.branch(branch.name)}`,
          value: branch.name,
        });
      }
    }

    if (targetChoices.length === 0) {
      error('No target branches available to merge into');
      spacer();
      return;
    }

    targetChoices.push({
      name: `${colors.muted(icons.cross + '  Cancel')}`,
      value: null as unknown as string,
    });

    spacer();
    const targetBranch = await select<string | null>({
      message: `Merge ${colors.highlight(selectedWt.branch)} into:`,
      choices: targetChoices,
      theme: { prefix: icons.arrowRight },
    });

    if (!targetBranch) {
      info('Cancelled');
      return;
    }

    // Check for uncommitted changes in main repo
    if (mainPath && await hasUncommittedChanges(mainPath)) {
      spacer();
      warning('Main repository has uncommitted changes!');
      const proceed = await confirm({
        message: 'Stash changes and continue?',
        default: false,
        theme: { prefix: icons.warning },
      });

      if (!proceed) {
        info('Cancelled. Commit or stash your changes first.');
        return;
      }

      // Stash changes
      const { simpleGit } = await import('simple-git');
      const git = simpleGit(mainPath);
      await git.stash();
      info('Changes stashed');
    }

    // Confirm merge
    spacer();
    divider();
    const selectedColor = getWorktreeColor(repoRoot, selectedWt.name);
    const selectedColorDot = colorIndicator(selectedColor);
    info(`${selectedColorDot} From: ${colors.highlight(selectedWt.branch)} ${colors.muted(`(${selectedWt.name})`)}`);
    info(`Into: ${colors.branch(targetBranch)}`);
    divider();
    spacer();

    const confirmed = await confirm({
      message: 'Proceed with merge?',
      default: true,
      theme: { prefix: '🔀' },
    });

    if (!confirmed) {
      info('Cancelled');
      return;
    }

    // Perform merge
    const spinner = ora({
      text: 'Merging...',
      color: 'magenta',
    }).start();

    try {
      await mergeBranch(selectedWt.branch, targetBranch, mainPath || repoRoot);
      spinner.succeed(colors.success('Merged successfully!'));
      spacer();
      success(`Merged ${colors.highlight(selectedWt.branch)} into ${colors.branch(targetBranch)}`);

      // Ask about cleanup
      spacer();
      const cleanup = await confirm({
        message: `Remove the worktree "${selectedWt.name}" now that it's merged?`,
        default: false,
        theme: { prefix: icons.trash },
      });

      if (cleanup) {
        // Run pre-destroy hooks before removing the worktree
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
            { source: repoRoot, path: selectedWt.path, branch: selectedWt.branch, name: selectedWt.name, color: getWorktreeColor(repoRoot, selectedWt.name) },
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

        const cleanupSpinner = ora({
          text: 'Cleaning up...',
          color: 'yellow',
        }).start();

        try {
          await removeWorktree(selectedWt.path, false, mainPath || repoRoot);
          removeWorktreeColor(repoRoot, selectedWt.name);
          cleanupSpinner.succeed(colors.success('Worktree removed'));

          // Ask about deleting branch
          const deleteBr = await confirm({
            message: `Delete the branch "${selectedWt.branch}" too?`,
            default: false,
            theme: { prefix: icons.trash },
          });

          if (deleteBr) {
            await deleteBranch(selectedWt.branch, false, mainPath || repoRoot);
            success(`Branch ${colors.branch(selectedWt.branch)} deleted`);
          }
        } catch (err) {
          cleanupSpinner.fail('Failed to remove worktree');
          const errorMessage = err instanceof Error ? err.message : String(err);
          error(errorMessage);
        }
      }

      spacer();
      console.log(`  ${icons.sparkles} ${colors.success('All done!')}`);
      spacer();

    } catch (err) {
      spinner.fail(colors.error('Merge failed'));
      const errorMessage = err instanceof Error ? err.message : String(err);
      error(errorMessage);
      spacer();
      warning('You may need to resolve merge conflicts manually.');
      if (mainPath) {
        info(`Go to the main repo: ${colors.primary(`cd "${mainPath}"`)}`);
      }
      info(`Then resolve conflicts and run: ${colors.primary('git merge --continue')}`);
      spacer();
    }
  } catch (err) {
    handlePromptError(err);
  }
}

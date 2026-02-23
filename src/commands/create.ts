import { select, input, confirm, search } from '@inquirer/prompts';
import ora from 'ora';
import { ensureGitRepo, handlePromptError } from './utils.js';
import { getRepoRoot, getCurrentBranch, getLocalBranches, getRemoteBranches, getAllBranches, createWorktree, getCurrentWorktreeInfo, getMainRepoPath } from '../git.js';
import { resolveConfig, runHooks, assignWorktreeColor, getWorktreeColor } from '../config.js';
import { buildBranchName, isValidBranchName, getWorktreesBase } from '../git.js';
import { showMiniLogo, heading, success, error, warning, info, spacer, divider, colors, icons, setTabColor, colorIndicator, formatBranchChoice } from '../ui.js';
import { showCdHint, openTerminalWindow, openTerminalTab } from '../setup.js';
import type { CommandOptions } from '../types.js';

export async function createWorktreeFlow(options: CommandOptions = {}, name?: string | string[], openMode: 'window' | 'tab' | false = false): Promise<void> {
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

  const currentBranch = await getCurrentBranch();
  const isDetached = !currentBranch || currentBranch === 'HEAD';

  // Bulk creation mode: create multiple worktrees
  if (Array.isArray(name) && name.length > 1) {
    const names = name.filter(n => n && n.trim()).map(n => n.trim().replace(/ /g, '-'));
    
    if (names.length === 0) {
      error('No valid names provided');
      spacer();
      return;
    }

    // Validate all names
    const invalidNames = names.filter(n => !isValidBranchName(n));
    if (invalidNames.length > 0) {
      error(`Invalid name(s): ${invalidNames.join(', ')} (avoid spaces and special characters)`);
      spacer();
      return;
    }

    // Check if we're in a valid branch
    if (isDetached) {
      error('Cannot create worktrees from detached HEAD. Please checkout a branch first.');
      spacer();
      return;
    }

    heading(`${icons.plus} Create ${names.length} Worktrees`);
    spacer();
    divider();
    info(`Creating ${names.length} worktree${names.length === 1 ? '' : 's'} from ${colors.branch(currentBranch || 'HEAD')}`);
    if (openMode) {
      const modeText = openMode === 'tab' ? 'tab' : 'window';
      info(`Will open ${names.length} terminal ${modeText}${names.length === 1 ? '' : 's'} after creation`);
    }
    divider();
    spacer();

    // Create all worktrees in parallel
    const overallSpinner = ora({
      text: `Creating ${names.length} worktree${names.length === 1 ? '' : 's'} in parallel...`,
      color: 'magenta',
    }).start();

    const createPromises = names.map(async (worktreeName, index) => {
      const branchName = buildBranchName(worktreeName, config);
      
      try {
        const result = await createWorktree(worktreeName, branchName, currentBranch);

        if (!result.success) {
          return { 
            name: worktreeName, 
            success: false, 
            error: result.error || 'Unknown error',
            path: undefined,
            branchName,
          };
        }

        const worktreeColor = assignWorktreeColor(repoRoot, worktreeName);
        
        // Run post-create hooks for each worktree
        const hookCommands = config.hooks?.['post-create'];
        if (hookCommands && hookCommands.length > 0 && result.path) {
          await runHooks(
            'post-create',
            config,
            { source: repoRoot, path: result.path, branch: branchName, name: worktreeName, color: worktreeColor },
            {
              verbose: options.verbose,
              onCommandStart: (cmd: string, idx: number, total: number) => {
                // Hooks run silently in bulk mode unless verbose
                if (options.verbose) {
                  overallSpinner.text = `Running hooks for ${worktreeName}... (${idx}/${total}: ${cmd})`;
                }
              },
            }
          );
        }

        return { 
          name: worktreeName, 
          success: true, 
          path: result.path,
          branchName,
          worktreeColor,
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { 
          name: worktreeName, 
          success: false, 
          error: errorMessage,
          path: undefined,
          branchName,
        };
      }
    });

    const results = await Promise.all(createPromises);
    
    overallSpinner.stop();

    // Summary
    spacer();
    divider();
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    if (successful.length > 0) {
      success(`Successfully created ${successful.length} worktree${successful.length === 1 ? '' : 's'}:`);
      successful.forEach(r => {
        const worktreeColor = r.worktreeColor || getWorktreeColor(repoRoot, r.name);
        const colorDot = colorIndicator(worktreeColor);
        info(`  ${colorDot} ${colors.highlight(r.name)} ${colors.path(r.path || '')}`);
      });
      
      // Open terminal windows/tabs if requested (with delays to prevent race conditions)
      if (openMode) {
        (async () => {
          for (let i = 0; i < successful.length; i++) {
            const r = successful[i];
            if (r.path) {
              if (openMode === 'tab') {
                openTerminalTab(r.path, { command: config.openCommand, title: r.name });
              } else {
                openTerminalWindow(r.path, { command: config.openCommand, title: r.name });
              }
              // Add delay between opening tabs to prevent commands from going to wrong tab
              if (i < successful.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          }
        })();
      }
      
      if (openMode) {
        spacer();
        const modeText = openMode === 'tab' ? 'tab' : 'window';
        info(`Opened ${successful.length} terminal ${modeText}${successful.length === 1 ? '' : 's'}`);
      }
    }
    
    if (failed.length > 0) {
      spacer();
      error(`Failed to create ${failed.length} worktree${failed.length === 1 ? '' : 's'}:`);
      failed.forEach(r => {
        error(`  ${colors.highlight(r.name)}: ${colors.muted(r.error || 'Unknown error')}`);
      });
    }
    
    divider();
    spacer();
    return;
  }

  // Shorthand mode: create from current branch with provided name
  if (name) {
    // Handle both string and single-item array (from Commander.js variadic args)
    const nameStr = typeof name === 'string' ? name : (Array.isArray(name) ? name[0] : '');
    const worktreeName = nameStr.trim().replace(/ /g, '-');
    
    // Validate name
    if (!isValidBranchName(worktreeName)) {
      error('Invalid name (avoid spaces and special characters)');
      spacer();
      return;
    }

    // Check if we're in a valid branch
    if (isDetached) {
      error('Cannot create worktree from detached HEAD. Please checkout a branch first.');
      spacer();
      return;
    }

    heading(`${icons.plus} Create New Worktree`);

    // Build branch name with hierarchical config resolution
    const branchName = buildBranchName(worktreeName, config);
    const baseBranch = currentBranch;

    // Show summary
    spacer();
    divider();
    info(`Worktree: ${colors.highlight(worktreeName)}`);
    info(`Branch:   ${colors.branch(branchName)}`);
    info(`Base:     ${colors.muted(baseBranch || 'HEAD')}`);
    info(`Path:     ${colors.path(getWorktreesBase(repoRoot, config) + '/' + worktreeName)}`);
    const postCreateHooks = config.hooks?.['post-create'];
    if (postCreateHooks?.length) {
      info(`Hooks:    ${colors.muted(`post-create (${postCreateHooks.length} command${postCreateHooks.length === 1 ? '' : 's'})`)}`);
    }
    divider();
    spacer();

    // Create worktree
    const spinner = ora({
      text: 'Creating worktree...',
      color: 'magenta',
    }).start();

    try {
      const result = await createWorktree(worktreeName, branchName, baseBranch);

      if (!result.success) {
        spinner.fail(colors.error('Failed to create worktree'));
        error(result.error || 'Unknown error');
        return;
      }

      spinner.succeed(colors.success('Worktree created!'));
      spacer();

      const worktreeColor = assignWorktreeColor(repoRoot, worktreeName);
      setTabColor(worktreeColor);

      const colorDot = colorIndicator(worktreeColor);
      success(`${colorDot} Created worktree at ${colors.path(result.path || '')}`);
      if (result.branchCreated) {
        success(`Created new branch ${colors.branch(branchName)}`);
      } else if (result.branchSource === 'updated-from-remote') {
        info(`Updated branch ${colors.branch(branchName)} to match remote`);
      } else {
        info(`Using existing branch ${colors.branch(branchName)} (${result.branchSource || 'unknown'})`);
      }

      // Run post-create hooks
      const hookCommands = config.hooks?.['post-create'];
      if (hookCommands && hookCommands.length > 0 && result.path) {
        spacer();
        const hookSpinner = ora({
          text: 'Running post-create hooks...',
          color: 'magenta',
        }).start();

        const hookResults = await runHooks(
          'post-create',
          config,
          { source: repoRoot, path: result.path, branch: branchName, name: worktreeName, color: worktreeColor },
          {
            verbose: options.verbose,
            onCommandStart: (cmd: string, i: number, total: number) => {
              hookSpinner.text = total > 1
                ? `Running post-create hooks... (${i}/${total}: ${cmd})`
                : `Running post-create hooks... (${cmd})`;
            },
          }
        );

        const failed = hookResults.filter((r) => !r.success);
        if (failed.length === 0) {
          hookSpinner.succeed(colors.success(`Ran ${hookResults.length} post-create hook${hookResults.length === 1 ? '' : 's'}`));
        } else {
          hookSpinner.warn(colors.warning(`${failed.length} of ${hookResults.length} hook${hookResults.length === 1 ? '' : 's'} failed`));
          for (const f of failed) {
            warning(`Hook failed: ${colors.muted(f.command)}`);
            if (f.error) info(colors.muted(f.error));
          }
        }
      }

      if (result.path) {
        if (openMode) {
          if (openMode === 'tab') {
            openTerminalTab(result.path, { command: config.openCommand, title: worktreeName });
            info(`Opened new terminal tab in ${colors.path(result.path)}`);
          } else {
            openTerminalWindow(result.path, { command: config.openCommand, title: worktreeName });
            info(`Opened new terminal window in ${colors.path(result.path)}`);
          }
        } else {
          showCdHint(result.path);
        }
      }
    } catch (err) {
      spinner.fail(colors.error('Failed to create worktree'));
      const errorMessage = err instanceof Error ? err.message : String(err);
      error(errorMessage);
    }
    return;
  }

  // Interactive mode: full flow with prompts
  heading(`${icons.plus} Create New Worktree`);

  try {
    // Step 1: Choose source type
    const sourceChoices: Array<{ name: string; value: string; description: string }> = [];

    if (!isDetached && currentBranch) {
      sourceChoices.push({
        name: `${icons.branch}  Current branch (${colors.branch(currentBranch)})`,
        value: 'current',
        description: 'Create from your current branch',
      });
    }

    sourceChoices.push(
      {
        name: `${icons.local}  Local branch`,
        value: 'local',
        description: 'Choose from existing local branches',
      },
      {
        name: `${icons.remote}  Remote branch`,
        value: 'remote',
        description: 'Choose from remote branches',
      },
      {
        name: `${icons.sparkles}  New branch`,
        value: 'new',
        description: 'Create a fresh branch from a base',
      },
    );

    const sourceType = await select({
      message: 'What do you want to base your worktree on?',
      choices: sourceChoices,
      theme: {
        prefix: icons.tree,
      },
    });

    let baseBranch: string | null = null;
    let branchName: string | null = null;
    let worktreeName: string | null = null;

    if (sourceType === 'current') {
      baseBranch = currentBranch;
    } else if (sourceType === 'local') {
      const branches = await getLocalBranches();
      if (branches.length === 0) {
        error('No local branches found');
        return;
      }

      const branchChoices = branches.map((b) => ({
        name: formatBranchChoice(b.name, 'local'),
        value: b.name,
        description: b.isCurrent ? '(current)' : undefined,
      }));

      baseBranch = await select({
        message: 'Select a local branch:',
        choices: branchChoices,
        theme: { prefix: icons.local },
      });
    } else if (sourceType === 'remote') {
      const spinner = ora({
        text: 'Fetching remote branches...',
        color: 'magenta',
      }).start();

      const remoteBranches = await getRemoteBranches();
      spinner.stop();

      if (remoteBranches.length === 0) {
        error('No remote branches found');
        return;
      }

      // Use search for large branch lists
      if (remoteBranches.length > 10) {
        baseBranch = await search({
          message: 'Search for a remote branch:',
          source: async (term: string | undefined) => {
            const filtered = term
              ? remoteBranches.filter((b) => b.name.toLowerCase().includes(term.toLowerCase()))
              : remoteBranches.slice(0, 15);
            return filtered.map((b) => ({
              name: formatBranchChoice(b.name, 'remote'),
              value: `origin/${b.name}`,
            }));
          },
          theme: { prefix: icons.remote },
        });
      } else {
        const branchChoices = remoteBranches.map((b) => ({
          name: formatBranchChoice(b.name, 'remote'),
          value: `origin/${b.name}`,
        }));

        baseBranch = await select({
          message: 'Select a remote branch:',
          choices: branchChoices,
          theme: { prefix: icons.remote },
        });
      }
    } else if (sourceType === 'new') {
      const branches = await getAllBranches();
      if (branches.all.length === 0) {
        error('No branches found. Make sure you have at least one commit.');
        return;
      }

      const allChoices = branches.all.map((b) => ({
        name: formatBranchChoice(b.name, b.type || 'local'),
        value: b.type === 'remote' ? `origin/${b.name}` : b.name,
      }));

      baseBranch = await select({
        message: 'Select base branch for your new branch:',
        choices: allChoices,
        theme: { prefix: icons.branch },
      });
    }

    // Step 2: Get worktree name
    spacer();

    worktreeName = await input({
      message: 'Worktree name (also used as directory and branch name):',
      theme: { prefix: icons.folder },
      validate: (value: string) => {
        if (!value.trim()) return 'Name is required';
        if (!isValidBranchName(value.trim())) return 'Invalid name (avoid spaces and special characters)';
        return true;
      },
      transformer: (value: string) => colors.highlight(value),
    });

    worktreeName = worktreeName.trim().replace(/ /g, '-');

    // Build branch name with hierarchical config resolution
    branchName = buildBranchName(worktreeName, config);

    // Step 3: Confirm
    spacer();
    divider();
    info(`Worktree: ${colors.highlight(worktreeName)}`);
    info(`Branch:   ${colors.branch(branchName)}`);
    info(`Base:     ${colors.muted(baseBranch || 'HEAD')}`);
    info(`Path:     ${colors.path(getWorktreesBase(repoRoot, config) + '/' + worktreeName)}`);
    const postCreateHooks = config.hooks?.['post-create'];
    if (postCreateHooks?.length) {
      info(`Hooks:    ${colors.muted(`post-create (${postCreateHooks.length} command${postCreateHooks.length === 1 ? '' : 's'})`)}`);
    }
    divider();
    spacer();

    const confirmed = await confirm({
      message: 'Create this worktree?',
      default: true,
      theme: { prefix: icons.tree },
    });

    if (!confirmed) {
      warning('Cancelled');
      return;
    }

    // Step 4: Create worktree
    spacer();
    const spinner = ora({
      text: 'Creating worktree...',
      color: 'magenta',
    }).start();

    try {
      const result = await createWorktree(worktreeName, branchName, baseBranch);

      if (!result.success) {
        spinner.fail(colors.error('Failed to create worktree'));
        error(result.error || 'Unknown error');
        return;
      }

      spinner.succeed(colors.success('Worktree created!'));
      spacer();

      const worktreeColor = assignWorktreeColor(repoRoot, worktreeName);
      setTabColor(worktreeColor);

      const colorDot = colorIndicator(worktreeColor);
      success(`${colorDot} Created worktree at ${colors.path(result.path || '')}`);
      if (result.branchCreated) {
        success(`Created new branch ${colors.branch(branchName)}`);
      } else if (result.branchSource === 'updated-from-remote') {
        info(`Updated branch ${colors.branch(branchName)} to match remote`);
      } else {
        info(`Using existing branch ${colors.branch(branchName)} (${result.branchSource || 'unknown'})`);
      }

      // Run post-create hooks
      const hookCommands = config.hooks?.['post-create'];
      if (hookCommands && hookCommands.length > 0 && result.path) {
        spacer();
        const hookSpinner = ora({
          text: 'Running post-create hooks...',
          color: 'magenta',
        }).start();

        const hookResults = await runHooks(
          'post-create',
          config,
          { source: repoRoot, path: result.path, branch: branchName, name: worktreeName, color: worktreeColor },
          {
            verbose: options.verbose,
            onCommandStart: (cmd: string, i: number, total: number) => {
              hookSpinner.text = total > 1
                ? `Running post-create hooks... (${i}/${total}: ${cmd})`
                : `Running post-create hooks... (${cmd})`;
            },
          }
        );

        const failed = hookResults.filter((r) => !r.success);
        if (failed.length === 0) {
          hookSpinner.succeed(colors.success(`Ran ${hookResults.length} post-create hook${hookResults.length === 1 ? '' : 's'}`));
        } else {
          hookSpinner.warn(colors.warning(`${failed.length} of ${hookResults.length} hook${hookResults.length === 1 ? '' : 's'} failed`));
          for (const f of failed) {
            warning(`Hook failed: ${colors.muted(f.command)}`);
            if (f.error) info(colors.muted(f.error));
          }
        }
      }

      if (result.path) {
        if (openMode) {
          if (openMode === 'tab') {
            openTerminalTab(result.path, { command: config.openCommand, title: worktreeName });
            info(`Opened new terminal tab in ${colors.path(result.path)}`);
          } else {
            openTerminalWindow(result.path, { command: config.openCommand, title: worktreeName });
            info(`Opened new terminal window in ${colors.path(result.path)}`);
          }
        } else {
          showCdHint(result.path);
        }
      }
    } catch (err) {
      spinner.fail(colors.error('Failed to create worktree'));
      const errorMessage = err instanceof Error ? err.message : String(err);
      error(errorMessage);
    }
  } catch (err) {
    handlePromptError(err);
  }
}

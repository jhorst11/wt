import { select, input, confirm, search } from '@inquirer/prompts';
import { ExitPromptError } from '@inquirer/core';
import ora from 'ora';
import chalk from 'chalk';
import {
  showLogo,
  showMiniLogo,
  success,
  error,
  warning,
  info,
  heading,
  subheading,
  listItem,
  worktreeItem,
  divider,
  spacer,
  colors,
  icons,
  formatBranchChoice,
} from './ui.js';
import { showCdHint } from './setup.js';
import { resolveConfig, loadConfig, runHooks } from './config.js';
import {
  isGitRepo,
  getRepoRoot,
  getCurrentBranch,
  getLocalBranches,
  getRemoteBranches,
  getAllBranches,
  getWorktreesInBase,
  getMainRepoPath,
  createWorktree,
  removeWorktree,
  buildBranchName,
  isValidBranchName,
  getWorktreesBase,
  mergeBranch,
  getMainBranch,
  hasUncommittedChanges,
  deleteBranch,
} from './git.js';

function isUserCancellation(err) {
  return err instanceof ExitPromptError || err.message === 'User force closed the prompt with 0 null';
}

function handlePromptError(err) {
  if (isUserCancellation(err)) {
    spacer();
    info('Cancelled');
    spacer();
    return;
  }
  throw err;
}

async function ensureGitRepo() {
  if (!(await isGitRepo())) {
    error('Not in a git repository');
    process.exit(1);
  }
}

export async function mainMenu() {
  showLogo();

  await ensureGitRepo();

  const repoRoot = await getRepoRoot();
  const currentBranch = await getCurrentBranch();
  const config = resolveConfig(process.cwd(), repoRoot);
  const worktrees = await getWorktreesInBase(repoRoot, config);

  const branchDisplay = currentBranch && currentBranch !== 'HEAD'
    ? colors.branch(currentBranch)
    : colors.warning('detached HEAD');
  subheading(`  📍 ${colors.path(repoRoot)}`);
  subheading(`  🌿 ${branchDisplay}`);
  spacer();

  const choices = [
    {
      name: `${icons.plus}  Create new worktree`,
      value: 'new',
      description: 'Create a new worktree from a branch',
    },
    {
      name: `${icons.folder}  List worktrees`,
      value: 'list',
      description: 'View all worktrees for this repo',
    },
    {
      name: `${icons.trash}  Remove worktree`,
      value: 'remove',
      description: 'Delete a worktree',
    },
    {
      name: `${icons.home}  Go home`,
      value: 'home',
      description: 'Return to the main repository',
    },
  ];

  if (worktrees.length > 0) {
    choices.splice(1, 0, {
      name: `${icons.rocket}  Jump to worktree`,
      value: 'go',
      description: 'Switch to an existing worktree',
    });
    choices.splice(3, 0, {
      name: `🔀  Merge worktree`,
      value: 'merge',
      description: 'Merge a worktree branch back to main',
    });
  }

  choices.push({
    name: `${colors.muted(icons.cross + '  Exit')}`,
    value: 'exit',
  });

  try {
    const action = await select({
      message: 'What would you like to do?',
      choices,
      theme: {
        prefix: icons.tree,
        style: {
          highlight: (text) => colors.primary(text),
        },
      },
    });

    switch (action) {
      case 'new':
        await createWorktreeFlow();
        break;
      case 'list':
        await listWorktrees();
        break;
      case 'remove':
        await removeWorktreeFlow();
        break;
      case 'merge':
        await mergeWorktreeFlow();
        break;
      case 'home':
        await goHome();
        break;
      case 'go':
        await goToWorktree();
        break;
      case 'exit':
        spacer();
        info('Goodbye! ' + icons.sparkles);
        spacer();
        break;
    }
  } catch (err) {
    handlePromptError(err);
  }
}

export async function createWorktreeFlow() {
  showMiniLogo();
  await ensureGitRepo();

  heading(`${icons.plus} Create New Worktree`);

  const currentBranch = await getCurrentBranch();
  const repoRoot = await getRepoRoot();
  const isDetached = !currentBranch || currentBranch === 'HEAD';

  try {
    // Step 1: Choose source type
    const sourceChoices = [];

    if (!isDetached) {
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

    let baseBranch = null;
    let branchName = null;
    let worktreeName = null;

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
          source: async (term) => {
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
        name: formatBranchChoice(b.name, b.type),
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
      validate: (value) => {
        if (!value.trim()) return 'Name is required';
        if (!isValidBranchName(value.trim())) return 'Invalid name (avoid spaces and special characters)';
        return true;
      },
      transformer: (value) => colors.highlight(value),
    });

    worktreeName = worktreeName.trim().replace(/ /g, '-');

    // Build branch name with hierarchical config resolution
    const config = resolveConfig(process.cwd(), repoRoot);
    branchName = buildBranchName(worktreeName, config);

    // Step 3: Confirm
    spacer();
    divider();
    info(`Worktree: ${colors.highlight(worktreeName)}`);
    info(`Branch:   ${colors.branch(branchName)}`);
    info(`Base:     ${colors.muted(baseBranch || 'HEAD')}`);
    info(`Path:     ${colors.path(getWorktreesBase(repoRoot, config) + '/' + worktreeName)}`);
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
        error(result.error);
        return;
      }

      spinner.succeed(colors.success('Worktree created!'));
      spacer();

      success(`Created worktree at ${colors.path(result.path)}`);
      if (result.branchCreated) {
        success(`Created new branch ${colors.branch(branchName)}`);
      } else if (result.branchSource === 'updated-from-remote') {
        info(`Updated branch ${colors.branch(branchName)} to match remote`);
      } else {
        info(`Using existing branch ${colors.branch(branchName)} (${result.branchSource})`);
      }

      // Run post-create hooks
      const hookCommands = repoConfig.hooks?.['post-create'];
      if (hookCommands && hookCommands.length > 0) {
        spacer();
        const hookSpinner = ora({
          text: 'Running post-create hooks...',
          color: 'magenta',
        }).start();

        const hookResults = runHooks('post-create', repoConfig, {
          source: repoRoot,
          path: result.path,
          branch: branchName,
        });

        const failed = hookResults.filter((r) => !r.success);
        if (failed.length === 0) {
          hookSpinner.succeed(colors.success(`Ran ${hookResults.length} post-create hook${hookResults.length === 1 ? '' : 's'}`));
        } else {
          hookSpinner.warn(colors.warning(`${failed.length} of ${hookResults.length} hook${hookResults.length === 1 ? '' : 's'} failed`));
          for (const f of failed) {
            warning(`Hook failed: ${colors.muted(f.command)}`);
          }
        }
      }

      showCdHint(result.path);
    } catch (err) {
      spinner.fail(colors.error('Failed to create worktree'));
      error(err.message);
    }
  } catch (err) {
    handlePromptError(err);
  }
}

export async function listWorktrees() {
  showMiniLogo();
  await ensureGitRepo();

  const repoRoot = await getRepoRoot();
  const config = resolveConfig(process.cwd(), repoRoot);
  const worktrees = await getWorktreesInBase(repoRoot, config);
  const currentPath = process.cwd();

  heading(`${icons.folder} Worktrees`);

  if (worktrees.length === 0) {
    info('No worktrees found for this repository');
    spacer();
    console.log(`  ${colors.muted('Create one with')} ${colors.primary('wt new')}`);
    spacer();
    return;
  }

  subheading(`Found ${worktrees.length} worktree${worktrees.length === 1 ? '' : 's'}:`);
  spacer();

  for (const wt of worktrees) {
    const isCurrent = currentPath === wt.path || currentPath.startsWith(wt.path + '/');
    worktreeItem(wt.name, wt.path, isCurrent);
    const branchDisplay = wt.branch === 'unknown'
      ? colors.warning('detached HEAD')
      : colors.branch(wt.branch);
    console.log(`      ${icons.branch} ${branchDisplay}`);
    spacer();
  }

  divider();
  console.log(`  ${colors.muted('Main repo:')} ${colors.path(repoRoot)}`);
  spacer();
}

export async function removeWorktreeFlow() {
  showMiniLogo();
  await ensureGitRepo();

  heading(`${icons.trash} Remove Worktree`);

  const repoRoot = await getRepoRoot();
  const config = resolveConfig(process.cwd(), repoRoot);
  const worktrees = await getWorktreesInBase(repoRoot, config);
  const currentPath = process.cwd();

  if (worktrees.length === 0) {
    info('No worktrees found to remove');
    spacer();
    console.log(`  ${colors.muted('Create one with')} ${colors.primary('wt new')}`);
    spacer();
    return;
  }

  try {
    const choices = worktrees.map((wt) => {
      const isCurrent = currentPath === wt.path || currentPath.startsWith(wt.path + '/');
      const currentLabel = isCurrent ? colors.warning(' (you are here)') : '';
      return {
        name: `${icons.folder}  ${colors.highlight(wt.name)} ${colors.muted(`→ ${wt.branch}`)}${currentLabel}`,
        value: wt,
        description: wt.path,
      };
    });

    choices.push({
      name: `${colors.muted(icons.cross + '  Cancel')}`,
      value: null,
    });

    const selected = await select({
      message: 'Select worktree to remove:',
      choices,
      theme: { prefix: icons.trash },
    });

    if (!selected) {
      info('Cancelled');
      return;
    }

    // Warn if user is inside the worktree they're removing
    const isInsideSelected = currentPath === selected.path || currentPath.startsWith(selected.path + '/');
    if (isInsideSelected) {
      spacer();
      warning('You are currently inside this worktree!');
      info(`You will need to ${colors.primary('cd')} out after removal.`);
    }

    spacer();
    warning(`This will remove: ${colors.path(selected.path)}`);
    spacer();

    const confirmed = await confirm({
      message: `Are you sure you want to remove "${selected.name}"?`,
      default: false,
      theme: { prefix: icons.warning },
    });

    if (!confirmed) {
      info('Cancelled');
      return;
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
          return;
        }
      }

      spinner.succeed(colors.success('Worktree removed!'));
      spacer();
      success(`Removed ${colors.highlight(selected.name)}`);

      if (isInsideSelected) {
        spacer();
        const mainPath = await getMainRepoPath();
        if (mainPath) {
          info(`Run ${colors.primary('wt home')} or ${colors.primary(`cd "${mainPath}"`)} to return to the main repo.`);
        }
      }

      spacer();
    } catch (err) {
      spinner.fail(colors.error('Failed to remove worktree'));
      error(err.message);
    }
  } catch (err) {
    handlePromptError(err);
  }
}

export async function mergeWorktreeFlow() {
  showMiniLogo();
  await ensureGitRepo();

  heading(`🔀 Merge Worktree`);

  const repoRoot = await getRepoRoot();
  const mainPath = await getMainRepoPath();
  const config = resolveConfig(process.cwd(), repoRoot);
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

  try {
    // Select worktree to merge
    const wtChoices = worktrees.map((wt) => ({
      name: `${icons.folder}  ${colors.highlight(wt.name)} ${colors.muted(`→ ${wt.branch}`)}`,
      value: wt,
      description: wt.path,
    }));

    wtChoices.push({
      name: `${colors.muted(icons.cross + '  Cancel')}`,
      value: null,
    });

    const selectedWt = await select({
      message: 'Select worktree branch to merge:',
      choices: wtChoices,
      theme: { prefix: '🔀' },
    });

    if (!selectedWt) {
      info('Cancelled');
      return;
    }

    // Select target branch
    const mainBranch = await getMainBranch(mainPath);
    const currentBranch = await getCurrentBranch();
    const localBranches = await getLocalBranches(mainPath);

    const targetChoices = [];

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
      value: null,
    });

    spacer();
    const targetBranch = await select({
      message: `Merge ${colors.highlight(selectedWt.branch)} into:`,
      choices: targetChoices,
      theme: { prefix: icons.arrowRight },
    });

    if (!targetBranch) {
      info('Cancelled');
      return;
    }

    // Check for uncommitted changes in main repo
    if (await hasUncommittedChanges(mainPath)) {
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
    info(`From: ${colors.highlight(selectedWt.branch)} ${colors.muted(`(${selectedWt.name})`)}`);
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
      await mergeBranch(selectedWt.branch, targetBranch, mainPath);
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
        const cleanupSpinner = ora({
          text: 'Cleaning up...',
          color: 'yellow',
        }).start();

        try {
          await removeWorktree(selectedWt.path, false, mainPath);
          cleanupSpinner.succeed(colors.success('Worktree removed'));

          // Ask about deleting branch
          const deleteBr = await confirm({
            message: `Delete the branch "${selectedWt.branch}" too?`,
            default: false,
            theme: { prefix: icons.trash },
          });

          if (deleteBr) {
            await deleteBranch(selectedWt.branch, false, mainPath);
            success(`Branch ${colors.branch(selectedWt.branch)} deleted`);
          }
        } catch (err) {
          cleanupSpinner.fail('Failed to remove worktree');
          error(err.message);
        }
      }

      spacer();
      console.log(`  ${icons.sparkles} ${colors.success('All done!')}`);
      spacer();

    } catch (err) {
      spinner.fail(colors.error('Merge failed'));
      error(err.message);
      spacer();
      warning('You may need to resolve merge conflicts manually.');
      info(`Go to the main repo: ${colors.primary(`cd "${mainPath}"`)}`);
      info(`Then resolve conflicts and run: ${colors.primary('git merge --continue')}`);
      spacer();
    }
  } catch (err) {
    handlePromptError(err);
  }
}

export async function goHome() {
  showMiniLogo();
  await ensureGitRepo();

  const mainPath = await getMainRepoPath();
  const currentPath = process.cwd();

  if (!mainPath) {
    error('Could not find main repository');
    return;
  }

  // Check if we're already home
  if (currentPath === mainPath || currentPath.startsWith(mainPath + '/')) {
    const isExactlyHome = currentPath === mainPath;
    spacer();
    if (isExactlyHome) {
      console.log(`  ${icons.home} ${colors.success("You're already home!")} ${icons.sparkles}`);
    } else {
      console.log(`  ${icons.home} ${colors.success("You're in the main repo")} ${icons.sparkles}`);
    }
    console.log(`  ${colors.muted('Path:')} ${colors.path(mainPath)}`);
    spacer();
    return;
  }

  spacer();
  success(`Heading home... ${icons.home}`);
  console.log(`  ${colors.muted('Path:')} ${colors.path(mainPath)}`);

  showCdHint(mainPath);
}

export async function goToWorktree(name) {
  showMiniLogo();
  await ensureGitRepo();

  const repoRoot = await getRepoRoot();
  const config = resolveConfig(process.cwd(), repoRoot);
  const worktrees = await getWorktreesInBase(repoRoot, config);

  if (worktrees.length === 0) {
    heading(`${icons.rocket} Jump to Worktree`);
    info('No worktrees found');
    spacer();
    console.log(`  ${colors.muted('Create one with')} ${colors.primary('wt new')}`);
    spacer();
    return;
  }

  let selected;

  if (name) {
    // Direct jump by name - also try partial/fuzzy match
    selected = worktrees.find((wt) => wt.name === name);
    if (!selected) {
      // Try partial match
      const partialMatches = worktrees.filter((wt) => wt.name.includes(name));
      if (partialMatches.length === 1) {
        selected = partialMatches[0];
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
    heading(`${icons.rocket} Jump to Worktree`);

    const currentPath = process.cwd();

    try {
      const choices = worktrees.map((wt) => {
        const isCurrent = currentPath === wt.path || currentPath.startsWith(wt.path + '/');
        const currentLabel = isCurrent ? colors.muted(' (current)') : '';
        return {
          name: `${icons.folder}  ${colors.highlight(wt.name)} ${colors.muted(`→ ${wt.branch}`)}${currentLabel}`,
          value: wt,
          description: wt.path,
        };
      });

      choices.push({
        name: `${colors.muted(icons.cross + '  Cancel')}`,
        value: null,
      });

      selected = await select({
        message: 'Select worktree:',
        choices,
        theme: { prefix: icons.rocket },
      });

      if (!selected) {
        info('Cancelled');
        return;
      }
    } catch (err) {
      handlePromptError(err);
      return;
    }
  }

  spacer();
  success(`Jumping to ${colors.highlight(selected.name)}`);
  console.log(`  ${colors.muted('Path:')} ${colors.path(selected.path)}`);

  showCdHint(selected.path);
}

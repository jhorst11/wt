import { select, input, confirm, search } from '@inquirer/prompts';
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
  getConfig,
  getWorktreesBase,
  mergeBranch,
  getMainBranch,
  hasUncommittedChanges,
  deleteBranch,
} from './git.js';

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
  const worktrees = await getWorktreesInBase(repoRoot);

  subheading(`  📍 ${colors.path(repoRoot)}`);
  subheading(`  🌿 ${colors.branch(currentBranch)}`);
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
}

export async function createWorktreeFlow() {
  showMiniLogo();
  await ensureGitRepo();

  heading(`${icons.plus} Create New Worktree`);

  const currentBranch = await getCurrentBranch();
  const repoRoot = await getRepoRoot();

  // Step 1: Choose source type
  const sourceType = await select({
    message: 'What do you want to base your worktree on?',
    choices: [
      {
        name: `${icons.branch}  Current branch (${colors.branch(currentBranch)})`,
        value: 'current',
        description: 'Create from your current branch',
      },
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
    ],
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
    message: 'Worktree name (also used as branch name):',
    theme: { prefix: icons.folder },
    validate: (value) => {
      if (!value.trim()) return 'Name is required';
      if (!isValidBranchName(value.trim())) return 'Invalid name (avoid spaces and special characters)';
      return true;
    },
    transformer: (value) => colors.highlight(value),
  });

  worktreeName = worktreeName.trim().replace(/ /g, '-');

  // Build branch name with optional prefix
  const config = getConfig();
  branchName = buildBranchName(worktreeName, config.branchPrefix);

  // Step 3: Confirm
  spacer();
  divider();
  info(`Worktree: ${colors.highlight(worktreeName)}`);
  info(`Branch:   ${colors.branch(branchName)}`);
  info(`Base:     ${colors.muted(baseBranch || 'HEAD')}`);
  info(`Path:     ${colors.path(getWorktreesBase(repoRoot) + '/' + worktreeName)}`);
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

    showCdHint(result.path);
  } catch (err) {
    spinner.fail(colors.error('Failed to create worktree'));
    error(err.message);
  }
}

export async function listWorktrees() {
  showMiniLogo();
  await ensureGitRepo();

  const repoRoot = await getRepoRoot();
  const worktrees = await getWorktreesInBase(repoRoot);
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
    console.log(`      ${icons.branch} ${colors.branch(wt.branch)}`);
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
  const worktrees = await getWorktreesInBase(repoRoot);

  if (worktrees.length === 0) {
    info('No worktrees found to remove');
    spacer();
    return;
  }

  const choices = worktrees.map((wt) => ({
    name: `${icons.folder}  ${colors.highlight(wt.name)} ${colors.muted(`→ ${wt.branch}`)}`,
    value: wt,
    description: wt.path,
  }));

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
      const forceRemove = await confirm({
        message: 'Worktree has changes. Force remove?',
        default: false,
      });

      if (forceRemove) {
        await removeWorktree(selected.path, true);
      } else {
        spinner.fail('Aborted');
        return;
      }
    }

    spinner.succeed(colors.success('Worktree removed!'));
    spacer();
    success(`Removed ${colors.highlight(selected.name)}`);
    spacer();
  } catch (err) {
    spinner.fail(colors.error('Failed to remove worktree'));
    error(err.message);
  }
}

export async function mergeWorktreeFlow() {
  showMiniLogo();
  await ensureGitRepo();

  heading(`🔀 Merge Worktree`);

  const repoRoot = await getRepoRoot();
  const mainPath = await getMainRepoPath();
  const worktrees = await getWorktreesInBase(repoRoot);
  const currentPath = process.cwd();
  const isAtHome = currentPath === mainPath;

  if (worktrees.length === 0) {
    info('No worktrees found to merge');
    spacer();
    return;
  }

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
    message: 'Select worktree to merge:',
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
  if (isAtHome && currentBranch && currentBranch !== mainBranch) {
    targetChoices.push({
      name: `${icons.pointer}  ${colors.branch(currentBranch)} ${colors.muted('(current)')}`,
      value: currentBranch,
    });
  }

  // Add other branches
  for (const branch of localBranches) {
    if (branch.name !== mainBranch && branch.name !== currentBranch) {
      targetChoices.push({
        name: `${icons.branch}  ${colors.branch(branch.name)}`,
        value: branch.name,
      });
    }
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
    warning('You may need to resolve conflicts manually');
    spacer();
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
  const worktrees = await getWorktreesInBase(repoRoot);

  if (worktrees.length === 0) {
    info('No worktrees found');
    spacer();
    console.log(`  ${colors.muted('Create one with')} ${colors.primary('wt new')}`);
    spacer();
    return;
  }

  let selected;

  if (name) {
    // Direct jump by name
    selected = worktrees.find((wt) => wt.name === name);
    if (!selected) {
      error(`Worktree "${name}" not found`);
      spacer();
      info('Available worktrees:');
      worktrees.forEach((wt) => listItem(wt.name));
      spacer();
      return;
    }
  } else {
    // Interactive selection
    heading(`${icons.rocket} Jump to Worktree`);

    const choices = worktrees.map((wt) => ({
      name: `${icons.folder}  ${colors.highlight(wt.name)} ${colors.muted(`→ ${wt.branch}`)}`,
      value: wt,
      description: wt.path,
    }));

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
  }

  spacer();
  success(`Jumping to ${colors.highlight(selected.name)}`);
  console.log(`  ${colors.muted('Path:')} ${colors.path(selected.path)}`);

  showCdHint(selected.path);
}

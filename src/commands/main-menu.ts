import { select } from '@inquirer/prompts';
import { ensureGitRepo, handlePromptError, isSkillInstalled, getSourceSkillPath } from './utils.js';
import { getRepoRoot, getCurrentBranch, getWorktreesInBase, getCurrentWorktreeInfo } from '../git.js';
import { resolveConfig, getWorktreeColor } from '../config.js';
import { showLogo, subheading, spacer, colors, icons, info, colorIndicator } from '../ui.js';
import { checkWrapperInRcFile, setupCommand } from '../setup.js';
import { createWorktreeFlow } from './create.js';
import { listWorktrees } from './list.js';
import { removeWorktreeFlow } from './remove.js';
import { mergeWorktreeFlow } from './merge.js';
import { goHome } from './home.js';
import { goToWorktree } from './go.js';
import { installSkillFlow } from './install-skill.js';

export async function mainMenu(): Promise<void> {
  showLogo();

  await ensureGitRepo();

  const repoRoot = await getRepoRoot();
  if (!repoRoot) {
    const { error } = await import('../ui.js');
    error('Not in a git repository');
    return;
  }
  const currentBranch = await getCurrentBranch();
  const config = resolveConfig(process.cwd(), repoRoot);
  const worktrees = await getWorktreesInBase(repoRoot, config);
  const currentWt = await getCurrentWorktreeInfo(repoRoot, config);

  const branchDisplay = currentBranch && currentBranch !== 'HEAD'
    ? colors.branch(currentBranch)
    : colors.warning('detached HEAD');
  subheading(`  📍 ${colors.path(repoRoot)}`);
  subheading(`  🌿 ${branchDisplay}`);
  if (currentWt) {
    const wtColor = getWorktreeColor(repoRoot, currentWt.name);
    const colorDot = colorIndicator(wtColor);
    subheading(`  ${colorDot} ${colors.highlight(currentWt.name)}`);
  }
  spacer();

  const wrapperStatus = checkWrapperInRcFile();

  if (!wrapperStatus.installed) {
    console.log(`  ${icons.warning}  ${colors.warning('Shell integration not configured')} ${colors.muted('— directory jumping is disabled')}`);
    console.log(`  ${colors.muted('   Run')} ${colors.secondary('wt setup')} ${colors.muted('or select Setup below to enable auto-navigation')}`);
    spacer();
  }

  const choices: Array<{ name: string; value: string; description?: string }> = [
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

  if (!wrapperStatus.installed) {
    choices.push({
      name: `${icons.sparkles}  Setup shell integration`,
      value: 'setup',
      description: 'Enable auto-navigation for wt go, wt home, and wt new',
    });
  }

  // Show skill installation option only when at home and skill is not installed
  if (!currentWt && !isSkillInstalled(repoRoot) && getSourceSkillPath()) {
    choices.push({
      name: `${icons.star}  Install wt-cli-guide skill`,
      value: 'install-skill',
      description: 'Install the wt-cli-guide skill to this repository',
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
          highlight: (text: string) => colors.primary(text),
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
      case 'setup':
        await setupCommand();
        break;
      case 'install-skill':
        await installSkillFlow(repoRoot);
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

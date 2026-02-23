import { select } from '@inquirer/prompts';
import { ensureGitRepo, handlePromptError } from './utils.js';
import { getRepoRoot, getWorktreesInBase } from '../git.js';
import { resolveConfig } from '../config.js';
import { getCurrentWorktreeInfo } from '../git.js';
import { getWorktreeColor } from '../config.js';
import { showMiniLogo, success, error, info, colors, icons, spacer, listItem, setTabColor, colorIndicator } from '../ui.js';
import { formatWorktreeChoice } from '../ui.js';
import { showCdHint } from '../setup.js';

export async function goToWorktree(name?: string): Promise<void> {
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

  const worktrees = await getWorktreesInBase(repoRoot, config);

  if (worktrees.length === 0) {
    const { heading } = await import('../ui.js');
    heading(`${icons.rocket} Jump to Worktree`);
    info('No worktrees found');
    spacer();
    console.log(`  ${colors.muted('Create one with')} ${colors.primary('wt new')}`);
    spacer();
    return;
  }

  let selected: { name: string; path: string; branch: string } | undefined;

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
    const { heading } = await import('../ui.js');
    heading(`${icons.rocket} Jump to Worktree`);

    const currentPath = process.cwd();

    try {
      const choices = worktrees.map((wt) => {
        const isCurrent = currentPath === wt.path || currentPath.startsWith(wt.path + '/');
        const currentLabel = isCurrent ? colors.muted(' (current)') : '';
        const wtColor = getWorktreeColor(repoRoot, wt.name);
        return {
          name: formatWorktreeChoice(wt, wtColor) + currentLabel,
          value: wt,
          description: wt.path,
        };
      });

      choices.push({
        name: `${colors.muted(icons.cross + '  Cancel')}`,
        value: null as unknown as { name: string; path: string; branch: string },
        description: '',
      });

      selected = await select<{ name: string; path: string; branch: string } | null>({
        message: 'Select worktree:',
        choices,
        theme: { prefix: icons.rocket },
      }) || undefined;

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
  const selectedColor = getWorktreeColor(repoRoot, selected.name);
  const selectedColorDot = colorIndicator(selectedColor);
  success(`${selectedColorDot} Jumping to ${colors.highlight(selected.name)}`);
  console.log(`  ${colors.muted('Path:')} ${colors.path(selected.path)}`);

  if (selectedColor) setTabColor(selectedColor);

  showCdHint(selected.path);
}

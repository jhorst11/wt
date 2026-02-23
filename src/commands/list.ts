import { ensureGitRepo } from './utils.js';
import { getRepoRoot, getWorktreesInBase, getCurrentWorktreeInfo } from '../git.js';
import { resolveConfig } from '../config.js';
import { getWorktreeColor } from '../config.js';
import { showMiniLogo, heading, subheading, info, error, colors, icons, spacer, divider, worktreeItem } from '../ui.js';

export async function listWorktrees(): Promise<void> {
  await ensureGitRepo();
  const repoRoot = await getRepoRoot();
  if (!repoRoot) {
    error('Not in a git repository');
    return;
  }
  const config = resolveConfig(process.cwd(), repoRoot);
  const worktrees = await getWorktreesInBase(repoRoot, config);
  const currentPath = process.cwd();
  const currentWt = await getCurrentWorktreeInfo(repoRoot, config);
  const wtColor = currentWt ? getWorktreeColor(repoRoot, currentWt.name) : null;
  showMiniLogo(currentWt ? { ...currentWt, color: wtColor } : null);

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
    const wtColor = getWorktreeColor(repoRoot, wt.name);
    worktreeItem(wt.name, wt.path, isCurrent, wtColor);
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

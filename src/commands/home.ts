import { ensureGitRepo } from './utils.js';
import { getRepoRoot } from '../git.js';
import { resolveConfig } from '../config.js';
import { getCurrentWorktreeInfo, getMainRepoPath } from '../git.js';
import { getWorktreeColor } from '../config.js';
import { showMiniLogo, success, error, colors, icons, spacer, resetTabColor } from '../ui.js';
import { showCdHint } from '../setup.js';

export async function goHome(): Promise<void> {
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
  resetTabColor();
  showCdHint(mainPath);
}

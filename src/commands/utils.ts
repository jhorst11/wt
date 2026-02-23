import { ExitPromptError } from '@inquirer/core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, cpSync } from 'fs';
import { error, info, spacer, success, colors } from '../ui.js';

export function isUserCancellation(err: unknown): boolean {
  return err instanceof ExitPromptError || (err instanceof Error && err.message === 'User force closed the prompt with 0 null');
}

export function handlePromptError(err: unknown): void {
  if (isUserCancellation(err)) {
    spacer();
    info('Cancelled');
    spacer();
    return;
  }
  throw err;
}

/**
 * Get the package root directory where the skill directory should be located
 */
export function getPackageRoot(): string | null {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // Navigate from src/commands/utils.ts to package root
    const packageRoot = join(__dirname, '..', '..', '..');
    return packageRoot;
  } catch {
    return null;
  }
}

/**
 * Check if the wt-cli-guide skill is installed in the given repo root
 */
export function isSkillInstalled(repoRoot: string): boolean {
  const skillPath = join(repoRoot, '.claude', 'skills', 'wt-cli-guide');
  return existsSync(skillPath);
}

/**
 * Get the path to the source skill directory in the package
 */
export function getSourceSkillPath(): string | null {
  const packageRoot = getPackageRoot();
  if (!packageRoot) {
    return null;
  }
  const skillPath = join(packageRoot, 'skill', 'wt-cli-guide');
  return existsSync(skillPath) ? skillPath : null;
}

/**
 * Install the wt-cli-guide skill to the given repo root
 */
export async function installSkill(repoRoot: string): Promise<boolean> {
  const sourcePath = getSourceSkillPath();
  if (!sourcePath) {
    error('Skill source not found. The skill directory may not be available in this installation.');
    return false;
  }

  const targetDir = join(repoRoot, '.claude', 'skills');
  const targetPath = join(targetDir, 'wt-cli-guide');

  try {
    // Ensure .claude/skills directory exists
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    // Copy the skill directory recursively
    cpSync(sourcePath, targetPath, { recursive: true });
    return true;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    error(`Failed to install skill: ${errorMessage}`);
    return false;
  }
}

export async function ensureGitRepo(): Promise<void> {
  const { isGitRepo } = await import('../git.js');
  if (!(await isGitRepo())) {
    error('Not in a git repository');
    process.exit(1);
  }
}

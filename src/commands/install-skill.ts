import ora from 'ora';
import { join } from 'path';
import { handlePromptError, isSkillInstalled, getSourceSkillPath, installSkill } from './utils.js';
import { showMiniLogo, success, error, info, spacer, colors } from '../ui.js';

export async function installSkillFlow(repoRoot: string): Promise<void> {
  showMiniLogo();
  spacer();

  if (isSkillInstalled(repoRoot)) {
    info('Skill is already installed');
    spacer();
    return;
  }

  const sourceSkillPath = getSourceSkillPath();
  if (!sourceSkillPath) {
    error('Skill source not found. The skill directory may not be available in this installation.');
    spacer();
    return;
  }

  try {
    const spinner = ora('Installing skill...').start();
    const installed = await installSkill(repoRoot);
    spinner.stop();

    if (installed) {
      success(`Skill installed to ${colors.path(join(repoRoot, '.claude', 'skills', 'wt-cli-guide'))}`);
      spacer();
    }
  } catch (err) {
    handlePromptError(err);
  }
}

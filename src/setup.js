import { select, confirm } from '@inquirer/prompts';
import { ExitPromptError } from '@inquirer/core';
import { homedir } from 'os';
import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  showMiniLogo,
  success,
  error,
  warning,
  info,
  heading,
  spacer,
  colors,
  icons,
  divider,
} from './ui.js';

// Shell detection
export function detectShell() {
  const shell = process.env.SHELL || '';

  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('bash')) return 'bash';
  if (shell.includes('fish')) return 'fish';
  if (process.env.FISH_VERSION) return 'fish';
  if (process.env.ZSH_VERSION) return 'zsh';
  if (process.env.BASH_VERSION) return 'bash';

  return 'unknown';
}

export function getShellConfig() {
  const shell = detectShell();
  const home = homedir();

  const configs = {
    zsh: {
      name: 'Zsh',
      rcFile: join(home, '.zshrc'),
      wrapper: `
# wt-cli: Git worktree manager shell integration
wt() {
  local wt_cd_file="/tmp/wt_cd_$$"
  rm -f "$wt_cd_file"
  WT_WRAPPER=1 WT_CD_FILE="$wt_cd_file" command wt "$@"
  local exit_code=$?
  if [[ -f "$wt_cd_file" ]]; then
    local dir=$(cat "$wt_cd_file")
    rm -f "$wt_cd_file"
    [[ -d "$dir" ]] && cd "$dir"
  fi
  return $exit_code
}`,
    },
    bash: {
      name: 'Bash',
      rcFile: join(home, '.bashrc'),
      wrapper: `
# wt-cli: Git worktree manager shell integration
wt() {
  local wt_cd_file="/tmp/wt_cd_$$"
  rm -f "$wt_cd_file"
  WT_WRAPPER=1 WT_CD_FILE="$wt_cd_file" command wt "$@"
  local exit_code=$?
  if [[ -f "$wt_cd_file" ]]; then
    local dir=$(cat "$wt_cd_file")
    rm -f "$wt_cd_file"
    [[ -d "$dir" ]] && cd "$dir"
  fi
  return $exit_code
}`,
    },
    fish: {
      name: 'Fish',
      rcFile: join(home, '.config/fish/config.fish'),
      wrapper: `
# wt-cli: Git worktree manager shell integration
function wt
  set -l wt_cd_file "/tmp/wt_cd_fish_$fish_pid"
  rm -f "$wt_cd_file"
  env WT_WRAPPER=1 WT_CD_FILE="$wt_cd_file" command wt $argv
  set -l exit_code $status
  if test -f "$wt_cd_file"
    set -l dir (cat "$wt_cd_file")
    rm -f "$wt_cd_file"
    test -d "$dir"; and cd "$dir"
  end
  return $exit_code
end`,
    },
  };

  return configs[shell] || null;
}

export function isWrapperInstalled() {
  // Check if we're running through the wrapper
  // The wrapper would need to set this env var
  return process.env.WT_WRAPPER === '1';
}

export function checkWrapperInRcFile() {
  const config = getShellConfig();
  if (!config) return { installed: false, reason: 'unknown-shell' };

  if (!existsSync(config.rcFile)) {
    return { installed: false, reason: 'no-rc-file', rcFile: config.rcFile };
  }

  try {
    const content = readFileSync(config.rcFile, 'utf-8');
    if (content.includes('wt-cli') || content.includes('__WT_CD__')) {
      return { installed: true, rcFile: config.rcFile };
    }
    return { installed: false, reason: 'not-configured', rcFile: config.rcFile };
  } catch {
    return { installed: false, reason: 'read-error', rcFile: config.rcFile };
  }
}

export async function setupCommand() {
  showMiniLogo();
  heading(`${icons.sparkles} Shell Setup`);

  const shell = detectShell();
  const config = getShellConfig();

  if (shell === 'unknown' || !config) {
    warning(`Could not detect your shell type`);
    info(`SHELL environment variable: ${process.env.SHELL || 'not set'}`);
    spacer();
    console.log(`  ${colors.muted('Please manually add the shell wrapper to your shell config.')}`);
    console.log(`  ${colors.muted('See:')} ${colors.path('https://github.com/jhorst11/wt#shell-integration')}`);
    spacer();
    return;
  }

  success(`Detected shell: ${colors.primary(config.name)}`);
  info(`Config file: ${colors.path(config.rcFile)}`);
  spacer();

  const status = checkWrapperInRcFile();

  if (status.installed) {
    success(`Shell integration is already installed! ${icons.check}`);
    spacer();
    info(`If directory jumping isn't working, try restarting your terminal`);
    info(`or run: ${colors.primary(`source ${config.rcFile}`)}`);
    spacer();
    return;
  }

  // Not installed - offer to install
  divider();
  spacer();

  console.log(`  ${colors.muted('To enable directory jumping (wt go, wt home), we need to')}`);
  console.log(`  ${colors.muted('add a small shell function to your')} ${colors.path(config.rcFile)}`);
  spacer();

  try {
    const action = await select({
      message: 'How would you like to proceed?',
      choices: [
        {
          name: `${icons.sparkles}  Auto-install (append to ${config.rcFile})`,
          value: 'auto',
          description: 'Recommended - automatically adds the integration',
        },
        {
          name: `${icons.info}  Show me the code to copy`,
          value: 'show',
          description: 'Display the code so you can add it manually',
        },
        {
          name: `${colors.muted(icons.cross + '  Skip for now')}`,
          value: 'skip',
        },
      ],
      theme: { prefix: icons.tree },
    });

    if (action === 'auto') {
      await autoInstall(config);
    } else if (action === 'show') {
      showManualInstructions(config);
    } else {
      info('Skipped. You can run `wt setup` anytime to configure shell integration.');
      spacer();
    }
  } catch (err) {
    if (err instanceof ExitPromptError) {
      spacer();
      info('Cancelled');
      spacer();
      return;
    }
    throw err;
  }
}

async function autoInstall(config) {
  spacer();

  try {
    appendFileSync(config.rcFile, '\n' + config.wrapper + '\n');
    success(`Added shell integration to ${colors.path(config.rcFile)}`);
    spacer();

    console.log(`  ${icons.rocket} ${colors.primary('Almost done!')} Run this to activate:`);
    spacer();
    console.log(`     ${colors.secondary(`source ${config.rcFile}`)}`);
    spacer();
    console.log(`  ${colors.muted('Or just restart your terminal.')}`);
    spacer();
  } catch (err) {
    error(`Failed to write to ${config.rcFile}`);
    error(err.message);
    spacer();
    showManualInstructions(config);
  }
}

function showManualInstructions(config) {
  spacer();
  console.log(`  ${colors.muted('Add this to')} ${colors.path(config.rcFile)}${colors.muted(':')}`);
  spacer();
  divider();
  console.log(colors.secondary(config.wrapper));
  divider();
  spacer();
  console.log(`  ${colors.muted('Then run:')} ${colors.primary(`source ${config.rcFile}`)}`);
  spacer();
}

// Helper to show a gentle nudge if wrapper isn't set up
export function showCdHint(path) {
  // Check if we're running through the shell wrapper with a cd file
  const cdFile = process.env.WT_CD_FILE;
  if (cdFile && isWrapperInstalled()) {
    // Write path to temp file for shell wrapper to read
    try {
      writeFileSync(cdFile, path);
    } catch {
      // Fall through to show manual instructions
    }
    return;
  }

  // Fall back to checking rc file
  const status = checkWrapperInRcFile();

  if (status.installed) {
    // Wrapper is in rc file but not active - show path
    spacer();
    console.log(`  ${icons.rocket} ${colors.muted('Switching to:')} ${colors.path(path)}`);
    spacer();
  } else {
    // No wrapper - show a friendly message instead
    spacer();
    console.log(`  ${icons.rocket} ${colors.muted('Run:')} ${colors.primary(`cd "${path}"`)}`);
    spacer();
    console.log(`  ${colors.muted(`Tip: Run`)} ${colors.secondary('wt setup')} ${colors.muted('to enable auto-navigation')}`);
    spacer();
  }
}

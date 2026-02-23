import { select, confirm } from '@inquirer/prompts';
import { ExitPromptError } from '@inquirer/core';
import { homedir, platform } from 'os';
import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { spawn } from 'child_process';
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
import type { ShellConfig, WrapperStatus } from './types.js';

// Shell detection
export function detectShell(): 'zsh' | 'bash' | 'fish' | 'unknown' {
  const shell = process.env.SHELL || '';

  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('bash')) return 'bash';
  if (shell.includes('fish')) return 'fish';
  if (process.env.FISH_VERSION) return 'fish';
  if (process.env.ZSH_VERSION) return 'zsh';
  if (process.env.BASH_VERSION) return 'bash';

  return 'unknown';
}

export function getShellConfig(): ShellConfig | null {
  const shell = detectShell();
  const home = homedir();

  const configs: Record<string, ShellConfig> = {
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

export function isWrapperInstalled(): boolean {
  // Check if we're running through the wrapper
  // The wrapper would need to set this env var
  return process.env.WT_WRAPPER === '1';
}

export function checkWrapperInRcFile(): WrapperStatus {
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

export async function setupCommand(): Promise<void> {
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

async function autoInstall(config: ShellConfig): Promise<void> {
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
    const errorMessage = err instanceof Error ? err.message : String(err);
    error(`Failed to write to ${config.rcFile}`);
    error(errorMessage);
    spacer();
    showManualInstructions(config);
  }
}

function showManualInstructions(config: ShellConfig): void {
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

/**
 * Resolve the macOS application name from the TERM_PROGRAM env var.
 * TERM_PROGRAM values vary (e.g. "iTerm.app", "ghostty", "WezTerm", "Apple_Terminal").
 * We map them to the actual app name macOS recognizes for `open -a`.
 */
function resolveTerminalAppName(): string | null {
  const termProgram = process.env.TERM_PROGRAM || '';
  if (!termProgram) return null;

  // Well-known mappings where TERM_PROGRAM doesn't match the app name
  const knownMappings: Record<string, string> = {
    'Apple_Terminal': 'Terminal',
    'iTerm.app': 'iTerm',
  };

  if (knownMappings[termProgram]) return knownMappings[termProgram];

  // For most modern terminals (Ghostty, WezTerm, Alacritty, Kitty, Rio, etc.)
  // TERM_PROGRAM is already the app name or close enough.
  // Capitalize first letter in case it's lowercase (e.g. "ghostty" -> "Ghostty")
  return termProgram.charAt(0).toUpperCase() + termProgram.slice(1);
}

export interface OpenTerminalOptions {
  /** Optional command to execute after cd-ing to the directory */
  command?: string;
  /** Optional title to set for the terminal tab/window */
  title?: string;
}

/**
 * Generate escape sequence to set terminal title.
 * Uses OSC 0 (icon name and window title) for maximum compatibility.
 */
function setTitleSequence(title: string): string {
  // Escape special characters in title for shell (single quotes)
  const escapedTitle = title.replace(/'/g, "'\\''");
  // OSC 0 sets both icon name and window title
  // Use echo -e with proper escaping (works in bash/zsh)
  return `echo -e '\\033]0;${escapedTitle}\\007'`;
}

/**
 * Generate escape sequence to set working directory context.
 * Uses OSC 7 so new tabs/windows open in the same directory.
 * Supported by Terminal.app, iTerm2, and many other modern terminals.
 */
function setWorkingDirectorySequence(absolutePath: string): string {
  // Get hostname (fallback to 'localhost' if not available)
  const hostname = process.env.HOSTNAME || 'localhost';
  // Encode the path for file:// URL (escape special characters)
  const encodedPath = absolutePath.replace(/'/g, "'\\''");
  // OSC 7 format: ESC ] 7 ; file://hostname/path BEL
  return `echo -e '\\033]7;file://${hostname}${encodedPath}\\007'`;
}

/**
 * Open a new terminal window in the specified directory.
 *
 * Generic approach: detect the current terminal app and open a new window in it,
 * rather than hardcoding each terminal. Falls back to `open -a Terminal` on macOS.
 *
 * macOS: Uses `open -n -a <AppName>` to launch a new instance, then sends
 *        `cd <path>` via AppleScript System Events keystrokes.
 * Linux: Uses common terminal CLI flags or x-terminal-emulator.
 * Windows: Uses Windows Terminal or cmd fallback.
 *
 * @param path - Directory to open in the new terminal
 * @param options - Optional settings including a command to run after opening
 */
export function openTerminalWindow(path: string, options: OpenTerminalOptions = {}): void {
  const plat = platform();

  // Ensure path is absolute
  const absolutePath = resolve(path);
  const escapedPath = absolutePath.replace(/"/g, '\\"').replace(/'/g, "'\\''");
  const command = options.command;
  const title = options.title;

  try {
    let child;

    if (plat === 'darwin') {
      child = openTerminalMacOS(absolutePath, escapedPath, command, title);
    } else if (plat === 'linux') {
      child = openTerminalLinux(absolutePath, escapedPath, command, title);
    } else if (plat === 'win32') {
      child = openTerminalWindows(absolutePath, command, title);
    }

    // Unref the child process so it can run independently
    if (child) {
      child.on('error', () => {
        // Silently handle spawn errors
      });
      child.unref();
    }
  } catch {
    // Silently fail - opening terminal windows is a nice-to-have feature
    // The user can still navigate manually
  }
}

/**
 * Open a new terminal tab in the specified directory.
 *
 * Opens a new tab in the current terminal window rather than a new window.
 * Falls back to opening a new window if tab support is not available.
 *
 * @param path - Directory to open in the new tab
 * @param options - Optional settings including a command to run after opening
 */
export function openTerminalTab(path: string, options: OpenTerminalOptions = {}): void {
  const plat = platform();

  // Ensure path is absolute
  const absolutePath = resolve(path);
  const escapedPath = absolutePath.replace(/"/g, '\\"').replace(/'/g, "'\\''");
  const command = options.command;
  const title = options.title;

  try {
    let child;

    if (plat === 'darwin') {
      child = openTerminalTabMacOS(absolutePath, escapedPath, command, title);
    } else if (plat === 'linux') {
      child = openTerminalTabLinux(absolutePath, escapedPath, command, title);
    } else if (plat === 'win32') {
      child = openTerminalTabWindows(absolutePath, command, title);
    }

    // Unref the child process so it can run independently
    if (child) {
      child.on('error', () => {
        // Silently handle spawn errors
      });
      child.unref();
    }
  } catch {
    // Silently fail - opening terminal tabs is a nice-to-have feature
    // The user can still navigate manually
  }
}

function openTerminalMacOS(absolutePath: string, escapedPath: string, command?: string, title?: string) {
  const appName = resolveTerminalAppName();

  // Build the command sequence: cd to directory, set working directory context, set title, then optionally run command
  const cdCmd = `cd '${escapedPath}'`;
  const wdCmd = setWorkingDirectorySequence(absolutePath);
  const titleCmd = title ? `${setTitleSequence(title)}` : '';
  const parts = [cdCmd, wdCmd];
  if (titleCmd) parts.push(titleCmd);
  if (command) parts.push(command);
  const fullCmd = parts.join(' && ');

  // Terminal.app has a unique AppleScript API - use it when detected
  if (appName === 'Terminal') {
    return spawn('osascript', [
      '-e',
      `tell application "Terminal"
        do script "${fullCmd}"
        activate
      end tell`,
    ], { detached: true, stdio: 'ignore' });
  }

  // iTerm2 has a rich AppleScript API - use it for the best experience
  if (appName === 'iTerm') {
    return spawn('osascript', [
      '-e',
      `tell application "iTerm2"
        tell current window
          create tab with default profile
          tell current session of current tab
            write text "${fullCmd}"
          end tell
        end tell
      end tell`,
    ], { detached: true, stdio: 'ignore' });
  }

  // Ghostty supports --working-directory and -e flags via `open -na Ghostty.app`
  if (appName === 'Ghostty') {
    const args = ['-na', 'Ghostty.app', '--args', `--working-directory=${absolutePath}`];

    return spawn('open', args, { detached: true, stdio: 'ignore' });
  }

  // WezTerm supports start --cwd
  if (appName === 'WezTerm') {
    const args = ['start', '--cwd', absolutePath];
    if (command) {
      args.push('--', 'bash', '-c', command);
    }
    return spawn('wezterm', args, { detached: true, stdio: 'ignore' });
  }

  // Kitty supports --directory
  if (appName === 'Kitty') {
    const args = ['--single-instance', '--directory', absolutePath];
    if (command) {
      args.push('bash', '-c', command);
    }
    return spawn('kitty', args, { detached: true, stdio: 'ignore' });
  }

  // Alacritty supports --working-directory
  if (appName === 'Alacritty') {
    const args = ['--working-directory', absolutePath];
    if (command) {
      args.push('-e', 'bash', '-c', command);
    }
    return spawn('alacritty', args, { detached: true, stdio: 'ignore' });
  }

  // Generic approach for other macOS terminals:
  // Use AppleScript keystroke simulation as fallback
  if (appName) {
    return spawn('osascript', [
      '-e',
      `tell application "${appName}" to activate
      delay 0.3
      tell application "System Events"
        tell process "${appName}"
          keystroke "n" using command down
          delay 0.5
          keystroke "${fullCmd}"
          key code 36
        end tell
      end tell`,
    ], { detached: true, stdio: 'ignore' });
  }

  // Last resort: open Terminal.app
  return spawn('osascript', [
    '-e',
    `tell application "Terminal"
      do script "${fullCmd}"
      activate
    end tell`,
  ], { detached: true, stdio: 'ignore' });
}

function openTerminalLinux(absolutePath: string, escapedPath: string, command?: string, title?: string) {
  const shell = process.env.SHELL || 'bash';

  // Build command sequence: cd to directory, set working directory context, set title, optionally run command, then exec shell
  const cdCmd = `cd '${escapedPath}'`;
  const wdCmd = setWorkingDirectorySequence(absolutePath);
  const titleCmd = title ? setTitleSequence(title) : '';
  const parts = [cdCmd, wdCmd];
  if (titleCmd) parts.push(titleCmd);
  if (command) parts.push(command);
  const cmdSequence = parts.join(' && ') + `; exec ${shell}`;

  // Terminals with --working-directory need a different approach for commands
  // Use -e flag to execute command sequence instead
  const getArgs = (term: string): string[] => {
    if (command) {
      // When running a command, use -e to execute the full sequence
      switch (term) {
        case 'gnome-terminal': return ['--', shell, '-c', cmdSequence];
        case 'konsole': return ['-e', shell, '-c', cmdSequence];
        case 'xfce4-terminal': return ['-e', `${shell} -c "${cmdSequence}"`];
        case 'terminator': return ['-e', `${shell} -c "${cmdSequence}"`];
        case 'tilix': return ['-e', `${shell} -c "${cmdSequence}"`];
        case 'alacritty': return ['-e', shell, '-c', cmdSequence];
        case 'kitty': return [shell, '-c', cmdSequence];
        case 'wezterm': return ['start', '--cwd', absolutePath, '--', shell, '-c', command];
        default: return ['-e', `${shell} -c "${cmdSequence}"`];
      }
    } else {
      // No command - use --working-directory where supported
      switch (term) {
        case 'gnome-terminal': return ['--working-directory', absolutePath];
        case 'konsole': return ['--workdir', absolutePath];
        case 'xfce4-terminal': return ['--working-directory', absolutePath];
        case 'terminator': return ['--working-directory', absolutePath];
        case 'tilix': return ['-w', absolutePath];
        case 'alacritty': return ['--working-directory', absolutePath];
        case 'kitty': return ['-d', absolutePath];
        case 'wezterm': return ['start', '--cwd', absolutePath];
        default: return ['-e', `${shell} -c "cd '${escapedPath}' && exec ${shell}"`];
      }
    }
  };

  const terminals = [
    'x-terminal-emulator', 'gnome-terminal', 'konsole', 'xfce4-terminal',
    'terminator', 'tilix', 'alacritty', 'kitty', 'wezterm', 'xterm',
  ];

  for (const term of terminals) {
    try {
      const args = term === 'x-terminal-emulator' || term === 'xterm'
        ? ['-e', `${shell} -c "${cmdSequence}"`]
        : getArgs(term);
      const child = spawn(term, args, { detached: true, stdio: 'ignore' });
      child.on('error', () => { /* try next */ });
      child.unref();
      return child;
    } catch {
      // Try next terminal
    }
  }

  return null;
}

function openTerminalWindows(absolutePath: string, command?: string, title?: string) {
  const cdCmd = `cd /d "${absolutePath}"`;
  const titleCmd = title ? `title ${title.replace(/[&|<>]/g, '')}` : '';
  const parts = [cdCmd];
  if (titleCmd) parts.push(titleCmd);
  if (command) parts.push(command);
  const cmdSequence = parts.join(' && ');

  if (process.env.WT_SESSION) {
    // Windows Terminal
    if (command) {
      return spawn('wt.exe', ['-d', absolutePath, 'cmd', '/k', command], { detached: true, stdio: 'ignore' });
    }
    return spawn('wt.exe', ['-d', absolutePath], { detached: true, stdio: 'ignore' });
  }
  // Fallback to cmd
  return spawn('cmd.exe', ['/c', 'start', 'cmd', '/k', cmdSequence], { detached: true, stdio: 'ignore' });
}

function openTerminalTabMacOS(absolutePath: string, escapedPath: string, command?: string, title?: string) {
  const appName = resolveTerminalAppName();

  // Build the command sequence: cd to directory, set working directory context, set title, then optionally run command
  const cdCmd = `cd '${escapedPath}'`;
  const wdCmd = setWorkingDirectorySequence(absolutePath);
  const titleCmd = title ? `${setTitleSequence(title)}` : '';
  const parts = [cdCmd, wdCmd];
  if (titleCmd) parts.push(titleCmd);
  if (command) parts.push(command);
  const fullCmd = parts.join(' && ');

  // Terminal.app - open new tab
  if (appName === 'Terminal') {
    return spawn('osascript', [
      '-e',
      `tell application "Terminal"
        if not (exists window 1) then
          do script "${fullCmd}"
        else
          tell application "System Events" to tell process "Terminal" to keystroke "t" using command down
          delay 0.3
          do script "${fullCmd}" in window 1
        end if
        activate
      end tell`,
    ], { detached: true, stdio: 'ignore' });
  }

  // iTerm2 - already opens tabs by default, same as window function
  if (appName === 'iTerm') {
    return spawn('osascript', [
      '-e',
      `tell application "iTerm2"
        tell current window
          create tab with default profile
          tell current session of current tab
            write text "${fullCmd}"
          end tell
        end tell
      end tell`,
    ], { detached: true, stdio: 'ignore' });
  }

  // WezTerm - open new tab
  if (appName === 'WezTerm') {
    const args = ['start', '--cwd', absolutePath];
    if (command) {
      args.push('--', 'bash', '-c', command);
    }
    return spawn('wezterm', args, { detached: true, stdio: 'ignore' });
  }

  // Kitty - open new tab (uses --single-instance to reuse existing window)
  if (appName === 'Kitty') {
    const args = ['--single-instance', '--directory', absolutePath];
    if (command) {
      args.push('bash', '-c', command);
    }
    return spawn('kitty', args, { detached: true, stdio: 'ignore' });
  }

  // Ghostty - open new tab using AppleScript (Ghostty doesn't have CLI tab support)
  if (appName === 'Ghostty') {
    return spawn('osascript', [
      '-e',
      `tell application "Ghostty" to activate
      delay 0.3
      tell application "System Events"
        tell process "Ghostty"
          keystroke "t" using command down
          delay 0.5
          keystroke "${fullCmd}"
          key code 36
        end tell
      end tell`,
    ], { detached: true, stdio: 'ignore' });
  }

  // Alacritty - doesn't support tabs natively, fall back to window
  if (appName === 'Alacritty') {
    const args = ['--working-directory', absolutePath];
    if (command) {
      args.push('-e', 'bash', '-c', command);
    }
    return spawn('alacritty', args, { detached: true, stdio: 'ignore' });
  }

  // Generic approach: try to open tab with Cmd+T
  if (appName) {
    return spawn('osascript', [
      '-e',
      `tell application "${appName}" to activate
      delay 0.3
      tell application "System Events"
        tell process "${appName}"
          keystroke "t" using command down
          delay 0.5
          keystroke "${fullCmd}"
          key code 36
        end tell
      end tell`,
    ], { detached: true, stdio: 'ignore' });
  }

  // Fallback: open tab in Terminal.app
  return spawn('osascript', [
    '-e',
    `tell application "Terminal"
      if not (exists window 1) then
        do script "${fullCmd}"
      else
        tell application "System Events" to tell process "Terminal" to keystroke "t" using command down
        delay 0.3
        do script "${fullCmd}" in window 1
      end if
      activate
    end tell`,
  ], { detached: true, stdio: 'ignore' });
}

function openTerminalTabLinux(absolutePath: string, escapedPath: string, command?: string, title?: string) {
  const shell = process.env.SHELL || 'bash';

  // Build command sequence: cd to directory, set working directory context, set title, optionally run command, then exec shell
  const cdCmd = `cd '${escapedPath}'`;
  const wdCmd = setWorkingDirectorySequence(absolutePath);
  const titleCmd = title ? setTitleSequence(title) : '';
  const parts = [cdCmd, wdCmd];
  if (titleCmd) parts.push(titleCmd);
  if (command) parts.push(command);
  const cmdSequence = parts.join(' && ') + `; exec ${shell}`;

  // Most Linux terminals open tabs when using --working-directory in an existing instance
  // We'll try to open tabs for terminals that support it
  const getTabArgs = (term: string): string[] | null => {
    if (command) {
      // When running a command, use -e to execute the full sequence
      switch (term) {
        case 'gnome-terminal': return ['--tab', '--working-directory', absolutePath, '--', shell, '-c', cmdSequence];
        case 'konsole': return ['--new-tab', '--workdir', absolutePath, '-e', shell, '-c', cmdSequence];
        case 'xfce4-terminal': return ['--tab', '--working-directory', absolutePath, '-e', `${shell} -c "${cmdSequence}"`];
        case 'terminator': return ['--new-tab', '--working-directory', absolutePath, '-e', `${shell} -c "${cmdSequence}"`];
        case 'tilix': return ['-w', absolutePath, '-e', `${shell} -c "${cmdSequence}"`];
        case 'kitty': return ['--single-instance', '-d', absolutePath, shell, '-c', cmdSequence];
        case 'wezterm': return ['start', '--cwd', absolutePath, '--', shell, '-c', command];
        default: return null;
      }
    } else {
      // No command - use tab flags with --working-directory
      switch (term) {
        case 'gnome-terminal': return ['--tab', '--working-directory', absolutePath];
        case 'konsole': return ['--new-tab', '--workdir', absolutePath];
        case 'xfce4-terminal': return ['--tab', '--working-directory', absolutePath];
        case 'terminator': return ['--new-tab', '--working-directory', absolutePath];
        case 'tilix': return ['-w', absolutePath];
        case 'kitty': return ['--single-instance', '-d', absolutePath];
        case 'wezterm': return ['start', '--cwd', absolutePath];
        default: return null;
      }
    }
  };

  const terminals = [
    'gnome-terminal', 'konsole', 'xfce4-terminal', 'terminator', 'tilix', 'kitty', 'wezterm',
  ];

  for (const term of terminals) {
    try {
      const args = getTabArgs(term);
      if (!args) continue;
      const child = spawn(term, args, { detached: true, stdio: 'ignore' });
      child.on('error', () => { /* try next */ });
      child.unref();
      return child;
    } catch {
      // Try next terminal
    }
  }

  // Fallback: try opening a new window (better than nothing)
  return openTerminalLinux(absolutePath, escapedPath, command, title);
}

function openTerminalTabWindows(absolutePath: string, command?: string, title?: string) {
  // Windows Terminal supports tabs natively via wt.exe
  if (process.env.WT_SESSION) {
    // Windows Terminal - open new tab
    const args = ['-d', absolutePath];
    if (title) {
      args.push('-t', title);
    }
    if (command) {
      args.push('cmd', '/k', command);
    }
    return spawn('wt.exe', args, { detached: true, stdio: 'ignore' });
  }
  
  // For cmd.exe, we can't really open tabs, so fall back to window
  return openTerminalWindows(absolutePath, command, title);
}

// Helper to show a gentle nudge if wrapper isn't set up
export function showCdHint(path: string): void {
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
    console.log(`  ${icons.rocket} ${colors.muted('Run:')} ${colors.primary(`wt go`)} ${colors.muted('or')} ${colors.primary(`cd "${path}"`)}`);
    spacer();
    console.log(`  ${colors.muted(`Tip: Run`)} ${colors.secondary('wt setup')} ${colors.muted('to enable auto-navigation')}`);
    spacer();
  }
}

// Config types
export interface Config {
  projectsDir?: string;
  worktreesDir?: string;
  branchPrefix?: string;
  hooks?: Record<string, string[]>;
  worktreeColors?: Record<string, string>;
  colorPalette?: string[];
  /** Command to execute in new terminal windows when using --open flag (e.g., "claude" to launch Claude Code) */
  openCommand?: string;
}

// Git types
export interface Branch {
  name: string;
  isCurrent?: boolean;
  isRemote?: boolean;
  type?: 'local' | 'remote';
  fullName?: string;
}

export interface Worktree {
  name: string;
  path: string;
  branch: string;
  isMain?: boolean;
  bare?: boolean;
  detached?: boolean;
}

export interface BranchResult {
  created: boolean;
  source: 'local' | 'remote' | 'new' | 'updated-from-remote';
}

export interface WorktreeResult {
  success: boolean;
  path?: string;
  branch?: string;
  branchCreated?: boolean;
  branchSource?: string;
  error?: string;
}

export interface HookResult {
  command: string;
  success: boolean;
  error?: string;
}

// Command options
export interface CommandOptions {
  verbose?: boolean;
}

export interface WorktreeInfo {
  name: string;
  branch: string;
  color?: string | null;
}

// Shell config types
export interface ShellConfig {
  name: string;
  rcFile: string;
  wrapper: string;
}

export interface WrapperStatus {
  installed: boolean;
  reason?: 'unknown-shell' | 'no-rc-file' | 'not-configured' | 'read-error';
  rcFile?: string;
}

// Hook options
export interface HookOptions {
  verbose?: boolean;
  onCommandStart?: (command: string, index: number, total: number) => void;
}

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { homedir } from 'os';
import { once } from 'events';
import type { Config, HookResult, HookOptions } from './types.js';

const CONFIG_DIR = '.wt';
const CONFIG_FILE = 'config.json';
const WORKTREE_COLORS_FILE = 'worktree-colors.json';

/** Distinct hex colors (with #) for worktree tab/UI; cycle through for unique assignment. */
export const WORKTREE_COLORS_PALETTE: readonly string[] = [
  '#E53935', '#D81B60', '#8E24AA', '#5E35B1', '#3949AB', '#1E88E5', '#039BE5', '#00ACC1',
  '#00897B', '#43A047', '#7CB342', '#C0CA33', '#FDD835', '#FFB300', '#FB8C00', '#F4511E',
];

function getWorktreeColorsPath(repoRoot: string): string {
  return join(repoRoot, CONFIG_DIR, WORKTREE_COLORS_FILE);
}

/**
 * Load worktree name → hex color map from repo's .wt/worktree-colors.json.
 */
export function loadWorktreeColors(repoRoot: string): Record<string, string> {
  const path = getWorktreeColorsPath(repoRoot);
  try {
    const raw = readFileSync(path, 'utf8');
    const data = JSON.parse(raw) as unknown;
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      const out: Record<string, string> = {};
      for (const [name, hex] of Object.entries(data)) {
        // Filter out numeric keys (Object.entries converts them to strings, but we want to exclude them)
        if (typeof name === 'string' && !/^\d+$/.test(name) && typeof hex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(hex)) {
          out[name] = hex;
        }
      }
      return out;
    }
  } catch {
    // file missing or invalid
  }
  return {};
}

/**
 * Save worktree name → hex color map to repo's .wt/worktree-colors.json.
 */
export function saveWorktreeColors(repoRoot: string, mapping: Record<string, string>): void {
  const dir = join(repoRoot, CONFIG_DIR);
  const path = getWorktreeColorsPath(repoRoot);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(mapping, null, 2) + '\n', 'utf8');
  } catch {
    // ignore write errors (e.g. read-only repo)
  }
}

/**
 * Assign a unique color to a new worktree. Checks config overrides first, then
 * uses first palette color not used by existing worktrees.
 * Persists and returns the hex color (e.g. "#E53935").
 */
export function assignWorktreeColor(repoRoot: string, worktreeName: string): string {
  const current = loadWorktreeColors(repoRoot);

  // Check if already assigned
  let hex: string | undefined = current[worktreeName];
  if (hex) return hex;

  // Check config override - use repoRoot as cwd to ensure we find repo-level configs
  const config = resolveConfig(repoRoot, repoRoot);
  if (config.worktreeColors?.[worktreeName]) {
    hex = config.worktreeColors[worktreeName];
    current[worktreeName] = hex;
    saveWorktreeColors(repoRoot, current);
    return hex;
  }

  // Auto-assign from palette (prefer custom palette if configured)
  const palette = config.colorPalette || [...WORKTREE_COLORS_PALETTE];
  const usedColors = new Set(Object.values(current));

  for (const c of palette) {
    if (!usedColors.has(c)) {
      hex = c;
      break;
    }
  }

  hex = hex || palette[usedColors.size % palette.length];
  current[worktreeName] = hex;
  saveWorktreeColors(repoRoot, current);
  return hex;
}

/**
 * Get the assigned hex color for a worktree, or null if none.
 */
export function getWorktreeColor(repoRoot: string, worktreeName: string): string | null {
  const current = loadWorktreeColors(repoRoot);
  return current[worktreeName] ?? null;
}

/**
 * Remove a worktree's color assignment so the color can be reused.
 */
export function removeWorktreeColor(repoRoot: string, worktreeName: string): void {
  const current = loadWorktreeColors(repoRoot);
  if (worktreeName in current) {
    delete current[worktreeName];
    saveWorktreeColors(repoRoot, current);
  }
}

/**
 * Load configuration from .wt/config.json or config.json at the given directory.
 * Tries .wt/config.json first (for repo/directory configs), then config.json (for global configs).
 * Returns an object with defaults for any missing fields.
 */
export function loadConfig(dirPath: string): Config {
  const configPaths = [
    join(dirPath, CONFIG_DIR, CONFIG_FILE),  // .wt/config.json (for repo/directory)
    join(dirPath, CONFIG_FILE),               // config.json (for global config dir)
  ];
  const defaults: Config = {
    projectsDir: undefined,
    worktreesDir: undefined,
    branchPrefix: undefined,
    hooks: {},
    worktreeColors: {},
    colorPalette: undefined,
  };

  let raw: string | undefined;
  for (const configPath of configPaths) {
    try {
      raw = readFileSync(configPath, 'utf8');
      break;
    } catch {
      // Try next path
    }
  }

  if (!raw) {
    return defaults;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return defaults;
  }

  const parsedObj = parsed as Record<string, unknown>;
  const result: Config = { ...defaults };

  if (typeof parsedObj.projectsDir === 'string') {
    result.projectsDir = parsedObj.projectsDir;
  }

  if (typeof parsedObj.worktreesDir === 'string') {
    result.worktreesDir = parsedObj.worktreesDir;
  }

  if (typeof parsedObj.branchPrefix === 'string') {
    result.branchPrefix = parsedObj.branchPrefix;
  }

  if (typeof parsedObj.hooks === 'object' && parsedObj.hooks !== null && !Array.isArray(parsedObj.hooks)) {
    for (const [hookName, commands] of Object.entries(parsedObj.hooks)) {
      if (Array.isArray(commands) && commands.every((c) => typeof c === 'string')) {
        result.hooks![hookName] = commands;
      }
    }
  }

  if (typeof parsedObj.worktreeColors === 'object' && parsedObj.worktreeColors !== null && !Array.isArray(parsedObj.worktreeColors)) {
    result.worktreeColors = {};
    for (const [name, hex] of Object.entries(parsedObj.worktreeColors)) {
      if (typeof name === 'string' && typeof hex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(hex)) {
        result.worktreeColors[name] = hex;
      }
    }
  }

  if (Array.isArray(parsedObj.colorPalette)) {
    const validColors = parsedObj.colorPalette.filter((hex: unknown): hex is string =>
      typeof hex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(hex)
    );
    if (validColors.length > 0) {
      result.colorPalette = validColors;
    }
  }

  return result;
}

/**
 * Find all config files from global to cwd within repo boundaries.
 * Walks up from cwd to repoRoot, collecting all .wt/config.json paths.
 */
function findConfigFiles(cwd: string, repoRoot: string, globalConfigPath: string = join(homedir(), '.wt', CONFIG_FILE)): string[] {
  const paths: string[] = [];

  // Add global config if it exists
  try {
    readFileSync(globalConfigPath, 'utf8');
    paths.push(globalConfigPath);
  } catch {
    // Global config doesn't exist, that's fine
  }

  // Build list of directories from repoRoot down to cwd
  // Normalize paths for comparison
  const normalizedCwd = cwd.replace(/\/$/, '');
  const normalizedRepoRoot = repoRoot.replace(/\/$/, '');

  if (!normalizedCwd.startsWith(normalizedRepoRoot)) {
    // cwd is outside repo root, skip walking
    return paths;
  }

  // Collect config paths from repoRoot up to cwd
  const configPaths: string[] = [];

  // Start at repoRoot
  let current = normalizedRepoRoot;
  const parts = normalizedCwd.slice(normalizedRepoRoot.length).split('/').filter(Boolean);

  // Add repo root config
  const repoConfigPath = join(normalizedRepoRoot, CONFIG_DIR, CONFIG_FILE);
  try {
    readFileSync(repoConfigPath, 'utf8');
    configPaths.push(repoConfigPath);
  } catch {
    // No config at repo root
  }

  // Add configs for each directory down to cwd
  for (const part of parts) {
    current = join(current, part);
    const configPath = join(current, CONFIG_DIR, CONFIG_FILE);
    try {
      readFileSync(configPath, 'utf8');
      configPaths.push(configPath);
    } catch {
      // No config at this directory
    }
  }

  return paths.concat(configPaths);
}

/**
 * Merge multiple config objects with last-wins strategy.
 * For scalar fields, last defined value wins.
 * For hooks object, merge all hook definitions.
 */
function mergeConfigs(configs: Config[]): Config {
  const result: Config = {
    projectsDir: undefined,
    worktreesDir: undefined,
    branchPrefix: undefined,
    hooks: {},
    worktreeColors: {},
    colorPalette: undefined,
  };

  for (const config of configs) {
    if (config.projectsDir !== undefined) {
      result.projectsDir = config.projectsDir;
    }
    if (config.worktreesDir !== undefined) {
      result.worktreesDir = config.worktreesDir;
    }
    if (config.branchPrefix !== undefined) {
      result.branchPrefix = config.branchPrefix;
    }
    if (config.hooks && typeof config.hooks === 'object') {
      if (!result.hooks) result.hooks = {};
      for (const [hookName, commands] of Object.entries(config.hooks)) {
        if (Array.isArray(commands)) {
          result.hooks[hookName] = commands;
        }
      }
    }
    if (config.worktreeColors && typeof config.worktreeColors === 'object') {
      if (!result.worktreeColors) result.worktreeColors = {};
      Object.assign(result.worktreeColors, config.worktreeColors);
    }
    if (config.colorPalette !== undefined) {
      result.colorPalette = config.colorPalette;
    }
  }

  return result;
}

/**
 * Resolve hierarchical config by walking up from cwd to repoRoot.
 * Returns merged config with defaults for any missing fields.
 */
export function resolveConfig(cwd: string = process.cwd(), repoRoot: string, globalConfigPath?: string): Config {
  const defaults: Required<Pick<Config, 'projectsDir' | 'worktreesDir' | 'branchPrefix' | 'hooks'>> = {
    projectsDir: join(homedir(), 'projects'),
    worktreesDir: join(homedir(), 'projects', 'worktrees'),
    branchPrefix: '',
    hooks: {},
  };

  // Determine the effective global config path
  const effectiveGlobalConfigPath = globalConfigPath || join(homedir(), '.wt', CONFIG_FILE);

  // Find all config files from global to cwd
  const configPaths = findConfigFiles(cwd, repoRoot, effectiveGlobalConfigPath);

  // Load each config file by extracting the directory path
  const configs = configPaths.map((path) => {
    // For global config, extract the directory containing it
    if (path === effectiveGlobalConfigPath) {
      const globalConfigDir = path.endsWith(CONFIG_FILE)
        ? path.slice(0, path.lastIndexOf('/'))
        : path;
      return loadConfig(globalConfigDir);
    }
    // For other configs at /path/.wt/config.json, directory is /path
    const dirPath = path.slice(0, path.lastIndexOf('/.wt'));
    return loadConfig(dirPath);
  });

  // Merge configs
  const merged = mergeConfigs(configs);

  // Apply defaults for missing fields
  return {
    projectsDir: merged.projectsDir ?? defaults.projectsDir,
    worktreesDir: merged.worktreesDir ?? defaults.worktreesDir,
    branchPrefix: merged.branchPrefix ?? defaults.branchPrefix,
    hooks: merged.hooks ?? defaults.hooks,
    worktreeColors: merged.worktreeColors ?? {},
    colorPalette: merged.colorPalette,
  };
}

const HOOK_TIMEOUT_MS = 300_000; // 5 minutes per command

/**
 * Run hook commands sequentially. Each command runs with cwd set to `wtPath`
 * and receives WT_SOURCE, WT_BRANCH, and WT_PATH as environment variables.
 *
 * Returns an array of { command, success, error? } results.
 * Hook failures are non-fatal — they produce warnings but don't throw.
 */
export async function runHooks(
  hookName: string,
  config: Config,
  context: { source: string; path: string; branch: string; name?: string; color?: string | null },
  options: HookOptions = {}
): Promise<HookResult[]> {
  const commands = config.hooks?.[hookName];
  if (!commands || commands.length === 0) return [];

  const { verbose = false, onCommandStart } = options;
  const total = commands.length;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    WT_SOURCE: context.source,
    WT_BRANCH: context.branch,
    WT_PATH: context.path,
    ...(context.name !== undefined && { WT_NAME: context.name }),
    ...(context.color !== undefined && context.color !== null && { WT_COLOR: context.color }),
  };

  const results: HookResult[] = [];

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    if (typeof onCommandStart === 'function') {
      onCommandStart(cmd, i + 1, total);
    }

    const child = spawn(cmd, [], {
      shell: true,
      cwd: context.path,
      env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    const stderrChunks: Buffer[] = [];
    if (verbose) {
      child.stdout?.pipe(process.stdout);
      child.stderr?.on('data', (chunk: Buffer) => {
        process.stderr.write(chunk);
        stderrChunks.push(chunk);
      });
    } else {
      child.stdout?.on('data', () => {}); // consume to avoid blocking the child
      child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    }

    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
    }, HOOK_TIMEOUT_MS);

    try {
      const [code, signal] = (await once(child, 'exit')) as [number | null, NodeJS.Signals | null];
      clearTimeout(timeoutId);
      if (code === 0 && !signal) {
        results.push({ command: cmd, success: true });
      } else {
        const stderr = Buffer.concat(stderrChunks).toString().trim();
        const detail = stderr || (signal ? `Killed by ${signal}` : `Exited with code ${code}`);
        results.push({ command: cmd, success: false, error: detail });
      }
    } catch (err) {
      clearTimeout(timeoutId);
      const stderr = Buffer.concat(stderrChunks).toString().trim();
      const errorMessage = err instanceof Error ? err.message : String(err);
      results.push({ command: cmd, success: false, error: stderr || errorMessage });
    }
  }

  return results;
}

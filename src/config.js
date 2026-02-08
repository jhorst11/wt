import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { homedir } from 'os';
import { once } from 'events';

const CONFIG_DIR = '.wt';
const CONFIG_FILE = 'config.json';
const WORKTREE_COLORS_FILE = 'worktree-colors.json';

/** Distinct hex colors (with #) for worktree tab/UI; cycle through for unique assignment. */
export const WORKTREE_COLORS_PALETTE = [
  '#E53935', '#D81B60', '#8E24AA', '#5E35B1', '#3949AB', '#1E88E5', '#039BE5', '#00ACC1',
  '#00897B', '#43A047', '#7CB342', '#C0CA33', '#FDD835', '#FFB300', '#FB8C00', '#F4511E',
];

function getWorktreeColorsPath(repoRoot) {
  return join(repoRoot, CONFIG_DIR, WORKTREE_COLORS_FILE);
}

/**
 * Load worktree name → hex color map from repo's .wt/worktree-colors.json.
 * @returns {Record<string, string>}
 */
export function loadWorktreeColors(repoRoot) {
  const path = getWorktreeColorsPath(repoRoot);
  try {
    const raw = readFileSync(path, 'utf8');
    const data = JSON.parse(raw);
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      const out = {};
      for (const [name, hex] of Object.entries(data)) {
        if (typeof name === 'string' && typeof hex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(hex)) {
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
export function saveWorktreeColors(repoRoot, mapping) {
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
export function assignWorktreeColor(repoRoot, worktreeName) {
  const current = loadWorktreeColors(repoRoot);

  // Check if already assigned
  let hex = current[worktreeName];
  if (hex) return hex;

  // Check config override
  const config = resolveConfig(process.cwd(), repoRoot);
  if (config.worktreeColors?.[worktreeName]) {
    hex = config.worktreeColors[worktreeName];
    current[worktreeName] = hex;
    saveWorktreeColors(repoRoot, current);
    return hex;
  }

  // Auto-assign from palette (prefer custom palette if configured)
  const palette = config.colorPalette || WORKTREE_COLORS_PALETTE;
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
export function getWorktreeColor(repoRoot, worktreeName) {
  const current = loadWorktreeColors(repoRoot);
  return current[worktreeName] ?? null;
}

/**
 * Remove a worktree's color assignment so the color can be reused.
 */
export function removeWorktreeColor(repoRoot, worktreeName) {
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
export function loadConfig(dirPath) {
  const configPaths = [
    join(dirPath, CONFIG_DIR, CONFIG_FILE),  // .wt/config.json (for repo/directory)
    join(dirPath, CONFIG_FILE),               // config.json (for global config dir)
  ];
  const defaults = {
    projectsDir: undefined,
    worktreesDir: undefined,
    branchPrefix: undefined,
    hooks: {},
    worktreeColors: {},
    colorPalette: undefined,
  };

  let raw;
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

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return defaults;
  }

  const result = { ...defaults };

  if (typeof parsed.projectsDir === 'string') {
    result.projectsDir = parsed.projectsDir;
  }

  if (typeof parsed.worktreesDir === 'string') {
    result.worktreesDir = parsed.worktreesDir;
  }

  if (typeof parsed.branchPrefix === 'string') {
    result.branchPrefix = parsed.branchPrefix;
  }

  if (typeof parsed.hooks === 'object' && parsed.hooks !== null && !Array.isArray(parsed.hooks)) {
    for (const [hookName, commands] of Object.entries(parsed.hooks)) {
      if (Array.isArray(commands) && commands.every((c) => typeof c === 'string')) {
        result.hooks[hookName] = commands;
      }
    }
  }

  if (typeof parsed.worktreeColors === 'object' && parsed.worktreeColors !== null && !Array.isArray(parsed.worktreeColors)) {
    for (const [name, hex] of Object.entries(parsed.worktreeColors)) {
      if (typeof name === 'string' && typeof hex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(hex)) {
        result.worktreeColors[name] = hex;
      }
    }
  }

  if (Array.isArray(parsed.colorPalette)) {
    const validColors = parsed.colorPalette.filter(hex =>
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
 *
 * @param {string} cwd - Current working directory
 * @param {string} repoRoot - Git repository root
 * @param {string} [globalConfigPath] - Path to global config (default: ~/.wt/config.json)
 * @returns {string[]} Array of config file paths (global first)
 */
function findConfigFiles(cwd, repoRoot, globalConfigPath = join(homedir(), '.wt', CONFIG_FILE)) {
  const paths = [];

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
  const configPaths = [];

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
 *
 * @param {Object[]} configs - Array of config objects (least specific first)
 * @returns {Object} Merged config
 */
function mergeConfigs(configs) {
  const result = {
    projectsDir: undefined,
    worktreesDir: undefined,
    branchPrefix: undefined,
    hooks: {},
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
      for (const [hookName, commands] of Object.entries(config.hooks)) {
        result.hooks[hookName] = commands;
      }
    }
  }

  return result;
}

/**
 * Resolve hierarchical config by walking up from cwd to repoRoot.
 * Returns merged config with defaults for any missing fields.
 *
 * @param {string} [cwd] - Current working directory (default: process.cwd())
 * @param {string} repoRoot - Git repository root
 * @param {string} [globalConfigPath] - Override global config path (for testing)
 * @returns {Object} Resolved config with all fields
 */
export function resolveConfig(cwd = process.cwd(), repoRoot, globalConfigPath) {
  const defaults = {
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
    hooks: merged.hooks,
  };
}

const HOOK_TIMEOUT_MS = 300_000; // 5 minutes per command

/**
 * Run hook commands sequentially. Each command runs with cwd set to `wtPath`
 * and receives WT_SOURCE, WT_BRANCH, and WT_PATH as environment variables.
 *
 * Options:
 * - verbose: if true, stream stdout/stderr to the terminal; if false, suppress output and only report results.
 * - onCommandStart(cmd, index, total): called before each command (e.g. to update a spinner).
 *
 * Returns an array of { command, success, error? } results.
 * Hook failures are non-fatal — they produce warnings but don't throw.
 */
export async function runHooks(hookName, config, { source, path: wtPath, branch, name: wtName, color: wtColor }, options = {}) {
  const commands = config.hooks?.[hookName];
  if (!commands || commands.length === 0) return [];

  const { verbose = false, onCommandStart } = options;
  const total = commands.length;

  const env = {
    ...process.env,
    WT_SOURCE: source,
    WT_BRANCH: branch,
    WT_PATH: wtPath,
    ...(wtName !== undefined && { WT_NAME: wtName }),
    ...(wtColor !== undefined && wtColor !== null && { WT_COLOR: wtColor }),
  };

  const results = [];

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    if (typeof onCommandStart === 'function') {
      onCommandStart(cmd, i + 1, total);
    }

    const child = spawn(cmd, [], {
      shell: true,
      cwd: wtPath,
      env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    const stderrChunks = [];
    if (verbose) {
      child.stdout.pipe(process.stdout);
      child.stderr.on('data', (chunk) => {
        process.stderr.write(chunk);
        stderrChunks.push(chunk);
      });
    } else {
      child.stdout.on('data', () => {}); // consume to avoid blocking the child
      child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    }

    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
    }, HOOK_TIMEOUT_MS);

    try {
      const [code, signal] = await once(child, 'exit');
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
      results.push({ command: cmd, success: false, error: stderr || err.message });
    }
  }

  return results;
}

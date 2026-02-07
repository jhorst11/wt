import { readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { homedir } from 'os';

const CONFIG_DIR = '.wt';
const CONFIG_FILE = 'config.json';

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

/**
 * Run hook commands sequentially. Each command runs with cwd set to `wtPath`
 * and receives WT_SOURCE, WT_BRANCH, and WT_PATH as environment variables.
 *
 * Returns an array of { command, success, error? } results.
 * Hook failures are non-fatal — they produce warnings but don't throw.
 */
export function runHooks(hookName, config, { source, path: wtPath, branch }) {
  const commands = config.hooks?.[hookName];
  if (!commands || commands.length === 0) return [];

  const env = {
    ...process.env,
    WT_SOURCE: source,
    WT_BRANCH: branch,
    WT_PATH: wtPath,
  };

  const results = [];

  for (const cmd of commands) {
    try {
      execSync(cmd, {
        cwd: wtPath,
        env,
        stdio: 'pipe',
        timeout: 300_000, // 5 minute timeout per command
      });
      results.push({ command: cmd, success: true });
    } catch (err) {
      results.push({ command: cmd, success: false, error: err.message });
    }
  }

  return results;
}

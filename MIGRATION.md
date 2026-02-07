# Migration Guide: Environment Variables → Config Files

wt-cli has moved from environment variable configuration to hierarchical config files, following modern CLI conventions like ESLint and Prettier.

## What Changed

**Before:** wt-cli was configured via environment variables

```bash
export W_PROJECTS_DIR="$HOME/projects"
export W_WORKTREES_DIR="$HOME/projects/worktrees"
export W_DEFAULT_BRANCH_PREFIX="username/"
```

**After:** wt-cli is configured via `.wt/config.json` files

```json
{
  "projectsDir": "$HOME/projects",
  "worktreesDir": "$HOME/projects/worktrees",
  "branchPrefix": "username/"
}
```

## Migration Steps

### 1. Find Your Current Configuration

Check your shell configuration files for environment variables:

```bash
# Bash
cat ~/.bashrc | grep "W_PROJECTS_DIR\|W_WORKTREES_DIR\|W_DEFAULT_BRANCH_PREFIX"

# Zsh
cat ~/.zshrc | grep "W_PROJECTS_DIR\|W_WORKTREES_DIR\|W_DEFAULT_BRANCH_PREFIX"

# Fish
cat ~/.config/fish/config.fish | grep "set -gx W_PROJECTS_DIR\|set -gx W_WORKTREES_DIR\|set -gx W_DEFAULT_BRANCH_PREFIX"
```

### 2. Create Global Config

Create `~/.wt/config.json` with your settings:

```bash
mkdir -p ~/.wt
cat > ~/.wt/config.json << 'EOF'
{
  "projectsDir": "/path/to/your/projects",
  "worktreesDir": "/path/to/your/worktrees",
  "branchPrefix": "your-username/"
}
EOF
```

**Note:** If you didn't set these environment variables, wt-cli will use the defaults:
- `projectsDir`: `~/projects`
- `worktreesDir`: `~/projects/worktrees`
- `branchPrefix`: `""` (empty)

### 3. Remove Environment Variables

Remove the old environment variable exports from your shell configuration:

**Bash (~/.bashrc or ~/.bash_profile):**
```bash
# Remove or comment out these lines:
# export W_PROJECTS_DIR="$HOME/projects"
# export W_WORKTREES_DIR="$HOME/projects/worktrees"
# export W_DEFAULT_BRANCH_PREFIX=""
```

**Zsh (~/.zshrc):**
```bash
# Remove or comment out these lines:
# export W_PROJECTS_DIR="$HOME/projects"
# export W_WORKTREES_DIR="$HOME/projects/worktrees"
# export W_DEFAULT_BRANCH_PREFIX=""
```

**Fish (~/.config/fish/config.fish):**
```bash
# Remove or comment out these lines:
# set -gx W_PROJECTS_DIR "$HOME/projects"
# set -gx W_WORKTREES_DIR "$HOME/projects/worktrees"
# set -gx W_DEFAULT_BRANCH_PREFIX ""
```

### 4. Restart Your Shell

Reload your shell configuration:

```bash
# Bash
source ~/.bashrc

# Zsh
source ~/.zshrc

# Fish
source ~/.config/fish/config.fish
```

Or simply open a new terminal window.

### 5. Test Your Installation

Verify wt-cli works with the new config:

```bash
wt list
```

You should see your existing worktrees.

## Per-Repository Configuration

You can also create repo-specific configs that override the global config:

```bash
# In a specific repository
cd /path/to/my-repo
mkdir -p .wt
cat > .wt/config.json << 'EOF'
{
  "branchPrefix": "feature/",
  "hooks": {
    "post-create": ["npm install"]
  }
}
EOF
```

## Hierarchical Config Resolution

Config files are now loaded from:

1. **Global config** → `~/.wt/config.json`
2. **Repository config** → `<repo>/.wt/config.json`
3. **Directory config** → `<any-directory>/.wt/config.json`

The nearest config file wins for each field. Example:

- Global config sets `projectsDir: /home/you/code`
- Repo config sets `branchPrefix: feature/`
- When working in the repo, both settings are active
- A subdirectory config can override either setting

## Benefits of the New System

✅ **Modern conventions** - Follows ESLint, Prettier, and other modern CLI tools
✅ **Per-repository customization** - No shell config needed
✅ **Team sharing** - Commit `.wt/config.json` to repos for shared settings
✅ **Hierarchical control** - Override configs at any directory level
✅ **Cleaner shell config** - No environment variable pollution
✅ **Better IDE integration** - Config files are easier for tools to discover

## Troubleshooting

### "No config found"

If wt-cli isn't using your config:

1. Verify the file exists: `ls -la ~/.wt/config.json`
2. Check file format: `cat ~/.wt/config.json` (should be valid JSON)
3. Verify paths are absolute: Use full paths, not `~` in JSON

### "Still using old environment variables"

If wt-cli still seems to use old environment variables, try:

1. Open a fresh terminal window (not sourcing old configs)
2. Check with `echo $W_PROJECTS_DIR` (should be empty)
3. Remove environment variables completely from shell config

### "Path errors after migration"

If paths changed between the old and new setup:

1. Update `~/.wt/config.json` with correct paths
2. Ensure `projectsDir` and `worktreesDir` have enough disk space
3. Check that paths are readable and writable: `ls -ld /path/to/projects`

## Need Help?

For more information on config options, see the [Configuration](README.md#configuration) section in the README.

Report issues at: https://github.com/anthropics/wt-cli/issues

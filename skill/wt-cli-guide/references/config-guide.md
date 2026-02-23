# Configuration Guide

## Config File Hierarchy

Config files are loaded in order of specificity. The nearest config file takes precedence.

```
Global (~/.wt/config.json)
  ↓ overridden by
Repository (<repo>/.wt/config.json)
  ↓ overridden by
Directory (<any-directory>/.wt/config.json)
```

This allows global defaults while supporting per-repo and per-directory overrides.

## Configuration Options

### `projectsDir` (string)
**Default:** `~/projects`

Directory where main repositories live. This helps `wt` locate your repositories.

```json
{
  "projectsDir": "$HOME/code"
}
```

### `worktreesDir` (string)
**Default:** `~/projects/worktrees`

Directory where worktrees are created. Should be outside your repositories to avoid conflicts.

```json
{
  "worktreesDir": "$HOME/code/worktrees"
}
```

### `branchPrefix` (string)
**Default:** `""`

Prefix automatically added to new branch names. Useful for team workflows (e.g., "username/", "team-").

```json
{
  "branchPrefix": "john/"
}
```

When creating a worktree, if you name it `feature-login`, the actual branch will be `john/feature-login`.

### `hooks.post-create` (string[])
**Default:** `[]`

Shell commands executed immediately after worktree creation. Useful for environment setup.

```json
{
  "hooks": {
    "post-create": [
      "npm install",
      "npm run build"
    ]
  }
}
```

**Available environment variables in hooks:**
- `WT_SOURCE` - Path to main repository
- `WT_BRANCH` - Branch name created
- `WT_PATH` - Path to new worktree (also the cwd)

**Example:** Copy `.env` from main repo to worktree:
```json
{
  "hooks": {
    "post-create": ["cp $WT_SOURCE/.env .env"]
  }
}
```

### `hooks.pre-destroy` (string[])
**Default:** `[]`

Shell commands executed before worktree removal. Useful for cleanup or validation.

```json
{
  "hooks": {
    "pre-destroy": [
      "npm run clean",
      "git push origin $WT_BRANCH"
    ]
  }
}
```

**Important:** Hook failures show warnings but don't prevent the operation. Worktree removal proceeds even if hooks fail.

### `openCommand` (string)
**Default:** none

Command to execute in new terminal windows when using `wt new --open`. This is useful for automatically opening your preferred editor or IDE.

```json
{
  "openCommand": "claude"
}
```

**Examples:**
- `"claude"` - Open Claude Code
- `"code ."` - Open VS Code in current directory
- `"cursor ."` - Open Cursor editor
- `"nvim"` - Open Neovim
- `"tmux new-session"` - Start a new tmux session

When you run `wt new feature-x --open`:
1. Creates the worktree
2. Opens a new terminal window in the worktree directory
3. Automatically runs the configured `openCommand`

For multiple worktrees (`wt new one two three --open`), each gets its own terminal window with the command executed.

## Example Configurations

### Global Setup for Team

`~/.wt/config.json`

```json
{
  "projectsDir": "$HOME/code",
  "worktreesDir": "$HOME/code/worktrees",
  "branchPrefix": "team/"
}
```

### Per-Repository Backend Project

`<backend-repo>/.wt/config.json`

```json
{
  "branchPrefix": "feat/",
  "hooks": {
    "post-create": [
      "npm install",
      "npm run migrate"
    ],
    "pre-destroy": [
      "npm run test"
    ]
  }
}
```

### Per-Directory Development Environment

For specific directories needing custom behavior:

`<monorepo>/packages/api/.wt/config.json`

```json
{
  "branchPrefix": "api/",
  "hooks": {
    "post-create": [
      "pnpm install",
      "pnpm build"
    ]
  }
}
```

### AI-Assisted Development Setup

Open Claude Code automatically when creating worktrees:

`~/.wt/config.json`

```json
{
  "projectsDir": "$HOME/code",
  "worktreesDir": "$HOME/code/worktrees",
  "openCommand": "claude"
}
```

Now `wt new feature-x --open` will:
1. Create the worktree
2. Open a new terminal
3. Launch Claude Code in that directory

## Environment Variable Expansion

Config values support environment variable expansion using `$HOME` or `$VAR` syntax:

```json
{
  "projectsDir": "$HOME/code",
  "worktreesDir": "$HOME/dev/branches"
}
```

## Loading Strategy

When `wt` runs, it:

1. Loads global config from `~/.wt/config.json`
2. Searches up from current directory for `.wt/config.json` files
3. Merges configs, with nearest taking precedence
4. Uses sensible defaults for missing values

This means you can:
- Set global defaults once
- Override per-repository if needed
- Override per-directory for special cases
- Mix and match without duplication

## Common Patterns

### Development Team with Prefix

**Global:**
```json
{
  "branchPrefix": "myteam/"
}
```

All branches automatically get the `myteam/` prefix, helping team organization.

### Frontend Project with Build Step

```json
{
  "hooks": {
    "post-create": [
      "npm install",
      "npm run build"
    ]
  }
}
```

Ensures worktree is ready immediately after creation.

### Database Migration Projects

```json
{
  "hooks": {
    "post-create": [
      "npm install",
      "npm run migrate -- latest"
    ]
  }
}
```

Automatically runs pending migrations in new worktrees.

### CI/CD Integration

```json
{
  "hooks": {
    "pre-destroy": [
      "npm run test",
      "git push origin $WT_BRANCH"
    ]
  }
}
```

Validates and pushes changes before removing worktree.

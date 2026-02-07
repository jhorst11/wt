# 🌳 wt-cli

A beautiful, interactive CLI for managing git worktrees.

![Demo](https://via.placeholder.com/800x400?text=wt-cli+Demo)

## Features

- ✨ **Interactive menus** - Create, list, and remove worktrees with ease
- 🌿 **Smart branch handling** - Create from current branch, local branches, or remote branches
- 🚀 **Quick navigation** - Jump between worktrees and back to home
- 🎨 **Beautiful UI** - Modern CLI experience with colors, emojis, and spinners

## Installation

### Global Install (Recommended)

```bash
npm install -g .
```

Or if you want to install from the repo:

```bash
cd /path/to/wt
npm install
npm link
```

### Shell Integration

To enable the `cd` functionality (jumping to worktrees), add this to your `.bashrc` or `.zshrc`:

```bash
# For wt-cli directory changing support
source /path/to/wt/shell/wt.sh
```

Without this, the tool will show you the path to copy instead of auto-navigating.

## Usage

### Interactive Mode (Default)

Just run `wt` with no arguments to open the interactive menu:

```bash
wt
```

### Commands

| Command | Description |
|---------|-------------|
| `wt` | Open interactive menu |
| `wt new` | Create a new worktree |
| `wt list` | List all worktrees for current repo |
| `wt remove` | Remove a worktree |
| `wt go [name]` | Jump to a worktree |
| `wt home` | Return to the main repository |

### Creating a Worktree

```bash
wt new
```

You'll be prompted to:
1. Choose what to base your worktree on (current branch, local branch, remote branch, or new)
2. Enter a name for your worktree
3. Confirm creation

### Configuration

wt-cli uses hierarchical config files to support user-wide and per-directory customization.

#### Config File Locations

Config files are loaded from (lowest to highest priority):

1. **Global config:** `~/.wt/config.json` - applies to all repositories
2. **Repository config:** `<repo>/.wt/config.json` - overrides global config for this repo
3. **Directory config:** `<any-directory>/.wt/config.json` - overrides parent configs for this directory and subdirectories

The nearest config file wins for each setting.

#### Global Config Example

Create `~/.wt/config.json`:

```json
{
  "projectsDir": "$HOME/code",
  "worktreesDir": "$HOME/code/worktrees",
  "branchPrefix": "username/"
}
```

#### Repository Config Example

Create `<repo>/.wt/config.json`:

```json
{
  "branchPrefix": "feature/",
  "hooks": {
    "post-create": [
      "npm install",
      "cp $WT_SOURCE/.env .env"
    ]
  }
}
```

#### Config Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `projectsDir` | `string` | `~/projects` | Directory where main repositories live |
| `worktreesDir` | `string` | `~/projects/worktrees` | Directory where worktrees are created |
| `branchPrefix` | `string` | `""` | Prefix for branch names (e.g., "username/") |
| `hooks.post-create` | `string[]` | `[]` | Shell commands to run after creating a worktree |

**Hook environment variables** (available in hook commands):

| Variable | Description |
|----------|-------------|
| `WT_SOURCE` | Absolute path to the main repository |
| `WT_BRANCH` | Branch name of the new worktree |
| `WT_PATH` | Absolute path to the new worktree (also the cwd) |

Hook commands run with cwd set to the new worktree path. If a hook command fails, a warning is shown but the worktree creation still succeeds.

## How It Works

wt-cli creates worktrees in a structured directory based on your project:

```
~/projects/
├── my-repo/              # Your main repository
│   └── ...
└── worktrees/
    └── my-repo/          # Worktrees for my-repo
        ├── feature-a/
        └── feature-b/
```

## License

MIT

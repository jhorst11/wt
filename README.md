# 🌳 wt-cli

[![npm version](https://img.shields.io/npm/v/@jhorst11/wt)](https://www.npmjs.com/package/@jhorst11/wt)

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
    ],
    "pre-destroy": [
      "npm run clean"
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
| `hooks.pre-destroy` | `string[]` | `[]` | Shell commands to run before removing a worktree |

**Hook environment variables** (available in hook commands):

| Variable | Description |
|----------|-------------|
| `WT_SOURCE` | Absolute path to the main repository |
| `WT_BRANCH` | Branch name of the worktree |
| `WT_PATH` | Absolute path to the worktree (also the cwd) |
| `WT_NAME` | Worktree name (directory name, e.g. `feature-a`) |
| `WT_COLOR` | Hex color assigned to this worktree (e.g. `#E53935`), for UI/theming |

Each new worktree is assigned a unique color from a fixed palette (stored in `<repo>/.wt/worktree-colors.json`). In supported terminals (iTerm2, WezTerm, Ghostty, Kitty, Windows Terminal, Alacritty), the tab color is set to that worktree's color when you create a worktree or run `wt go <name>`. Colors also appear as indicators (●) throughout the CLI UI.

Hook commands run with cwd set to the worktree path. To run a Node script that lives in the main repo (e.g. `<repo>/.wt/scripts/foo.js`), use `WT_SOURCE`: `node "$WT_SOURCE/.wt/scripts/foo.js"` — `./scripts/foo.js` would look inside the worktree, not the main repo. If a hook command fails, a warning is shown but the operation continues (worktree creation still succeeds; worktree removal still proceeds after pre-destroy).

#### Worktree Color Configuration

Override automatic colors or provide a custom palette:

**Manual color assignment** (`.wt/config.json`):

```json
{
  "worktreeColors": {
    "feature-auth": "#FF5733",
    "feature-payments": "#33FF57"
  }
}
```

**Custom color palette** (`.wt/config.json`):

```json
{
  "colorPalette": [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A",
    "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E2"
  ]
}
```

Colors are stored per-repository in `.wt/worktree-colors.json` and support hierarchical configuration (global → repo → directory overrides).

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

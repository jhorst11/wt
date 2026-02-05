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

You can configure wt-cli via environment variables:

```bash
# Directory where your projects live
export W_PROJECTS_DIR="$HOME/projects"

# Directory where worktrees will be created
export W_WORKTREES_DIR="$HOME/projects/worktrees"

# Optional prefix for branch names (e.g., "username")
export W_DEFAULT_BRANCH_PREFIX=""
```

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

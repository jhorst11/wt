---
name: wt CLI Guide
description: Interactive git worktree management. Use this skill when users want to work with git worktrees or the wt CLI tool for: (1) Installation and setup, (2) Creating and managing worktrees, (3) Configuring project directories and branch prefixes, (4) Setting up shell integration for directory navigation, (5) Understanding workflows and best practices, or (6) Troubleshooting worktree operations.
---

# wt CLI Guide

`wt` is an interactive CLI for managing git worktrees. It provides beautiful terminal UI for creating, listing, navigating, and merging worktrees without dealing with raw git commands.

## Quick Start

### Installation

```bash
# Global install (recommended)
npm install -g @jhorst11/wt

# Or from source
cd /path/to/wt && npm link
```

### Basic Usage

```bash
wt              # Open interactive menu
wt new          # Create a new worktree
wt list         # List all worktrees
wt go [name]    # Jump to a worktree
wt home         # Return to main repo
wt remove       # Remove a worktree
```

## Core Concepts

### Worktree Structure

`wt` organizes worktrees in a hierarchical structure:

```
~/projects/
├── my-repo/           # Main repository
└── worktrees/
    └── my-repo/       # All worktrees for this repo
        ├── feature-a/
        └── feature-b/
```

### Key Features

- **Interactive menus** - Select from branches, worktrees, and actions visually
- **Smart branch handling** - Create from current branch, local branches, remote branches, or new branches
- **Quick navigation** - Jump between worktrees with `wt go`
- **Beautiful UI** - Colors, emojis, and spinners for clear feedback
- **Shell integration** - Optional `cd` support for seamless navigation

## Configuration

Configuration uses hierarchical `.wt/config.json` files. Nearest config wins.

**Global:** `~/.wt/config.json` (applies to all repos)
**Per-repo:** `<repo>/.wt/config.json` (overrides global)
**Per-directory:** `<any-directory>/.wt/config.json` (overrides parent configs)

### Basic Config

```json
{
  "projectsDir": "$HOME/code",
  "worktreesDir": "$HOME/code/worktrees",
  "branchPrefix": "username/"
}
```

### Advanced Config with Hooks

```json
{
  "branchPrefix": "feature/",
  "hooks": {
    "post-create": ["npm install", "cp $WT_SOURCE/.env .env"],
    "pre-destroy": ["npm run clean"]
  }
}
```

For detailed configuration guide, see [config-guide.md](references/config-guide.md).

## Shell Integration

Enable automatic directory changing when using `wt go`:

```bash
# Add to ~/.bashrc or ~/.zshrc
source /path/to/wt/shell/wt.sh
```

Without shell integration, the tool shows a path to copy-paste instead. With integration, `wt go feature-x` automatically changes your directory.

## Worktree Color System

Each worktree is automatically assigned a unique color for visual identification throughout the CLI and in supported terminal emulators.

### Visual Indicators

Colors appear in multiple places:

- **CLI Output:** Colored circle indicators (●) next to worktree names in listings and prompts
- **Terminal Tabs:** Tab background color changes when you enter/exit worktrees (supported terminals)
- **Context Headers:** Current worktree shown with its color in command headers
- **Confirmations:** Color indicators in warnings and success messages

Example output:
```
🌳 worktree v2.1.0
● feature-auth → main

Found 3 worktrees:
● feature-auth
  /Users/you/projects/worktrees/my-repo/feature-auth
  🌿 feature/auth

● feature-payments
  /Users/you/projects/worktrees/my-repo/feature-payments
  🌿 feature/payments

● bugfix-login
  /Users/you/projects/worktrees/my-repo/bugfix-login
  🌿 fix/login-crash
```

### Automatic Color Assignment

Each new worktree automatically receives a unique color from a 16-color palette:

```
#E53935 (Red)      #D81B60 (Pink)     #8E24AA (Purple)   #5E35B1 (Deep Purple)
#3949AB (Indigo)   #1E88E5 (Blue)     #039BE5 (Light Blue) #00ACC1 (Cyan)
#00897B (Teal)     #43A047 (Green)    #7CB342 (Light Green) #C0CA33 (Lime)
#FDD835 (Yellow)   #FFB300 (Amber)    #FB8C00 (Orange)   #F4511E (Deep Orange)
```

When all 16 colors are used, the system cycles back to the first color (reusing freed colors).

Colors are stored in `.wt/worktree-colors.json` per repository:

```json
{
  "feature-auth": "#E53935",
  "feature-payments": "#D81B60",
  "bugfix-login": "#8E24AA"
}
```

### Supported Terminals

Terminal tab coloring works on:

- **iTerm2** (macOS) - Full support
- **WezTerm** (cross-platform) - Full support
- **Ghostty** (macOS/Linux) - Full support
- **Kitty** (macOS/Linux) - Full support
- **Windows Terminal** (Windows) - Full support
- **Alacritty** (cross-platform) - Partial support (background tint)

Unsupported terminals (VS Code, generic terminals) still show colored indicators in the CLI, but don't change tab colors.

### Manual Color Configuration

Override automatic colors in `.wt/config.json`:

```json
{
  "worktreeColors": {
    "feature-auth": "#FF5733",
    "feature-payments": "#33FF57",
    "bugfix-critical": "#0000FF"
  }
}
```

### Custom Color Palette

Provide your own color palette in `.wt/config.json`:

```json
{
  "colorPalette": [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A",
    "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E2"
  ]
}
```

Custom palettes follow the same cycling behavior when palette colors are exhausted.

### Hook Integration

The assigned color is available in hooks as the `WT_COLOR` environment variable:

```json
{
  "hooks": {
    "post-create": ["bash .wt/scripts/setup.sh"],
    "pre-destroy": ["bash .wt/scripts/cleanup.sh"]
  }
}
```

```bash
#!/bin/bash
# .wt/scripts/setup.sh

if [ -n "$WT_COLOR" ]; then
  echo "Setting up worktree with color: $WT_COLOR"
  # Use color for custom integrations
fi
```

### Current Context

Always see which worktree you're in:

- **In main repo:** Color indicators show all available worktrees
- **In a worktree:** Tab color matches and mini logo shows current worktree with its color
- **Returning home:** Run `wt home` to return to main repo and reset tab color

## Common Workflows

For step-by-step workflows and best practices, see [workflows.md](references/workflows.md).

**Quick examples:**

1. **Create and switch to a feature branch:**
   ```bash
   wt new
   # Follow interactive prompts
   wt go feature-name
   ```

2. **List all active worktrees:**
   ```bash
   wt list
   ```

3. **Clean up finished work:**
   ```bash
   wt remove
   # Select worktree to remove
   ```

## Command Reference

| Command | Description |
|---------|-------------|
| `wt` | Open interactive menu |
| `wt new` | Create a new worktree with prompts |
| `wt list` | Display all worktrees for current repo |
| `wt go [name]` | Navigate to a worktree (requires shell integration) |
| `wt home` | Return to main repository |
| `wt remove` | Interactive worktree removal |

## Hook Environment Variables

When using hooks in config, these variables are available:

| Variable | Description |
|----------|-------------|
| `WT_SOURCE` | Absolute path to main repository |
| `WT_BRANCH` | Branch name of the worktree |
| `WT_PATH` | Absolute path to the worktree (also the cwd) |
| `WT_NAME` | Worktree name (directory name, e.g., `feature-auth`) |
| `WT_COLOR` | Hex color assigned to this worktree (e.g., `#E53935`) |

Hook commands run in the worktree directory. To execute scripts from the main repo, use `$WT_SOURCE`. The `WT_COLOR` variable is useful for custom terminal integrations or logging.

## Tips

- **Branch naming:** Use the `branchPrefix` config to automatically prefix branch names (e.g., "username/")
- **Hooks:** Use `post-create` hooks to set up environments (install dependencies, copy `.env` files)
- **Navigation:** Shell integration makes moving between worktrees effortless
- **Cleanup:** Use `wt remove` with confirmation to safely delete finished worktrees

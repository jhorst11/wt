# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`wt` is an interactive CLI for managing git worktrees. It provides a beautiful terminal UI for creating, listing, navigating, and merging worktrees without dealing with raw git commands. The tool includes optional shell integration that enables automatic directory navigation.

## Development Commands

```bash
# Run the CLI locally
npm start

# Test the CLI (runs the local version)
node bin/wt.js

# Install globally for testing
npm install -g .

# Or link for development
npm link
```

## Architecture

### Core Module Separation

The codebase is organized into four distinct modules:

1. **`bin/wt.js`** - CLI entry point using Commander.js. Defines all commands and their routing.

2. **`src/git.js`** - All git operations via simple-git wrapper. Contains:
   - Repository detection and info (isGitRepo, getRepoRoot, getCurrentBranch)
   - Branch operations (getLocalBranches, getRemoteBranches, ensureBranch)
   - Worktree CRUD (createWorktree, removeWorktree, getWorktreesInBase)
   - Merge operations (mergeBranch, deleteBranch)
   - Configuration via environment variables (W_PROJECTS_DIR, W_WORKTREES_DIR, W_DEFAULT_BRANCH_PREFIX)

3. **`src/commands.js`** - User-facing command flows. Each command is an async function that:
   - Shows appropriate UI (logo/mini-logo)
   - Validates git repository
   - Orchestrates git operations with user prompts using @inquirer/prompts
   - Handles errors and displays results
   - Key commands: createWorktreeFlow, listWorktrees, removeWorktreeFlow, mergeWorktreeFlow, goHome, goToWorktree

4. **`src/ui.js`** - All UI styling and display utilities. Exports:
   - `icons` - Emoji and figure constants
   - `colors` - Chalk color theme
   - Display functions (success, error, warning, info, heading, divider, spacer)
   - Logo rendering (showLogo, showMiniLogo)

5. **`src/setup.js`** - Shell integration setup and detection:
   - Detects user's shell (bash/zsh/fish)
   - Installs wrapper function to rc files
   - Provides showCdHint() for directory navigation hints
   - Uses WT_WRAPPER and WT_CD_FILE env vars for shell communication

### Worktree Directory Structure

The tool creates worktrees in a standardized location:

```
~/projects/
├── my-repo/              # Main repository (W_PROJECTS_DIR)
└── worktrees/
    └── my-repo/          # Worktrees for my-repo (W_WORKTREES_DIR)
        ├── feature-a/
        └── feature-b/
```

Configuration is via environment variables:
- `W_PROJECTS_DIR` - Where main repos live (default: ~/projects)
- `W_WORKTREES_DIR` - Where worktrees are created (default: ~/projects/worktrees)
- `W_DEFAULT_BRANCH_PREFIX` - Optional branch prefix (e.g., "username/")

### Shell Integration Mechanism

The shell wrapper enables `cd` functionality:

1. User runs `wt go feature-x`
2. Shell wrapper sets `WT_WRAPPER=1` and `WT_CD_FILE=/tmp/wt_cd_$$`
3. Node CLI detects these env vars via `isWrapperInstalled()`
4. CLI writes target path to `WT_CD_FILE`
5. Shell wrapper reads file and executes `cd`

Without the wrapper, the tool shows copy-paste instructions instead.

## Key Design Patterns

### Error Handling
- All git operations are wrapped in try-catch
- User-friendly error messages displayed via `error()` function
- Spinners (ora) show loading state and fail gracefully

### Branch Resolution
The `ensureBranch()` function handles all branch scenarios:
- Uses existing local branch
- Fetches from remote if exists
- Updates local branch to match remote
- Creates new branch from base
- Returns metadata about what action was taken

### Interactive Flows
All commands follow this pattern:
1. Show logo/heading
2. Validate git repo with `ensureGitRepo()`
3. Gather context (branches, worktrees, current state)
4. Present choices with `select()` or `search()` prompts
5. Confirm destructive actions with `confirm()`
6. Execute with spinner feedback
7. Show results and next steps

### Type-Safe Git Operations
All git functions accept optional `cwd` parameter and use simple-git instances. This enables operations on both the current directory and remote worktrees (e.g., merging from main repo into worktree branch).

## Configuration Files

- **package.json** - ES module, bin entry point at `./bin/wt.js`, publishes bin/, src/, shell/
- **shell/wt.sh** - Bash/Zsh wrapper with tab completion (legacy, replaced by built-in setup)

## Dependencies

- `simple-git` - Git command wrapper
- `@inquirer/prompts` - Modern interactive prompts
- `commander` - CLI framework
- `chalk` - Terminal colors
- `gradient-string` - Gradient text effects
- `ora` - Loading spinners
- `figures` - Cross-platform Unicode symbols

## Publishing

The package is published to npm as `@jhorst11/wt`. Users can install with:
```bash
npm install -g @jhorst11/wt
```

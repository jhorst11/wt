# Common Workflows

This guide covers practical workflows for using `wt` effectively in different scenarios.

## Table of Contents

1. [Basic Feature Development](#basic-feature-development)
2. [Working with Remote Branches](#working-with-remote-branches)
3. [Parallel Feature Development](#parallel-feature-development)
4. [Integration with Hooks](#integration-with-hooks)
5. [Team Collaboration](#team-collaboration)

## Basic Feature Development

**Scenario:** Create an isolated feature branch and switch to it.

### Step-by-step

1. **Start from your main branch:**
   ```bash
   cd ~/code/my-repo
   git checkout main
   ```

2. **Create a new worktree:**
   ```bash
   wt new
   # Prompts:
   # - "What should the worktree be based on?" → Select "current branch (main)"
   # - "Enter a name for the worktree" → Type "feature-login"
   # - "Create worktree?" → Confirm
   ```

3. **Switch to the worktree:**
   ```bash
   wt go feature-login
   # Or without shell integration: cd ~/code/worktrees/my-repo/feature-login
   ```

4. **Start coding:**
   ```bash
   # Your code changes are isolated in this worktree
   git status
   npm start
   ```

5. **When done, go back to main:**
   ```bash
   wt home
   # cd ~/code/my-repo
   ```

6. **Clean up the worktree:**
   ```bash
   wt remove
   # Select "feature-login" and confirm
   ```

### Benefits

- Main repository stays clean and untouched
- Each feature has isolated `node_modules`, build artifacts, etc.
- Easy to switch between features with `wt go`
- No stashing or branch switching complications

## Working with Remote Branches

**Scenario:** Create a worktree from an upstream feature branch (e.g., a PR you're reviewing).

### Step-by-step

1. **Create worktree from remote:**
   ```bash
   wt new
   # Prompts:
   # - "What should the worktree be based on?" → Select "remote branch"
   # - "Select branch" → Choose "origin/someone-elses-feature"
   # - "Enter a name for the worktree" → Type "review-pr-123"
   ```

2. **Navigate to it:**
   ```bash
   wt go review-pr-123
   ```

3. **Install and test:**
   ```bash
   npm install
   npm test
   # Review code, test functionality
   ```

4. **Go back and clean up:**
   ```bash
   wt home
   wt remove  # Remove review-pr-123
   ```

### Benefits

- Test PRs without affecting your working directory
- Easy code review in isolated environment
- Remote branch changes don't interfere with your work

## Parallel Feature Development

**Scenario:** Work on multiple features simultaneously without context switching.

### Step-by-step

1. **Create multiple worktrees:**
   ```bash
   wt new  # Create feature-auth (from main)
   wt new  # Create feature-api (from main)
   wt new  # Create feature-ui (from main)
   ```

2. **Switch between them as needed:**
   ```bash
   wt go feature-auth     # Work on auth
   # ... make changes ...

   wt go feature-api      # Switch to API work
   # ... make changes ...

   wt go feature-ui       # Switch to UI work
   # ... make changes ...
   ```

3. **Each has independent state:**
   - Separate `node_modules`
   - Separate build outputs
   - Separate running servers
   - Each can have uncommitted changes

4. **List active worktrees:**
   ```bash
   wt list
   # Shows all active worktrees with status
   ```

5. **Clean up when features are done:**
   ```bash
   wt remove
   # Remove them one by one as they're merged/completed
   ```

### Benefits

- Seamless feature switching without stashing
- Each feature's dependencies installed independently
- Can run multiple dev servers in parallel
- Great for context-heavy work

## Rapid Multi-Feature Setup with Terminal Windows

**Scenario:** Instantly set up multiple parallel workstreams, each in its own terminal.

### Quick Start

Create multiple worktrees and open each in a new terminal:

```bash
wt new feature-auth feature-api feature-ui --open
```

This creates 3 worktrees in parallel and opens 3 terminal windows.

### With AI-Assisted Development

Configure Claude Code to launch automatically:

1. **Set up config (`~/.wt/config.json`):**
   ```json
   {
     "openCommand": "claude"
   }
   ```

2. **Create worktrees:**
   ```bash
   wt new feature-auth feature-api feature-ui --open
   ```

3. **Result:**
   - 3 worktrees created in parallel
   - 3 terminal windows opened
   - Claude Code launched in each one
   - Ready to start AI-assisted development on all features

### Step-by-step Example

```bash
# From main repository
cd ~/code/my-repo

# Create three worktrees with Claude Code sessions
wt new auth-refactor api-v2 new-dashboard --open

# Each terminal now has:
# - Its own directory (~/code/worktrees/my-repo/<name>)
# - Its own branch
# - Claude Code running and ready

# When done, clean up
wt remove  # Select worktrees to remove
```

### Benefits

- **Instant parallel setup** - Create multiple workstreams in seconds
- **AI on every branch** - Claude Code ready in each worktree
- **No manual navigation** - Everything opens automatically
- **Independent contexts** - Each Claude session has its own codebase state

## Integration with Hooks

**Scenario:** Automatically set up environments (install deps, migrations, etc.) when creating worktrees.

### Configuration

Create `.wt/config.json` in your repository:

```json
{
  "branchPrefix": "dev/",
  "hooks": {
    "post-create": [
      "npm install",
      "npm run build",
      "npm run seed:test"
    ],
    "pre-destroy": [
      "npm run clean"
    ]
  }
}
```

### Usage

1. **Create a worktree:**
   ```bash
   wt new
   # Prompts as normal, then automatically:
   # - npm install runs
   # - npm run build runs
   # - npm run seed:test runs
   ```

2. **Worktree is ready immediately:**
   ```bash
   wt go my-feature
   npm start  # Already has everything installed
   ```

3. **When removing:**
   ```bash
   wt remove
   # Automatically runs cleanup hooks before removal
   ```

### Advanced Hook Usage

**Copy environment files:**
```json
{
  "hooks": {
    "post-create": [
      "cp $WT_SOURCE/.env.local .env.local",
      "npm install"
    ]
  }
}
```

**Database migrations:**
```json
{
  "hooks": {
    "post-create": [
      "npm install",
      "npm run migrate -- latest",
      "npm run seed"
    ]
  }
}
```

**Push on cleanup:**
```json
{
  "hooks": {
    "pre-destroy": [
      "git push origin $WT_BRANCH"
    ]
  }
}
```

## Team Collaboration

**Scenario:** Team uses consistent naming and workflows.

### Global Setup

All team members set up global config `~/.wt/config.json`:

```json
{
  "projectsDir": "$HOME/code",
  "worktreesDir": "$HOME/code/worktrees",
  "branchPrefix": "username/"
}
```

### Repository Setup

Repository-specific config `.wt/config.json`:

```json
{
  "hooks": {
    "post-create": [
      "npm install",
      "npm run lint -- --fix"
    ],
    "pre-destroy": [
      "npm run test",
      "npm run lint"
    ]
  }
}
```

### Workflow

1. **Standard naming:** All team members use `wt new` which creates branches like `john/feature-x`, `jane/feature-y`
2. **Consistent setup:** Post-create hooks ensure all worktrees start clean (linting applied, dependencies installed)
3. **Quality gates:** Pre-destroy hooks ensure tests pass before removing worktrees
4. **Easy navigation:** `wt list` shows who's working on what

### Benefits

- Consistency across team
- Reduced onboarding friction
- Quality standards built into workflow
- Clear branch naming conventions

## Troubleshooting Tips

### Worktree won't create

**Symptom:** Error about branch existing
**Solution:** The branch might be checked out elsewhere. Use `git branch -a` to check, or `git worktree list` to see all worktrees.

### Navigation not working

**Symptom:** `wt go` doesn't change directory
**Solution:** Shell integration not installed. Add `source /path/to/wt/shell/wt.sh` to your `.bashrc` or `.zshrc`.

### Hooks not running

**Symptom:** Post-create commands aren't executing
**Solution:** Check config file location. Use `wt list` to verify current directory context.

### Worktrees scattered

**Symptom:** Worktrees in unexpected locations
**Solution:** Check `worktreesDir` config. Set it explicitly: `"worktreesDir": "$HOME/code/worktrees"`

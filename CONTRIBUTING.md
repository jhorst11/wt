# Contributing

## Commit Message Format

This project uses [Conventional Commits](https://www.conventionalcommits.org/) to enable automatic versioning and changelog generation.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Code style changes (formatting, missing semi colons, etc)
- `refactor`: Code refactoring without bug fixes or features
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `build`: Changes to build system or dependencies
- `ci`: Changes to CI configuration
- `chore`: Other changes that don't modify src or test files
- `revert`: Reverts a previous commit

### Examples

```
feat: add merge workflow command

feat(commands): add interactive branch selection

fix: resolve worktree directory creation issue

fix(config): handle missing config file gracefully

docs: update README with new configuration options

refactor: simplify git operations module

chore: update dependencies
```

### Breaking Changes

To indicate a breaking change, include `BREAKING CHANGE:` in the commit body:

```
feat: redesign configuration system

BREAKING CHANGE: Configuration now uses JSON files instead of environment variables.
See MIGRATION.md for migration instructions.
```

Breaking changes will trigger a major version bump.

### Scope (Optional)

The scope is optional and should be the area of the codebase affected:
- `commands`: Command-line interface
- `config`: Configuration system
- `git`: Git operations
- `ui`: User interface components
- `setup`: Shell integration setup

### Subject

- Use imperative, present tense: "add" not "added" nor "adds"
- Don't capitalize first letter
- No period (.) at the end
- Maximum 100 characters

### Validation

Commit messages are automatically validated:
- **Local**: Git hook validates commits before they're created
- **CI**: GitHub Actions validates all commits in pull requests

If your commit message doesn't follow the format, you'll see an error with examples of the correct format.

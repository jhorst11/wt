#!/bin/bash

# wt CLI Quick Setup Script
# This script helps set up wt-cli with shell integration and basic configuration

set -e

echo "🌳 wt CLI Quick Setup"
echo "====================="
echo ""

# Detect shell
SHELL_NAME=$(basename "$SHELL")
case "$SHELL_NAME" in
  bash)
    RC_FILE="$HOME/.bashrc"
    ;;
  zsh)
    RC_FILE="$HOME/.zshrc"
    ;;
  fish)
    RC_FILE="$HOME/.config/fish/config.fish"
    echo "⚠️  Fish shell detected. Manual setup may be needed."
    echo "   See: https://github.com/jhorst11/wt#shell-integration"
    exit 0
    ;;
  *)
    echo "❌ Unknown shell: $SHELL_NAME"
    exit 1
    ;;
esac

echo "✓ Detected shell: $SHELL_NAME ($RC_FILE)"
echo ""

# Check if already installed
if grep -q "wt.sh" "$RC_FILE" 2>/dev/null; then
  echo "✓ Shell integration already installed"
else
  # Ask for wt path
  echo "Where is wt installed? (press Enter for current directory or provide path)"
  read -p "Path [current]: " WT_PATH
  WT_PATH="${WT_PATH:-.}"

  if [ ! -f "$WT_PATH/shell/wt.sh" ]; then
    echo "❌ wt.sh not found at $WT_PATH/shell/wt.sh"
    exit 1
  fi

  # Add to shell rc file
  echo ""
  echo "Adding shell integration to $RC_FILE..."
  echo "" >> "$RC_FILE"
  echo "# wt CLI shell integration" >> "$RC_FILE"
  echo "source \"$WT_PATH/shell/wt.sh\"" >> "$RC_FILE"

  echo "✓ Shell integration installed"
fi

# Create global config
if [ ! -d "$HOME/.wt" ]; then
  mkdir -p "$HOME/.wt"
  echo "✓ Created ~/.wt directory"
fi

if [ ! -f "$HOME/.wt/config.json" ]; then
  echo ""
  echo "Creating global configuration..."
  echo ""

  read -p "Projects directory [$HOME/projects]: " PROJECTS_DIR
  PROJECTS_DIR="${PROJECTS_DIR:-$HOME/projects}"

  read -p "Worktrees directory [$PROJECTS_DIR/worktrees]: " WORKTREES_DIR
  WORKTREES_DIR="${WORKTREES_DIR:-$PROJECTS_DIR/worktrees}"

  read -p "Branch prefix (e.g., 'username/' or press Enter for none): " BRANCH_PREFIX

  # Create config file
  cat > "$HOME/.wt/config.json" << EOF
{
  "projectsDir": "$PROJECTS_DIR",
  "worktreesDir": "$WORKTREES_DIR",
  "branchPrefix": "$BRANCH_PREFIX"
}
EOF

  echo "✓ Global configuration created at ~/.wt/config.json"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Reload your shell: source $RC_FILE"
echo "2. Try it out: wt --help"
echo "3. Create a worktree: wt new"
echo ""
echo "Learn more: wt --help"

#!/usr/bin/env bash
# Shell wrapper for wt-cli to enable directory changing
# Add this to your .bashrc or .zshrc:
#   source /path/to/wt/shell/wt.sh

# Find the wt binary - works whether installed globally or locally
_wt_find_bin() {
  if command -v wt &>/dev/null; then
    echo "wt"
  elif [[ -f "$HOME/.npm-global/bin/wt" ]]; then
    echo "$HOME/.npm-global/bin/wt"
  elif [[ -f "$(npm root -g 2>/dev/null)/wt-cli/bin/wt.js" ]]; then
    echo "node $(npm root -g)/wt-cli/bin/wt.js"
  else
    echo "wt"
  fi
}

wt() {
  local wt_bin=$(_wt_find_bin)
  local wt_cd_file="/tmp/wt_cd_$$"

  # Clean up any old cd file
  rm -f "$wt_cd_file"

  # Run wt with env vars so it knows we can handle cd
  WT_WRAPPER=1 WT_CD_FILE="$wt_cd_file" $wt_bin "$@"
  local exit_code=$?

  # Check if wt wrote a cd path
  if [[ -f "$wt_cd_file" ]]; then
    local dir=$(cat "$wt_cd_file")
    rm -f "$wt_cd_file"
    [[ -d "$dir" ]] && cd "$dir"
  fi

  return $exit_code
}

# Tab completion for bash
if [[ -n "$BASH_VERSION" ]]; then
  _wt_completions() {
    local cur="${COMP_WORDS[COMP_CWORD]}"
    local commands="new list ls remove rm home go setup"
    COMPREPLY=($(compgen -W "$commands" -- "$cur"))
  }
  complete -F _wt_completions wt
fi

# Tab completion for zsh
if [[ -n "$ZSH_VERSION" ]]; then
  _wt_completions() {
    local commands=(
      'new:Create a new worktree'
      'list:List all worktrees'
      'ls:List all worktrees'
      'remove:Remove a worktree'
      'rm:Remove a worktree'
      'home:Return to main repo'
      'go:Jump to a worktree'
      'setup:Configure shell integration'
    )
    _describe 'command' commands
  }
  compdef _wt_completions wt
fi

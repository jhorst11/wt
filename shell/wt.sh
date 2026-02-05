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
  local output
  local exit_code
  local wt_bin=$(_wt_find_bin)

  # Run wt and capture output
  output=$($wt_bin "$@" 2>&1)
  exit_code=$?

  # Check if output contains a cd directive
  if [[ "$output" == *"__WT_CD__:"* ]]; then
    # Extract the path and print the rest
    local path=""
    while IFS= read -r line; do
      if [[ "$line" == "__WT_CD__:"* ]]; then
        path="${line#__WT_CD__:}"
      else
        echo "$line"
      fi
    done <<< "$output"

    # Change to the directory if we got a path
    if [[ -n "$path" && -d "$path" ]]; then
      cd "$path" || return 1
    fi
  else
    # Just print the output normally
    echo "$output"
  fi

  return $exit_code
}

# Tab completion for bash
if [[ -n "$BASH_VERSION" ]]; then
  _wt_completions() {
    local cur="${COMP_WORDS[COMP_CWORD]}"
    local commands="new list ls remove rm home go"
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
    )
    _describe 'command' commands
  }
  compdef _wt_completions wt
fi

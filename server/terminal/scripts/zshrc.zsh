# NexusTerm shell integration for zsh (generated, do not edit)
__nx_integration_dir="$ZDOTDIR"
ZDOTDIR="${NEXUS_USER_ZDOTDIR:-$HOME}"
[[ -f "$ZDOTDIR/.zshrc" ]] && source "$ZDOTDIR/.zshrc"

# Global startup files (e.g. macOS /etc/zshrc) ran while ZDOTDIR pointed at the integration
# directory; move history back to the user's own file if nothing else set HISTFILE.
if [[ "$HISTFILE" == "$__nx_integration_dir/.zsh_history" ]]; then
  HISTFILE="$ZDOTDIR/.zsh_history"
fi

if [[ -z "$__NEXUS_INTEGRATION_LOADED" && -n "$NEXUS_SHELL_NONCE" ]]; then
  __NEXUS_INTEGRATION_LOADED=1
  # Every marker carries a per-session secret so program output cannot forge command blocks.
  typeset -g __nx_nonce="$NEXUS_SHELL_NONCE"
  unset NEXUS_SHELL_NONCE
  autoload -Uz add-zsh-hook
  typeset -g __nx_in_cmd=0
  __nx_esc() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//$'\n'/\\n}"
    s="${s//$'\a'/}"
    s="${s//$'\e'/}"
    print -rn -- "$s"
  }
  __nx_mark() {
    printf '\e]633;%s;%s\a' "$__nx_nonce" "$1"
  }
  __nx_preexec() {
    __nx_in_cmd=1
    __nx_mark "E;$(__nx_esc "$1")"
    __nx_mark "C"
  }
  __nx_precmd() {
    local ec=$?
    if (( __nx_in_cmd )); then
      __nx_mark "D;$ec"
      __nx_in_cmd=0
    fi
    __nx_mark "W;$(__nx_esc "$PWD")"
    __nx_mark "A"
  }
  add-zsh-hook preexec __nx_preexec
  precmd_functions=(__nx_precmd $precmd_functions)
fi

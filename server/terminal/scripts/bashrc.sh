# NexusTerm shell integration for bash (generated, do not edit)
if [ -z "$__NEXUS_USER_RC_LOADED" ]; then
  __NEXUS_USER_RC_LOADED=1
  [ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"
fi

if [ -z "$__NEXUS_INTEGRATION_LOADED" ] && [ -n "$NEXUS_SHELL_NONCE" ]; then
__NEXUS_INTEGRATION_LOADED=1

# Every marker carries a per-session secret so that program output (cat, logs, remote hosts)
# cannot forge command blocks. It is removed from the environment so child processes never see it.
__nx_nonce="$NEXUS_SHELL_NONCE"
unset NEXUS_SHELL_NONCE

__nx_esc() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\a'/}"
  s="${s//$'\e'/}"
  printf '%s' "$s"
}

__nx_mark() {
  printf '\e]633;%s;%s\a' "$__nx_nonce" "$1"
}

__nx_hist_num() {
  local h
  h="$(HISTTIMEFORMAT= builtin history 1)"
  h="${h#"${h%%[![:space:]]*}"}"
  printf '%s' "${h%%[[:space:]]*}"
}

__nx_in_cmd=0
__nx_ready=0
__nx_last_hist="$(__nx_hist_num)"

__nx_start_cmd() {
  __nx_in_cmd=1
  __nx_mark "E;$(__nx_esc "$1")"
  __nx_mark "C"
}

__nx_precmd() {
  local ec=$?
  if [ "$__nx_in_cmd" = 1 ]; then
    __nx_mark "D;$ec"
    __nx_in_cmd=0
  fi
  __nx_mark "W;$(__nx_esc "$PWD")"
  __nx_mark "A"
  return $ec
}

if [ -n "${bash_preexec_imported:-}${__bp_imported:-}" ]; then
  # bash-preexec is installed (atuin, starship and others use it): register through its hooks.
  __nx_bp_preexec() { __nx_start_cmd "$1"; }
  preexec_functions+=(__nx_bp_preexec)
  precmd_functions=(__nx_precmd "${precmd_functions[@]}")
else
  __nx_preexec() {
    [ "$__nx_ready" = 1 ] || return 0
    [ -n "$COMP_LINE" ] && return 0
    # Key-binding widgets (bind -x, e.g. fzf Ctrl+T / Ctrl+R) run while editing, not as a command
    [ -n "${READLINE_POINT+x}" ] && return 0
    # Empty line or comment: the first thing to run is the prompt hook itself, so no command started
    case "$BASH_COMMAND" in
      __nx_precmd*) __nx_ready=0; return 0 ;;
    esac
    __nx_ready=0
    local h num cmd
    h="$(HISTTIMEFORMAT= builtin history 1)"
    h="${h#"${h%%[![:space:]]*}"}"
    num="${h%%[[:space:]]*}"
    cmd="${h#"$num"}"
    cmd="${cmd#"${cmd%%[![:space:]]*}"}"
    if [ -z "$num" ] || [ "$num" = "$__nx_last_hist" ]; then
      # Not added to history. ignoredups: the line repeats the previous entry, which still starts
      # with the running command. ignorespace: the entry is unrelated, use the first simple command.
      case "$cmd" in
        "$BASH_COMMAND"*) ;;
        *) cmd="$BASH_COMMAND" ;;
      esac
    fi
    __nx_last_hist="$num"
    __nx_start_cmd "$cmd"
  }
  __nx_arm() { __nx_ready=1; }

  __nx_prev_trap="$(trap -p DEBUG)"
  if [ -n "$__nx_prev_trap" ]; then
    __nx_prev_trap="${__nx_prev_trap#trap -- }"
    __nx_prev_trap="${__nx_prev_trap% DEBUG}"
    eval "__nx_prev_debug_cmd=$__nx_prev_trap"
    trap '__nx_preexec; eval "$__nx_prev_debug_cmd"' DEBUG
  else
    trap '__nx_preexec' DEBUG
  fi

  if [[ "$(declare -p PROMPT_COMMAND 2>/dev/null)" == "declare -a"* ]]; then
    PROMPT_COMMAND=(__nx_precmd "${PROMPT_COMMAND[@]}" __nx_arm)
  else
    PROMPT_COMMAND=$'__nx_precmd\n'"${PROMPT_COMMAND:-:}"$'\n__nx_arm'
  fi
fi
fi

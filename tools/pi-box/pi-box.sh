# pi-box — isolated, reproducible Pi agent using devbox
#
# Source this file in your .bashrc to enable the pi-box command:
#   source /path/to/pi-box.sh
#
# The function activates the global devbox environment and runs Pi.
# On first invocation, the init_hook installs Pi and extensions automatically.
# Pre-flight: verify Nix store is usable on Linux.
# Multi-user Nix setups use nix-daemon, so /nix need not be user-writable.
# Set PI_BOX_SKIP_NIX_CHECK=1 to bypass (used by tests).

# Package definitions — single source of truth for Pi and the default extension.
# Used by setup.sh (to generate the init_hook) and the --update handler below.
PI_BOX_PI_PKG="@earendil-works/pi-coding-agent"
PI_BOX_CTX7_PKG="@dreki-gg/pi-context7"

_die() {
  echo "Error: $1" >&2
  return 1
}

_nix_store_ok() {
  local nix_dir="${1:-${PI_BOX_NIX_DIR:-/nix}}"
  [[ "${PI_BOX_SKIP_NIX_CHECK:-}" == "1" ]] && return 0
  [[ "$(uname -s)" != "Linux" ]] && return 0

  if ! test -d "$nix_dir" 2>/dev/null; then
    _die "$nix_dir directory not found. Nix is not installed or its store is missing.
  To install Nix with multi-user support (recommended), run:
    sh <(curl -L https://nixos.org/nix/install) --daemon
  Then start and enable the nix-daemon:
    sudo systemctl enable nix-daemon && sudo systemctl start nix-daemon
  Then re-run your command." || return 1
  fi

  if ! test -w "$nix_dir" 2>/dev/null; then
    # /nix exists but is not writable — check if nix-daemon is active.
    if ! systemctl is-active --quiet nix-daemon; then
      _die "$nix_dir exists but is not writable, and nix-daemon is not active or systemctl is unavailable.
  Devbox/Nix on Linux requires the nix-daemon to be active.
  Fix:  sudo systemctl enable nix-daemon && sudo systemctl start nix-daemon
  Then re-run your command." || return 1
    fi
    # daemon is running (so it should handle store access), but /nix is still
    # not writable by the user — this is expected for a healthy multi-user setup.
    :
  fi

  return 0
}

pi-box() {
  # --help flag: print usage and exit.
  if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    cat <<'EOF'
Usage: pi-box [FLAG] [--] [PI-ARGS...]

  (no flag)     Activate the devbox environment and run Pi.
                If ./devbox.json exists, uses the project environment;
                otherwise uses the global devbox environment.
  --update      Refresh Pi and default extensions to latest versions.
                Works in both project and no-project contexts.
  --shell       Activate the devbox environment and drop into an
                interactive shell (instead of launching Pi).
                If ./devbox.json exists, runs "devbox shell";
                otherwise activates the global environment in-place.
  --help, -h    Show this message.

Environment:
  PI_BOX_SKIP_NIX_CHECK=1   Bypass the /nix store pre-flight check
                            (useful for tests or non-Linux systems).
EOF
    return 0
  fi

  # --update flag: refresh Pi and extensions to latest versions.
  # Works in both project and no-project contexts.
  if [[ "${1:-}" == "--update" ]]; then
    _nix_store_ok || return 1
    eval "$(devbox global shellenv --init-hook --recompute)" || { _die "devbox global shellenv failed. Check the output above for details."; return 1; }
    command -v pi &>/dev/null || { _die "pi not found after shellenv. If devbox reported errors above (nix permission, network, etc.), those must be fixed first.
  For nix issues: https://nixos.org/download
  For devbox setup: https://www.jetify.com/devbox/docs/installing_devbox/"; return 1; }
    npm update -g "$PI_BOX_PI_PKG" || { _die "npm update -g $PI_BOX_PI_PKG failed.
  Check your network connection and npm registry access."; return 1; }
    pi install "npm:$PI_BOX_CTX7_PKG" || { _die "pi install npm:$PI_BOX_CTX7_PKG failed.
  Check your network connection and that the pi binary is working (run: pi --version)."; return 1; }
    return
  fi

  # Project devbox.json detection: when a project-level devbox.json exists,
  # use devbox shell to enter the project environment (which layers on top
  # of the global base box) and run Pi inside it.
  if [[ -f ./devbox.json ]]; then
    _nix_store_ok || return 1
    if [[ "${1:-}" == "--shell" ]]; then
      devbox shell || { _die "devbox shell failed to enter the project environment. Check the output above for details."; return 1; }
      return
    fi
    devbox shell -- pi "$@" || { _die "devbox shell failed to launch pi in the project environment. Check the output above for details."; return 1; }
    return
  fi

  # --shell flag (no-project): activate global environment, drop into interactive shell.
  # eval runs in the current shell (not a subshell), so the devbox environment
  # (PATH, shell functions, completions from the init-hook) persists after return.
  if [[ "${1:-}" == "--shell" ]]; then
    _nix_store_ok || return 1
    eval "$(devbox global shellenv --init-hook --recompute)" || { _die "devbox global shellenv failed. Check the output above for details."; return 1; }
    echo "pi-box: devbox global environment activated. Run 'pi' to start the agent."
    return 0
  fi

  # No project devbox.json: activate global environment and run Pi.
  # Run in a subshell so devbox PATH changes don't leak into the parent shell.
  _nix_store_ok || return 1
  (
    eval "$(devbox global shellenv --init-hook --recompute)" || { _die "devbox global shellenv failed. Check the output above for details."; exit 1; }
    command -v pi &>/dev/null || { _die "pi not found after shellenv. If devbox reported errors above (nix permission, network, etc.), those must be fixed first.
  For nix issues: https://nixos.org/download
  For devbox setup: https://www.jetify.com/devbox/docs/installing_devbox/"; exit 1; }
    pi "$@"
  )
}

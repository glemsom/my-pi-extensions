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

# Path resolution for sourcing shared modules.
_PI_BOX_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$_PI_BOX_DIR/lib/preflight.sh"
source "$_PI_BOX_DIR/lib/packages.sh"

# Activate the global devbox environment. Returns 1 on failure
# with a diagnostic message. Caller decides how to handle failure
# (return vs exit) — used both from the main shell and a subshell.
_ensure_global_env() {
  eval "$(devbox global shellenv --init-hook --recompute)" || {
    _die "devbox global shellenv failed. Check the output above for details."
    return 1
  }
}

# Verify pi is on PATH after shellenv activation.
# Returns 0 if found, 1 with diagnostic if not.
_pi_must_be_installed() {
  command -v pi &>/dev/null && return 0
  _die "pi not found after shellenv. If devbox reported errors above (nix permission, network, etc.), those must be fixed first.
  For nix issues: https://nixos.org/download
  For devbox setup: https://www.jetify.com/devbox/docs/installing_devbox/"
  return 1
}

# ---- Internal dispatch functions for pi-box modes ----
# Each function handles one mode. Called by the thin pi-box() dispatcher below.

# Print usage and exit cleanly.
_pi_box_dispatch_help() {
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
}

# Refresh Pi and default extensions to latest versions.
# Intercepted before project detection so it works globally even
# when a project devbox.json is present.
_pi_box_dispatch_update() {
  _nix_store_ok || return 1
  _ensure_global_env || return 1
  _pi_must_be_installed || return 1
  npm update -g "$PI_BOX_PI_PKG" || { _die "npm update -g $PI_BOX_PI_PKG failed.
  Check your network connection and npm registry access."; return 1; }
  pi install "npm:$PI_BOX_CTX7_PKG" || { _die "pi install npm:$PI_BOX_CTX7_PKG failed.
  Check your network connection and that the pi binary is working (run: pi --version)."; return 1; }
}

# Enter an interactive devbox shell for the project environment.
_pi_box_dispatch_shell_project() {
  _nix_store_ok || return 1
  devbox shell || { _die "devbox shell failed to enter the project environment. Check the output above for details."; return 1; }
}

# Run Pi inside the project devbox environment (project environment layers
# on top of the global base box).
_pi_box_dispatch_run_project() {
  _nix_store_ok || return 1
  devbox shell -- pi "$@" || { _die "devbox shell failed to launch pi in the project environment. Check the output above for details."; return 1; }
}

# Activate the global devbox environment in-place (no subshell) and
# drop into an interactive shell. PATH changes persist after return.
_pi_box_dispatch_shell_global() {
  _nix_store_ok || return 1
  _ensure_global_env || return 1
  echo "pi-box: devbox global environment activated. Run 'pi' to start the agent."
}

# Run Pi in the global devbox environment.
# Runs in a subshell so devbox PATH changes don't leak to the parent shell.
_pi_box_dispatch_run_global() {
  _nix_store_ok || return 1
  (
    _ensure_global_env || exit 1
    _pi_must_be_installed || exit 1
    pi "$@"
  )
}

# ---- Public interface ----
# Thin dispatcher: parse the first flag and delegate to the appropriate
# internal dispatch function.
pi-box() {
  # --help: intercept, ignore remaining args.
  if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    _pi_box_dispatch_help
    return 0
  fi

  # --update: always intercept before project check so updates work globally.
  if [[ "${1:-}" == "--update" ]]; then
    _pi_box_dispatch_update
    return $?
  fi

  # Project devbox.json detection: when ./devbox.json exists the caller
  # wants the project environment (with Pi on top).
  if [[ -f ./devbox.json ]]; then
    if [[ "${1:-}" == "--shell" ]]; then
      _pi_box_dispatch_shell_project
      return $?
    fi
    _pi_box_dispatch_run_project "$@"
    return $?
  fi

  # --shell (no project devbox.json): activate global env interactively.
  if [[ "${1:-}" == "--shell" ]]; then
    _pi_box_dispatch_shell_global
    return $?
  fi

  # Default: run Pi in the global devbox environment.
  _pi_box_dispatch_run_global "$@"
}

# preflight.sh — shared pre-flight checks for pi-box scripts
#
# Sourced by pi-box.sh and setup.sh.
# Provides _die (consistent error output) and _nix_store_ok (Nix store validation).

# Print an error message to stderr.
# Usage:
#   _die "message"         # prints message, returns 1
#   _die -x N "message"    # prints message, exits with code N
# Caller decides whether to exit or return on failure.
_die() {
  local _pi_exit_code=0
  if [[ "${1:-}" == "-x" && -n "${2:-}" && "$2" =~ ^[0-9]+$ ]]; then
    _pi_exit_code="$2"
    shift 2
  fi
  echo "Error: $*" >&2
  if [[ "$_pi_exit_code" -gt 0 ]]; then
    exit "$_pi_exit_code"
  fi
  return 1
}

# Verify that the Nix store is usable on Linux.
# Arguments:
#   $1 — path to check (default: ${PI_BOX_NIX_DIR:-/nix})
# Returns 0 if the store is usable, 1 otherwise.
# Set PI_BOX_SKIP_NIX_CHECK=1 to bypass (used by tests).
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

#!/usr/bin/env bash
# Unit tests for lib/preflight.sh — _nix_store_ok and _die.
# Tests exercise all branches of the pre-flight check independently.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" || { echo "FATAL: cannot determine script directory"; exit 1; }
PREFLIGHT_SH="$SCRIPT_DIR/../lib/preflight.sh"
[[ -f "$PREFLIGHT_SH" ]] || { echo "FATAL: $PREFLIGHT_SH not found"; exit 1; }

# ---- test harness ----

PASS=0
FAIL=0

assert_exit() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$actual" -eq "$expected" ]]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc (expected exit $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local desc="$1" haystack="$2" needle="$3"
  if echo "$haystack" | grep -qF -- "$needle"; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc (output did not contain '$needle')"
    echo "  output was: $haystack"
    FAIL=$((FAIL + 1))
  fi
}

summary() {
  echo ""
  echo "Results: $PASS passed, $FAIL failed"
  if [[ "$FAIL" -gt 0 ]]; then
    exit 1
  fi
}

# ---- helpers ----

setup_test_env() {
  TEST_HOME=$(mktemp -d) || { echo "FATAL: mktemp failed" >&2; exit 2; }
  export HOME="$TEST_HOME"
  mkdir -p "$TEST_HOME/bin" || { echo "FATAL: cannot create $TEST_HOME/bin" >&2; exit 2; }

  # Fake systemctl for daemon checks
  cat > "$TEST_HOME/bin/systemctl" << 'FAKESYSTEMCTL' || { echo "FATAL: cannot write fake systemctl" >&2; exit 2; }
#!/usr/bin/env bash
if [[ "$1" == "is-active" && "$2" == "--quiet" && "$3" == "nix-daemon" ]]; then
  exit "${PI_BOX_TEST_SYSTEMCTL_EXIT_CODE:-1}"
fi
exit 1
FAKESYSTEMCTL
  chmod +x "$TEST_HOME/bin/systemctl" || { echo "FATAL: cannot chmod fake systemctl" >&2; exit 2; }

  export PATH="$TEST_HOME/bin:/usr/bin:/bin"
}

# ---- test 1: _die prints error and returns 1 ----

echo ""
echo "=== test 1: _die prints error and returns 1 ==="

source "$PREFLIGHT_SH"

OUTPUT=$(_die "some error" 2>&1)
EXIT_CODE=$?

assert_exit "_die returns 1" 1 "$EXIT_CODE"
assert_contains "_die prints error prefix" "$OUTPUT" "Error: some error"

# ---- test 2: _nix_store_ok returns 0 when nix dir exists and writable ----

echo ""
echo "=== test 2: _nix_store_ok passes with good nix dir ==="

TEST_DIR=$(mktemp -d) || { echo "FATAL: cannot create test dir" >&2; exit 2; }
OUTPUT=$(_nix_store_ok "$TEST_DIR" 2>&1)
EXIT_CODE=$?

assert_exit "writable nix dir exits 0" 0 "$EXIT_CODE"
rm -rf "$TEST_DIR"

# ---- test 3: _nix_store_ok returns 1 when nix dir missing ----

echo ""
echo "=== test 3: _nix_store_ok fails when nix dir missing ==="

MISSING_DIR=$(mktemp -u)/nonexistent
OUTPUT=$(_nix_store_ok "$MISSING_DIR" 2>&1)
EXIT_CODE=$?

assert_exit "missing nix dir exits 1" 1 "$EXIT_CODE"
assert_contains "error mentions missing dir" "$OUTPUT" "directory not found"
assert_contains "error suggests daemon install" "$OUTPUT" "--daemon"

# ---- test 4: _nix_store_ok returns 0 when PI_BOX_SKIP_NIX_CHECK=1 ----

echo ""
echo "=== test 4: _nix_store_ok passes with skip flag ==="

export PI_BOX_SKIP_NIX_CHECK=1
MISSING_DIR2=$(mktemp -u)/gone
OUTPUT=$(_nix_store_ok "$MISSING_DIR2" 2>&1)
EXIT_CODE=$?

assert_exit "skip check exits 0" 0 "$EXIT_CODE"
unset PI_BOX_SKIP_NIX_CHECK

# ---- test 5: _nix_store_ok fails when nix dir not writable and daemon down ----

echo ""
echo "=== test 5: _nix_store_ok fails when nix dir not writable, no daemon ==="

setup_test_env
trap 'rm -rf "$TEST_HOME"' EXIT

export PI_BOX_TEST_SYSTEMCTL_EXIT_CODE=1
NONWRITABLE_DIR="$TEST_HOME/nonwritable-nix"
mkdir -p "$NONWRITABLE_DIR" || { echo "FATAL: cannot create test dir" >&2; exit 2; }
chmod 555 "$NONWRITABLE_DIR" || { echo "FATAL: cannot chmod test dir" >&2; exit 2; }

source "$PREFLIGHT_SH"
OUTPUT=$(_nix_store_ok "$NONWRITABLE_DIR" 2>&1)
EXIT_CODE=$?

assert_exit "non-writable, no daemon exits 1" 1 "$EXIT_CODE"
assert_contains "error mentions not writable" "$OUTPUT" "not writable"
assert_contains "error mentions nix-daemon" "$OUTPUT" "nix-daemon"

chmod 755 "$NONWRITABLE_DIR" 2>/dev/null || true
trap - EXIT
rm -rf "$TEST_HOME"

# ---- test 6: _nix_store_ok passes when nix dir not writable but daemon running ----

echo ""
echo "=== test 6: _nix_store_ok passes with daemon even if dir not writable ==="

setup_test_env
trap 'rm -rf "$TEST_HOME"' EXIT

export PI_BOX_TEST_SYSTEMCTL_EXIT_CODE=0
NONWRITABLE_DIR2="$TEST_HOME/nonwritable-nix2"
mkdir -p "$NONWRITABLE_DIR2" || { echo "FATAL: cannot create test dir" >&2; exit 2; }
chmod 555 "$NONWRITABLE_DIR2" || { echo "FATAL: cannot chmod test dir" >&2; exit 2; }

source "$PREFLIGHT_SH"
OUTPUT=$(_nix_store_ok "$NONWRITABLE_DIR2" 2>&1)
EXIT_CODE=$?

assert_exit "non-writable with daemon exits 0" 0 "$EXIT_CODE"

chmod 755 "$NONWRITABLE_DIR2" 2>/dev/null || true
trap - EXIT
rm -rf "$TEST_HOME"

# ---- test 7: _nix_store_ok uses PI_BOX_NIX_DIR env var as default ----

echo ""
echo "=== test 7: _nix_store_ok uses PI_BOX_NIX_DIR env var ==="

CUSTOM_DIR=$(mktemp -d) || { echo "FATAL: cannot create test dir" >&2; exit 2; }
export PI_BOX_NIX_DIR="$CUSTOM_DIR"

source "$PREFLIGHT_SH"
OUTPUT=$(_nix_store_ok 2>&1)
EXIT_CODE=$?

assert_exit "env var default passes" 0 "$EXIT_CODE"
unset PI_BOX_NIX_DIR
rm -rf "$CUSTOM_DIR"

summary

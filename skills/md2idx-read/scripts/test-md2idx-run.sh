#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/../../.." && pwd)
TEST_DIR=$(mktemp -d "$REPO_ROOT/.temp/md2idx-read-test.XXXXXX")
ORIGINAL_PATH="$PATH"
TMPDIR="$TEST_DIR/tmp"
export TMPDIR

cleanup() {
  if [ -f "$TEST_DIR/stubborn.pid" ]; then
    kill "$(cat "$TEST_DIR/stubborn.pid")" 2>/dev/null || true
  fi
  rm -rf -- "$TEST_DIR"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_status() {
  local expected="$1"
  shift
  local status

  set +e
  "$@" >"$TEST_DIR/stdout" 2>"$TEST_DIR/stderr"
  status=$?
  set -e

  [ "$status" -eq "$expected" ] || fail "expected status $expected, got $status: $*"
}

INSTALLED_SCRIPT_DIR="$TEST_DIR/installed/.agents/skills/md2idx-read/scripts"
mkdir -p "$TEST_DIR/bin" "$TEST_DIR/npx-bin" "$TMPDIR" "$INSTALLED_SCRIPT_DIR"
cp "$SCRIPT_DIR/md2idx-run.sh" "$SCRIPT_DIR/md2idx-npx-runner.mjs" "$INSTALLED_SCRIPT_DIR/"
WRAPPER="$INSTALLED_SCRIPT_DIR/md2idx-run.sh"

for number in $(seq 1 200); do
  printf 'line %s\n' "$number" >>"$TEST_DIR/large.md"
done
printf '# Small\n' >"$TEST_DIR/small.md"

cat >"$TEST_DIR/bin/npx" <<'EOF'
#!/usr/bin/env bash
if [ "${FAKE_MD2IDX_FAIL:-0}" = "1" ]; then
  exit 9
fi
if [ "${FAKE_BAD_JSON:-0}" = "1" ]; then
  printf 'not json\n'
  exit 0
fi
[ "$1" = "-y" ] || exit 8
[ "$2" = "md2idx@0.3.0" ] || exit 8
printf '%s\n' '{"index":"# 0. First\n## 1. Second","sections":["# First\n\nalpha","## Second\n\nbeta"]}'
EOF
chmod +x "$TEST_DIR/bin/npx"

PATH="$TEST_DIR/bin:$ORIGINAL_PATH"
export PATH

assert_status 1 bash "$WRAPPER" "$TEST_DIR/missing.md" --index
assert_status 2 bash "$WRAPPER" "$TEST_DIR/small.md" --index

actual=$(bash "$WRAPPER" "$TEST_DIR/large.md" --index)
[ "$actual" = $'# 0. First\n## 1. Second' ] || fail "unexpected index output"

actual=$(bash "$WRAPPER" "$TEST_DIR/large.md" --sections '.sections[1]')
[ "$actual" = $'## Second\n\nbeta' ] || fail "unexpected section output"

actual=$(bash "$WRAPPER" "$TEST_DIR/large.md" --sections '.sections[0:2][]')
[ "$actual" = $'# First\n\nalpha\n## Second\n\nbeta' ] || fail "unexpected range output"

assert_status 6 bash "$WRAPPER" "$TEST_DIR/large.md" --sections '.sections['
if grep -q 'EPIPE' "$TEST_DIR/stderr"; then
  fail "invalid jq expression leaked an EPIPE"
fi

FAKE_MD2IDX_FAIL=1 assert_status 5 bash "$WRAPPER" "$TEST_DIR/large.md" --index
FAKE_BAD_JSON=1 assert_status 6 bash "$WRAPPER" "$TEST_DIR/large.md" --index
MD2IDX_TIMEOUT_SECONDS=invalid assert_status 64 bash "$WRAPPER" "$TEST_DIR/large.md" --index
MD2IDX_TIMEOUT_SECONDS=2147484 assert_status 64 bash "$WRAPPER" "$TEST_DIR/large.md" --index

cat >"$TEST_DIR/npx-bin/npx" <<'EOF'
#!/usr/bin/env bash
(trap '' TERM; while true; do sleep 1; done) &
child_pid=$!
printf '%s\n' "$child_pid" >"$FAKE_CHILD_PID_FILE"
trap 'exit 0' TERM
wait "$child_pid"
EOF
chmod +x "$TEST_DIR/npx-bin/npx"

PATH="$TEST_DIR/npx-bin:/usr/bin:/bin"
export PATH
FAKE_CHILD_PID_FILE="$TEST_DIR/stubborn.pid" MD2IDX_TIMEOUT_SECONDS=1 \
  assert_status 124 bash "$WRAPPER" "$TEST_DIR/large.md" --index
if kill -0 "$(cat "$TEST_DIR/stubborn.pid")" 2>/dev/null; then
  fail "timeout left a descendant process running"
fi

if find "$TMPDIR" -type f -print -quit | grep -q .; then
  fail "temporary JSON was not cleaned up"
fi

echo "PASS: md2idx wrapper contract"

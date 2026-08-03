#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: md2idx-run.sh <file> [--index | --sections <jq-expr>]" >&2
  echo "" >&2
  echo "Examples:" >&2
  echo "  md2idx-run.sh doc.md --index" >&2
  echo "  md2idx-run.sh doc.md --sections '.sections[2]'" >&2
  echo "  md2idx-run.sh doc.md --sections '.sections[2:5][]'" >&2
  exit 64
}

readonly MD2IDX_VERSION="0.3.0"
readonly DEFAULT_TIMEOUT_SECONDS="120"
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SOURCE_REPO_ROOT=$(cd -- "$SCRIPT_DIR/../../.." && pwd)

[ $# -lt 2 ] && usage

FILE="$1"
shift

if [ ! -f "$FILE" ]; then
  echo "ERROR: file not found: $FILE" >&2
  exit 1
fi

LINES=$(wc -l < "$FILE")
BYTES=$(wc -c < "$FILE")

if [ "$LINES" -lt 200 ] && [ "$BYTES" -lt 10240 ]; then
  echo "SMALL: ${LINES} lines, ${BYTES} bytes — use Read tool directly" >&2
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq not found" >&2
  exit 4
fi

MD2IDX_CMD=()
MD2IDX_WRITES_OUTPUT=0
if [ -f "$SOURCE_REPO_ROOT/package.json" ] \
  && [ -f "$SOURCE_REPO_ROOT/dist/cli.mjs" ] \
  && [ "$(jq -r '.name // empty' "$SOURCE_REPO_ROOT/package.json")" = "md2idx" ]; then
  MD2IDX_CMD=(node "$SOURCE_REPO_ROOT/dist/cli.mjs")
elif [ "${MD2IDX_PREFER_PATH:-0}" = "1" ] && command -v md2idx >/dev/null 2>&1; then
  MD2IDX_CMD=(md2idx)
elif command -v npx >/dev/null 2>&1; then
  TIMEOUT_SECONDS="${MD2IDX_TIMEOUT_SECONDS:-$DEFAULT_TIMEOUT_SECONDS}"
  if ! [[ "$TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] || [ "$TIMEOUT_SECONDS" -gt 2147483 ]; then
    echo "ERROR: MD2IDX_TIMEOUT_SECONDS must be between 1 and 2147483" >&2
    exit 64
  fi
  MD2IDX_CMD=(node "$SCRIPT_DIR/md2idx-npx-runner.mjs" "$TIMEOUT_SECONDS" "$MD2IDX_VERSION")
  MD2IDX_WRITES_OUTPUT=1
elif command -v md2idx >/dev/null 2>&1; then
  MD2IDX_CMD=(md2idx)
else
  echo "ERROR: md2idx not found (no md2idx in PATH and no npx)" >&2
  exit 3
fi

TMP_JSON=$(mktemp "${TMPDIR:-/tmp}/md2idx-read.XXXXXX")
cleanup() {
  rm -f -- "$TMP_JSON"
}
trap cleanup EXIT

run_md2idx() {
  local status

  set +e
  if [ "$MD2IDX_WRITES_OUTPUT" -eq 1 ]; then
    "${MD2IDX_CMD[@]}" "$FILE" "$TMP_JSON"
  else
    "${MD2IDX_CMD[@]}" "$FILE" >"$TMP_JSON"
  fi
  status=$?
  set -e

  if [ "$status" -eq 124 ]; then
    echo "ERROR: md2idx timed out" >&2
    exit 124
  fi
  if [ "$status" -ne 0 ]; then
    echo "ERROR: md2idx failed with status $status" >&2
    exit 5
  fi
}

run_jq() {
  local expression="$1"
  local status

  set +e
  jq -r "$expression" "$TMP_JSON"
  status=$?
  set -e

  if [ "$status" -ne 0 ]; then
    echo "ERROR: jq extraction failed with status $status" >&2
    exit 6
  fi
}

case "${1:-}" in
  --index)
    run_md2idx
    run_jq '.index'
    ;;
  --sections)
    [ $# -lt 2 ] && usage
    JQ_EXPR="$2"
    if ! jq -n "def __md2idx_query: $JQ_EXPR; null" >/dev/null 2>&1; then
      echo "ERROR: invalid jq expression: $JQ_EXPR" >&2
      exit 6
    fi
    run_md2idx
    run_jq "$JQ_EXPR"
    ;;
  *)
    usage
    ;;
esac

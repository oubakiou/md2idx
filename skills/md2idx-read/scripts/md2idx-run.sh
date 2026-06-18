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

MD2IDX_CMD=()
if [ -f "dist/md2idx.mjs" ]; then
  MD2IDX_CMD=(node dist/md2idx.mjs)
elif command -v md2idx >/dev/null 2>&1; then
  MD2IDX_CMD=(md2idx)
elif command -v npx >/dev/null 2>&1; then
  MD2IDX_CMD=(npx -y md2idx)
else
  echo "ERROR: md2idx not found (no dist/md2idx.mjs, no md2idx in PATH, no npx)" >&2
  exit 3
fi

case "${1:-}" in
  --index)
    "${MD2IDX_CMD[@]}" "$FILE" | jq -r '.index'
    ;;
  --sections)
    [ $# -lt 2 ] && usage
    JQ_EXPR="$2"
    "${MD2IDX_CMD[@]}" "$FILE" | jq -r "$JQ_EXPR"
    ;;
  *)
    usage
    ;;
esac

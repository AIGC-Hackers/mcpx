#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BIN_DIR="${MCPX_INSTALL_DIR:-$HOME/.local/bin}"
SOURCE="dist/mcpx"

usage() {
  cat <<'USAGE'
Usage: install.sh [--dir DIR] [--source PATH]

Install the built mcpx JS bundle.

Options:
  --dir DIR      Install directory. Default: $MCPX_INSTALL_DIR or ~/.local/bin.
  --source PATH  Bundle to install. Default: dist/mcpx.
  -h, --help     Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --dir" >&2
        exit 1
      fi
      BIN_DIR="$2"
      shift 2
      ;;
    --source)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --source" >&2
        exit 1
      fi
      SOURCE="$2"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -x "$SOURCE" ]]; then
  echo "$SOURCE is missing or not executable; building first."
  ./scripts/build.sh --outfile "$SOURCE"
fi

mkdir -p "$BIN_DIR"
cp "$SOURCE" "$BIN_DIR/mcpx"
chmod +x "$BIN_DIR/mcpx"

echo "Installed mcpx to $BIN_DIR/mcpx"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Add $BIN_DIR to PATH before running mcpx directly." ;;
esac

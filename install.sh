#!/usr/bin/env bash
set -euo pipefail

REPO="${MCPX_REPO:-AIGC-Hackers/mcpx}"
VERSION="${MCPX_VERSION:-latest}"
BIN_DIR="${MCPX_INSTALL_DIR:-$HOME/.local/bin}"

usage() {
  cat <<'USAGE'
Usage: install.sh [--dir DIR] [--version VERSION] [--repo OWNER/REPO]

Download and install the mcpx executable JS bundle from GitHub Releases.

Options:
  --dir DIR          Install directory. Default: $MCPX_INSTALL_DIR or ~/.local/bin.
  --version VERSION  Release version or tag. Default: $MCPX_VERSION or latest.
  --repo OWNER/REPO  GitHub repository. Default: $MCPX_REPO or AIGC-Hackers/mcpx.
  -h, --help         Show this help.
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
    --version)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --version" >&2
        exit 1
      fi
      VERSION="$2"
      shift 2
      ;;
    --repo)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --repo" >&2
        exit 1
      fi
      REPO="$2"
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

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to install mcpx." >&2
  exit 1
fi

if [[ "$VERSION" == "latest" ]]; then
  URL="https://github.com/$REPO/releases/latest/download/mcpx"
else
  URL="https://github.com/$REPO/releases/download/$VERSION/mcpx"
fi

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

echo "Downloading mcpx from $URL"
curl -fsSL "$URL" -o "$TMP_FILE"

mkdir -p "$BIN_DIR"
cp "$TMP_FILE" "$BIN_DIR/mcpx"
chmod +x "$BIN_DIR/mcpx"

echo "Installed mcpx to $BIN_DIR/mcpx"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Add $BIN_DIR to PATH before running mcpx directly." ;;
esac

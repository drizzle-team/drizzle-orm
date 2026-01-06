#!/usr/bin/env bash
set -euo pipefail

pnpm build

cd dist
pkg_file=$(npm pack | tail -n 1)

pkg_path="$(pwd)/$pkg_file"

if command -v pbcopy &>/dev/null; then
  echo -n "$pkg_path" | pbcopy
  echo "📦 Copied package path to clipboard:"
elif command -v xclip &>/dev/null; then
  echo -n "$pkg_path" | xclip -selection clipboard
  echo "📦 Copied package path to clipboard:"
elif command -v wl-copy &>/dev/null; then
  echo -n "$pkg_path" | wl-copy
  echo "📦 Copied package path to clipboard:"
else
  echo "⚠️ No clipboard tool found. Path:"
fi

echo "$pkg_path"
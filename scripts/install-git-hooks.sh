#!/bin/bash
# リポジトリ共有の Git フックを有効化する。
# core.hooksPath を .githooks に向け、clone 後も同じ品質ゲートを使えるようにするために存在する。
# RELEVANT FILES: ../.githooks/pre-commit, ../apps/macos/package.json

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "error: Git リポジトリではありません。" >&2
  exit 1
fi

chmod +x "$root/.githooks/pre-commit"
# このリポジトリ限定で hooksPath を設定する（グローバル設定は変更しない）。
git config core.hooksPath .githooks

echo "Git hooks を有効化しました: core.hooksPath=$(git config --get core.hooksPath)"

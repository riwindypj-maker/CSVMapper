#!/bin/bash
# C++ の静的解析を実行する。
# clang-tidy が未導入の場合はスキップし、導入済みなら native/ 配下を検査する。
# RELEVANT FILES: ../../../.clang-tidy, ../../../native/processing-core/CMakeLists.txt

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
clang_tidy=""

# PATH 上の clang-tidy を探す（Homebrew llvm や別途導入を想定）。
if command -v clang-tidy >/dev/null 2>&1; then
  clang_tidy="clang-tidy"
elif [[ -x /opt/homebrew/opt/llvm/bin/clang-tidy ]]; then
  clang_tidy="/opt/homebrew/opt/llvm/bin/clang-tidy"
fi

if [[ -z "$clang_tidy" ]]; then
  echo "clang-tidy not found — skipping C++ static analysis."
  echo "Install with: brew install llvm"
  exit 0
fi

# compile_commands.json があれば利用する（CMAKE_EXPORT_COMPILE_COMMANDS=ON で生成）。
compile_db="$root/native/processing-core/build/compile_commands.json"
extra_args=()
if [[ -f "$compile_db" ]]; then
  extra_args+=(-p "$compile_db")
fi

find "$root/native" \( -name '*.cpp' -o -name '*.h' \) \
  -not -path '*/build/*' \
  -print0 | xargs -0 "$clang_tidy" "${extra_args[@]}"

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

# compile_commands.json は lint 専用ビルドを毎回 configure して鮮度を保つ。
# CMakeLists.txt 追加ソースが古い DB に残ると新規 TU が検査対象外になるため。
compile_dir="$root/native/processing-core/build-lint"
compile_db="$compile_dir/compile_commands.json"
# configure 失敗時に古い compile_commands.json へフォールバックすると、
# 新規 TU が検査対象外のまま成功扱いになり得るため、失敗をそのまま伝播する。
echo "Ensuring compile_commands.json in ${compile_dir}..."
if ! cmake \
  -S "$root/native/processing-core" \
  -B "$compile_dir" \
  -DCMAKE_BUILD_TYPE=Debug \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0 \
  -DCMAKE_EXPORT_COMPILE_COMMANDS=ON; then
  echo "error: failed to configure the lint compilation database" >&2
  exit 1
fi

if [[ ! -f "$compile_db" ]]; then
  echo "error: compile_commands.json not found at ${compile_db}" >&2
  exit 1
fi

# Homebrew の clang-tidy は Apple clang の compile_commands だけでは
# macOS SDK の C++ 標準ヘッダを解決できないことがある。
sdk_root="$(xcrun --show-sdk-path 2>/dev/null || true)"
extra_args=(-p "$compile_dir")
if [[ -n "$sdk_root" ]]; then
  extra_args+=(--extra-arg="-isysroot${sdk_root}" --extra-arg=-stdlib=libc++)
fi

# compile_commands.json に載っている .cpp だけを対象にする。
# 孤児ソースやヘッダ単独 TU は誤検知・標準ヘッダ未解決の原因になる。
source_list="$(mktemp)"
trap 'rm -f "$source_list"' EXIT
python3 -c '
import json, sys
from pathlib import Path
entries = json.loads(Path(sys.argv[1]).read_text())
files = sorted({str(Path(e["file"]).resolve()) for e in entries if e.get("file", "").endswith(".cpp")})
Path(sys.argv[2]).write_text("\0".join(files) + ("\0" if files else ""))
' "$compile_db" "$source_list"

if [[ ! -s "$source_list" ]]; then
  echo "error: no C++ sources listed in ${compile_db}" >&2
  exit 1
fi

xargs -0 "$clang_tidy" "${extra_args[@]}" < "$source_list"

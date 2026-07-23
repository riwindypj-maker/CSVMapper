#!/bin/bash
# C++ / ヘッダの自動整形を実行する。
# .clang-format に基づき native/ 配下のソースを一括整形するために存在する。
# RELEVANT FILES: ../../.clang-format, ../../native/processing-core/

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

# Xcode 同梠の clang-format を優先し、なければ PATH 上のものを使う。
clang_format="/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang-format"
if [[ ! -x "$clang_format" ]]; then
  clang_format="clang-format"
fi

# --check が渡された場合は検証のみ（終了コードで差分の有無を通知）。
mode="-i"
if [[ "${1:-}" == "--check" ]]; then
  mode="-n --Werror"
fi

find "$root/native" \( -name '*.cpp' -o -name '*.h' -o -name '*.hpp' -o -name '*.mm' \) \
  -not -path '*/build/*' \
  -print0 | xargs -0 "$clang_format" $mode
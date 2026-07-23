#!/bin/bash
# Processing Core を単独で構成し、単体テストを実行する。
# React Native ホストに依存せず C++ 契約を継続検証するために存在する。
# RELEVANT FILES: ../../../native/processing-core/CMakeLists.txt, ../package.json, build-processing-core.sh

set -euo pipefail

app_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
core_source="${app_root}/../../native/processing-core"
core_build="${app_root}/macos/build/processing-core-tests"

cmake \
  -S "${core_source}" \
  -B "${core_build}" \
  -DCMAKE_BUILD_TYPE=Debug \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0

cmake --build "${core_build}"
ctest --test-dir "${core_build}" --output-on-failure

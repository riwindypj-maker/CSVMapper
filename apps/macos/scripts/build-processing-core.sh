#!/bin/bash
# Xcode の構成とアーキテクチャに合わせて Processing Core をビルドする。
# React Native macOS のリンク前に CMake 静的ライブラリを生成するために存在する。
# RELEVANT FILES: ../../../native/processing-core/CMakeLists.txt, ../macos/CSVMapper.xcodeproj/project.pbxproj, ../macos/CSVMapper-macOS/AppDelegate.mm

set -euo pipefail

: "${SRCROOT:?SRCROOT is required}"
: "${DERIVED_FILE_DIR:?DERIVED_FILE_DIR is required}"
: "${CONFIGURATION:?CONFIGURATION is required}"
: "${MACOSX_DEPLOYMENT_TARGET:?MACOSX_DEPLOYMENT_TARGET is required}"
: "${ARCHS:?ARCHS is required}"

core_source="${SRCROOT}/../../../native/processing-core"
core_build="${DERIVED_FILE_DIR}/processing-core"
architectures="${ARCHS// /;}"
clean_environment=(
  "PATH=${PATH}"
  "HOME=${HOME}"
  "TMPDIR=${TMPDIR:-/tmp}"
  "DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
)

# env -i でも ICU を解決できるよう、ICU_ROOT / PKG_CONFIG_PATH を引き継ぐ。
if [[ -z "${ICU_ROOT:-}" ]]; then
  for candidate in \
    "$(command -v brew >/dev/null 2>&1 && brew --prefix icu4c@78 2>/dev/null || true)" \
    "$(command -v brew >/dev/null 2>&1 && brew --prefix icu4c 2>/dev/null || true)" \
    "/opt/homebrew/opt/icu4c@78" \
    "/opt/homebrew/opt/icu4c" \
    "/usr/local/opt/icu4c@78" \
    "/usr/local/opt/icu4c"; do
    if [[ -n "${candidate}" && -d "${candidate}/lib/pkgconfig" ]]; then
      ICU_ROOT="${candidate}"
      break
    fi
  done
fi
if [[ -n "${ICU_ROOT:-}" ]]; then
  clean_environment+=("ICU_ROOT=${ICU_ROOT}")
  if [[ -n "${PKG_CONFIG_PATH:-}" ]]; then
    clean_environment+=("PKG_CONFIG_PATH=${ICU_ROOT}/lib/pkgconfig:${PKG_CONFIG_PATH}")
  else
    clean_environment+=("PKG_CONFIG_PATH=${ICU_ROOT}/lib/pkgconfig")
  fi
elif [[ -n "${PKG_CONFIG_PATH:-}" ]]; then
  clean_environment+=("PKG_CONFIG_PATH=${PKG_CONFIG_PATH}")
fi

env -i "${clean_environment[@]}" cmake \
  --fresh \
  -S "${core_source}" \
  -B "${core_build}" \
  -G Xcode \
  "-DCMAKE_OSX_ARCHITECTURES=${architectures}" \
  "-DCMAKE_OSX_DEPLOYMENT_TARGET=${MACOSX_DEPLOYMENT_TARGET}"

env -i "${clean_environment[@]}" cmake \
  --build "${core_build}" \
  --config "${CONFIGURATION}" \
  --target csvmapper_processing_core

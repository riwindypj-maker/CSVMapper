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

# 配布リンク用に静的アーカイブが揃っているか確認する（dylib のみでは不可）。
has_static_icu() {
  local root="$1"
  [[ -f "${root}/lib/libicui18n.a" && -f "${root}/lib/libicuuc.a" && -f "${root}/lib/libicudata.a" ]]
}

# env -i でも ICU を解決できるよう、ICU_ROOT / PKG_CONFIG_PATH を引き継ぐ。
# pkgconfig だけでは dylib 専用インストールを拾うため、静的アーカイブ必須で選ぶ。
if [[ -z "${ICU_ROOT:-}" ]]; then
  for candidate in \
    "$(command -v brew >/dev/null 2>&1 && brew --prefix icu4c@78 2>/dev/null || true)" \
    "$(command -v brew >/dev/null 2>&1 && brew --prefix icu4c 2>/dev/null || true)" \
    "/opt/homebrew/opt/icu4c@78" \
    "/opt/homebrew/opt/icu4c" \
    "/usr/local/opt/icu4c@78" \
    "/usr/local/opt/icu4c"; do
    if [[ -n "${candidate}" && -d "${candidate}/lib/pkgconfig" ]] && has_static_icu "${candidate}"; then
      ICU_ROOT="${candidate}"
      break
    fi
  done
fi

if [[ -z "${ICU_ROOT:-}" ]]; then
  echo "error: ICU_ROOT with static archives (libicui18n.a, libicuuc.a, libicudata.a) is required" >&2
  echo "error: dylib-only ICU installs cannot be staged for app distribution" >&2
  exit 1
fi
if ! has_static_icu "${ICU_ROOT}"; then
  echo "error: ICU_ROOT=${ICU_ROOT} lacks static archives (libicui18n.a, libicuuc.a, libicudata.a)" >&2
  echo "error: dylib-only ICU installs cannot be staged for app distribution" >&2
  exit 1
fi

clean_environment+=("ICU_ROOT=${ICU_ROOT}")
if [[ -n "${PKG_CONFIG_PATH:-}" ]]; then
  clean_environment+=("PKG_CONFIG_PATH=${ICU_ROOT}/lib/pkgconfig:${PKG_CONFIG_PATH}")
else
  clean_environment+=("PKG_CONFIG_PATH=${ICU_ROOT}/lib/pkgconfig")
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

# 配布バイナリが Homebrew dylib に依存しないよう、静的 ICU を DerivedData へ置く。
# Xcode の LIBRARY_SEARCH_PATHS はこのディレクトリのみを指し、LD_RUNPATH に Homebrew を入れない。
lib_out="${core_build}/lib/${CONFIGURATION}"
mkdir -p "${lib_out}"
for archive in libicui18n.a libicuuc.a libicudata.a; do
  cp -f "${ICU_ROOT}/lib/${archive}" "${lib_out}/${archive}"
done

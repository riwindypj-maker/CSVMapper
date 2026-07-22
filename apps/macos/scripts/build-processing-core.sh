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

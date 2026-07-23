// Processing Core の最小公開契約を定義する。
// macOS ホストが CMake 生成ライブラリを実際にリンクできることを検証するために存在する。
// RELEVANT FILES: ../../src/processing_core.cpp, ../../tests/processing_core_tests.cpp, ../../../../apps/macos/macos/CSVMapper-macOS/AppDelegate.mm

#pragma once

namespace csvmapper {

const char *processing_core_version() noexcept;

} // namespace csvmapper

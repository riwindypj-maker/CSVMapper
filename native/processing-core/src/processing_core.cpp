// Processing Core の最小リンク検証用実装を提供する。
// OS 非依存の静的ライブラリがホストから呼び出される境界を確立するために存在する。
// RELEVANT FILES: ../include/csvmapper/processing_core.h, ../tests/processing_core_tests.cpp, ../../../apps/macos/macos/CSVMapper-macOS/AppDelegate.mm

#include "csvmapper/processing_core.h"

namespace csvmapper {

const char *processing_core_version() noexcept { return "0.1.0-prototype"; }

} // namespace csvmapper

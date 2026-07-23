// Processing Core の公開契約を単体検証する。
// ホスト連携前に静的ライブラリ単体の構成と呼び出しを検証するために存在する。
// RELEVANT FILES: ../CMakeLists.txt, ../include/csvmapper/processing_core.h, ../src/processing_core.cpp

#include "csvmapper/csv_format.h"
#include "csvmapper/processing_core.h"
#include "csvmapper/string_transforms.h"
#include "csvmapper/transformation_graph.h"

#include <string_view>

int main() { return std::string_view(csvmapper::processing_core_version()) == "0.1.0-prototype" ? 0 : 1; }

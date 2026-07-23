# CSVMapper の共有 Processing Core を静的ライブラリとして構成する。
# OS 別ホストから同じ C++ 実装をリンクし、処理結果を共通化するために存在する。
# RELEVANT FILES: include/csvmapper/*.h, src/*.cpp, tests/*.cpp

cmake_minimum_required(VERSION 3.25)

project(CSVMapperProcessingCore LANGUAGES CXX)

# ICU を pkg-config で解決する。ICU_ROOT / PKG_CONFIG_PATH で上書き可能。
# Homebrew 固定パスだけに依存しないよう、未設定時は候補を順に試す。
find_package(PkgConfig REQUIRED)

function(csvmapper_prepend_pkg_config_path dir)
  if(EXISTS "${dir}")
    if(DEFINED ENV{PKG_CONFIG_PATH} AND NOT "$ENV{PKG_CONFIG_PATH}" STREQUAL "")
      set(ENV{PKG_CONFIG_PATH} "${dir}:$ENV{PKG_CONFIG_PATH}")
    else()
      set(ENV{PKG_CONFIG_PATH} "${dir}")
    endif()
  endif()
endfunction()

if(DEFINED ENV{ICU_ROOT})
  csvmapper_prepend_pkg_config_path("$ENV{ICU_ROOT}/lib/pkgconfig")
elseif(DEFINED ICU_ROOT)
  csvmapper_prepend_pkg_config_path("${ICU_ROOT}/lib/pkgconfig")
else()
  foreach(_candidate
      "/opt/homebrew/opt/icu4c@78"
      "/opt/homebrew/opt/icu4c"
      "/usr/local/opt/icu4c@78"
      "/usr/local/opt/icu4c")
    if(EXISTS "${_candidate}/lib/pkgconfig")
      csvmapper_prepend_pkg_config_path("${_candidate}/lib/pkgconfig")
      break()
    endif()
  endforeach()
endif()

pkg_check_modules(ICU REQUIRED icu-uc icu-i18n IMPORTED_TARGET)

# clang-tidy / clangd 用にコンパイルコマンドをエクスポートする。
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

add_library(csvmapper_processing_core STATIC
  src/processing_core.cpp
  src/csv_format.cpp
  src/csv_inspect.cpp
  src/string_transforms.cpp
  src/transformation_graph.cpp
)

target_include_directories(csvmapper_processing_core
  PUBLIC
    include
)

target_compile_features(csvmapper_processing_core PUBLIC cxx_std_20)

target_link_libraries(csvmapper_processing_core
  PUBLIC
    PkgConfig::ICU
)

set_target_properties(csvmapper_processing_core PROPERTIES
  ARCHIVE_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/lib/$<CONFIG>"
  CXX_EXTENSIONS OFF
)

if(PROJECT_IS_TOP_LEVEL)
  enable_testing()

  add_executable(processing_core_tests
    tests/all_tests.cpp
    tests/test_utils.cpp
    tests/csv_format_tests.cpp
    tests/csv_inspect_tests.cpp
    tests/string_transforms_tests.cpp
    tests/transformation_graph_tests.cpp
  )
  target_link_libraries(processing_core_tests PRIVATE csvmapper_processing_core)
  target_include_directories(processing_core_tests PRIVATE tests)

  add_test(NAME processing_core_tests COMMAND processing_core_tests)
endif()

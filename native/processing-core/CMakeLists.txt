# CSVMapper の共有 Processing Core を静的ライブラリとして構成する。
# OS 別ホストから同じ C++ 実装をリンクし、処理結果を共通化するために存在する。
# RELEVANT FILES: include/csvmapper/processing_core.h, src/processing_core.cpp, tests/processing_core_tests.cpp

cmake_minimum_required(VERSION 3.25)

project(CSVMapperProcessingCore LANGUAGES CXX)

add_library(csvmapper_processing_core STATIC
  src/processing_core.cpp
)

target_include_directories(csvmapper_processing_core
  PUBLIC
    include
)

target_compile_features(csvmapper_processing_core PUBLIC cxx_std_20)

set_target_properties(csvmapper_processing_core PROPERTIES
  ARCHIVE_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/lib/$<CONFIG>"
  CXX_EXTENSIONS OFF
)

if(PROJECT_IS_TOP_LEVEL)
  enable_testing()

  add_executable(processing_core_tests
    tests/processing_core_tests.cpp
  )
  target_link_libraries(processing_core_tests PRIVATE csvmapper_processing_core)

  add_test(NAME processing_core_tests COMMAND processing_core_tests)
endif()

// Processing Core のドメインテストをひとつの実行可能ファイルにまとめる。
// フレームワーク無しで全ドメイン契約を一括実行するために存在する。
// RELEVANT FILES: csv_format_tests.cpp, csv_inspect_tests.cpp, string_transforms_tests.cpp, transformation_graph_tests.cpp

#include "csvmapper/csv_format.h"
#include "csvmapper/csv_inspect.h"
#include "csvmapper/processing_core.h"
#include "csvmapper/string_transforms.h"
#include "csvmapper/transformation_graph.h"
#include "test_utils.h"

#include <cassert>
#include <cstring>
#include <string>
#include <string_view>
#include <system_error>
#include <vector>

namespace csvmapper {

// csv_format_tests.cpp
void TestDetectUtf8();
void TestDetectUtf8Bom();
void TestDetectWindows31J();
void TestDecodeUtf8Bom();
void TestDecodeWindows31J();
void TestParseSimple();
void TestParseQuoted();
void TestParseInconsistentFields();
void TestParseUnclosedQuote();
void TestParseQuotedTrailingGarbage();
void TestDecodeInvalidUtf8();
void TestParseEmptyHeader();
void TestParseHeaderOnly();
void TestParseTrailingBlankLinesIgnored();
void TestParseQuotedEmptyNotBlankLine();
void TestFormatUtf8Bom();
void TestFormatWindows31JMappable();
void TestFormatEmojiUnmappable();

// csv_inspect_tests.cpp
void TestInspectCsv001QuotedAndEmpty();
void TestInspectChunkBoundaryQuotedAndCrLf();
void TestInspectChunkBoundaryUtf8Multibyte();
void TestInspectCsv002DuplicateHeaders();
void TestInspectCsv003Encodings();
void TestInspectCsv004HeaderOnlyWarning();
void TestInspectCsvE001MalformedWithRecordNumber();
void TestInspectCsvE001InconsistentFields();
void TestInspectTrailingBlankLinesIgnored();
void TestInspectCancelDoesNotCommit();
void TestInspectProgressCallbacks();
void TestInspectMemoryConstraintKeepsOnlySample();
void TestStreamingParserPhysicalLinesOnError();
void TestBuildDisplayNamesUniqueUnchanged();
void TestInspectAutoDetectSmallBufferMultibyte();
void TestInspectAutoDetectLargeWindows31JWithAsciiHeader();
void TestInspectUtf8WithBomMismatchKeepsPrefixBytes();

// string_transforms_tests.cpp
void TestFrontTrim();
void TestBackTrim();
void TestDeleteAt();
void TestSubstring();
void TestOutOfRange();
void TestReplace();
void TestDeleteAll();
void TestTrim();
void TestRemoveWhitespace();
void TestCase();
void TestPrefixSuffix();
void TestReplaceIfEmpty();
void TestJoin();
void TestInvalidParameter();
void TestMissingTarget();
void TestConstantEmpty();

// transformation_graph_tests.cpp
void TestInputToOutput();
void TestInputBlockOutput();
void TestBranch();
void TestCyclePrevention();
void TestOutputAsSource();
void TestMultipleInputsToSingleBlock();
void TestJoinGraph();
void TestJoinPropertyOrder();
void TestValidateMissingOutputName();
void TestRemoveNodeRemovesEdges();
void TestOutputOrder();

} // namespace csvmapper

int main() {
  using namespace csvmapper;

  assert(std::string_view(csvmapper::processing_core_version()) == "0.1.0-prototype");

  TestDetectUtf8();
  TestDetectUtf8Bom();
  TestDetectWindows31J();
  TestDecodeUtf8Bom();
  TestDecodeWindows31J();
  TestParseSimple();
  TestParseQuoted();
  TestParseInconsistentFields();
  TestParseUnclosedQuote();
  TestParseQuotedTrailingGarbage();
  TestDecodeInvalidUtf8();
  TestParseEmptyHeader();
  TestParseHeaderOnly();
  TestParseTrailingBlankLinesIgnored();
  TestParseQuotedEmptyNotBlankLine();
  TestFormatUtf8Bom();
  TestFormatWindows31JMappable();
  TestFormatEmojiUnmappable();

  TestInspectCsv001QuotedAndEmpty();
  TestInspectChunkBoundaryQuotedAndCrLf();
  TestInspectChunkBoundaryUtf8Multibyte();
  TestInspectCsv002DuplicateHeaders();
  TestInspectCsv003Encodings();
  TestInspectCsv004HeaderOnlyWarning();
  TestInspectCsvE001MalformedWithRecordNumber();
  TestInspectCsvE001InconsistentFields();
  TestInspectTrailingBlankLinesIgnored();
  TestInspectCancelDoesNotCommit();
  TestInspectProgressCallbacks();
  TestInspectMemoryConstraintKeepsOnlySample();
  TestStreamingParserPhysicalLinesOnError();
  TestBuildDisplayNamesUniqueUnchanged();
  TestInspectAutoDetectSmallBufferMultibyte();
  TestInspectAutoDetectLargeWindows31JWithAsciiHeader();
  TestInspectUtf8WithBomMismatchKeepsPrefixBytes();

  TestFrontTrim();
  TestBackTrim();
  TestDeleteAt();
  TestSubstring();
  TestOutOfRange();
  TestReplace();
  TestDeleteAll();
  TestTrim();
  TestRemoveWhitespace();
  TestCase();
  TestPrefixSuffix();
  TestReplaceIfEmpty();
  TestJoin();
  TestInvalidParameter();
  TestMissingTarget();
  TestConstantEmpty();

  TestInputToOutput();
  TestInputBlockOutput();
  TestBranch();
  TestCyclePrevention();
  TestOutputAsSource();
  TestMultipleInputsToSingleBlock();
  TestJoinGraph();
  TestJoinPropertyOrder();
  TestValidateMissingOutputName();
  TestRemoveNodeRemovesEdges();
  TestOutputOrder();

  return 0;
}

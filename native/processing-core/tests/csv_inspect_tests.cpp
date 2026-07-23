// CSV 読込概要（inspectInput）のドメインテスト。
// csv-io 読込系・チャンク境界・中止・メモリ拘束を Core で検証するために存在する。
// RELEVANT FILES: ../include/csvmapper/csv_inspect.h, ../src/csv_inspect.cpp, ../include/csvmapper/csv_format.h

#include "csvmapper/csv_inspect.h"
#include "test_utils.h"

#include <atomic>
#include <cassert>
#include <chrono>
#include <string>
#include <vector>

namespace csvmapper {

void TestInspectCsv001QuotedAndEmpty() {
  // CSV-001: 引用・コンマ・引用符・項目内改行・空値。
  const std::string bytes = "Name,Note,Empty\n"
                            "\"Hello, World\",\"Line1\nLine2\",\"\"\n"
                            "\"A\"\"B\",x,\n";
  MemoryByteSource source(bytes);
  InspectInputOptions options;
  options.encoding = TextEncoding::Utf8;
  options.minProgressInterval = std::chrono::milliseconds(0);

  const auto result = InspectInput("op-csv001", source, options);
  assert(result.success);
  assert(!result.cancelled);
  assert(result.columnCount == 3);
  assert(result.dataRowCount == 2);
  assert(result.items.size() == 3);
  assert(result.items[0].header == "Name");
  assert(ToUtf8(result.items[0].sample) == "Hello, World");
  assert(ToUtf8(result.items[1].sample) == "Line1\nLine2");
  assert(result.items[2].sample.empty());
}

void TestInspectChunkBoundaryQuotedAndCrLf() {
  // 引用フィールドと CRLF が小さなチャンク境界をまたいでも同じ結果になること。
  const std::string bytes = "H1,H2\r\n"
                            "\"a,b\",\"c\"\"d\"\r\n"
                            "e,f\r\n";
  MemoryByteSource source(bytes);
  InspectInputOptions options;
  options.encoding = TextEncoding::Utf8;
  options.readBufferBytes = 3;
  options.minProgressInterval = std::chrono::milliseconds(0);

  const auto result = InspectInput("op-chunk", source, options);
  assert(result.success);
  assert(result.dataRowCount == 2);
  assert(result.columnCount == 2);
  assert(ToUtf8(result.items[0].sample) == "a,b");
  assert(ToUtf8(result.items[1].sample) == "c\"d");
}

void TestInspectChunkBoundaryUtf8Multibyte() {
  // マルチバイト UTF-8 がチャンク境界をまたいでも変換・解析できること。
  const std::string bytes = "名,値\n"
                            "日本,1\n";
  MemoryByteSource source(bytes);
  InspectInputOptions options;
  options.encoding = TextEncoding::Utf8;
  options.readBufferBytes = 2;
  options.minProgressInterval = std::chrono::milliseconds(0);

  const auto result = InspectInput("op-utf8-chunk", source, options);
  assert(result.success);
  assert(result.items[0].header == "名");
  assert(ToUtf8(result.items[0].sample) == "日本");
  assert(result.dataRowCount == 1);
}

void TestInspectCsv002DuplicateHeaders() {
  // CSV-002: 重複ヘッダーは元文字列を維持し、表示名だけ一意にする。
  MemoryByteSource source("氏名,氏名,年齢\n太郎,次郎,20\n");
  InspectInputOptions options;
  options.encoding = TextEncoding::Utf8;

  const auto result = InspectInput("op-csv002", source, options);
  assert(result.success);
  assert(result.items.size() == 3);
  assert(result.items[0].header == "氏名");
  assert(result.items[1].header == "氏名");
  assert(result.items[2].header == "年齢");
  assert(result.items[0].displayName == "氏名［1列目］");
  assert(result.items[1].displayName == "氏名［2列目］");
  assert(result.items[2].displayName == "年齢");
  assert(ToUtf8(result.items[0].sample) == "太郎");
}

void TestInspectCsv003Encodings() {
  // CSV-003: BOM 付き UTF-8 / BOM なし UTF-8 / Windows-31J / ASCII。
  {
    MemoryByteSource source("\xEF\xBB\xBF"
                            "A,B\n1,2\n");
    InspectInputOptions options;
    options.encoding = TextEncoding::AutoDetect;
    const auto result = InspectInput("op-bom", source, options);
    assert(result.success);
    assert(result.detectedEncoding == TextEncoding::Utf8WithBom);
    assert(result.items[0].header == "A");
  }
  {
    MemoryByteSource source("A,B\n1,2\n");
    InspectInputOptions options;
    options.encoding = TextEncoding::AutoDetect;
    const auto result = InspectInput("op-utf8", source, options);
    assert(result.success);
    assert(result.detectedEncoding == TextEncoding::Utf8);
  }
  {
    // ヘッダー「名」とデータ「あ」を Windows-31J で表現（単一列）。
    const std::string bytes = std::string("\x96\xBC", 2) + "\n" + std::string("\x82\xA0", 2) + "\n";
    MemoryByteSource source(bytes);
    InspectInputOptions options;
    options.encoding = TextEncoding::AutoDetect;
    const auto result = InspectInput("op-w31j", source, options);
    assert(result.success);
    assert(result.detectedEncoding == TextEncoding::Windows31J);
    assert(result.items.size() == 1);
    assert(ToUtf8(result.items[0].sample) == "あ");
  }
  {
    MemoryByteSource source("A,B\n1,2\n");
    InspectInputOptions options;
    options.encoding = TextEncoding::AutoDetect;
    const auto result = InspectInput("op-ascii", source, options);
    assert(result.success);
    assert(result.detectedEncoding == TextEncoding::Utf8);
  }
}

void TestInspectCsv004HeaderOnlyWarning() {
  // CSV-004: ヘッダーのみは成功かつ警告。
  MemoryByteSource source("A,B\n");
  InspectInputOptions options;
  options.encoding = TextEncoding::Utf8;

  const auto result = InspectInput("op-csv004", source, options);
  assert(result.success);
  assert(result.dataRowCount == 0);
  assert(result.columnCount == 2);
  assert(result.issues.size() == 1);
  assert(result.issues[0].severity == InspectIssueSeverity::Warning);
  assert(result.issues[0].message == "header only");
}

void TestInspectCsvE001MalformedWithRecordNumber() {
  // CSV-E001: 解析エラーはレコード番号付きで、成功結果を確定しない。
  MemoryByteSource source("A,B\n\"1,2\n");
  InspectInputOptions options;
  options.encoding = TextEncoding::Utf8;

  const auto result = InspectInput("op-e001", source, options);
  assert(!result.success);
  assert(!result.cancelled);
  assert(result.items.empty());
  assert(result.dataRowCount == 0);
  assert(!result.issues.empty());
  assert(result.issues[0].severity == InspectIssueSeverity::Error);
  assert(result.issues[0].code == CsvErrorCode::MalformedCsv);
  assert(result.issues[0].location.recordNumber >= 1);
}

void TestInspectCsvE001InconsistentFields() {
  MemoryByteSource source("A,B\n1,2,3\n");
  InspectInputOptions options;
  options.encoding = TextEncoding::Utf8;

  const auto result = InspectInput("op-e001-fields", source, options);
  assert(!result.success);
  assert(result.items.empty());
  assert(result.issues[0].code == CsvErrorCode::InconsistentFieldCount);
  assert(result.issues[0].location.recordNumber == 2);
  assert(result.issues[0].location.startPhysicalLine >= 1);
  assert(result.issues[0].location.endPhysicalLine >= result.issues[0].location.startPhysicalLine);
}

void TestInspectTrailingBlankLinesIgnored() {
  // 末尾空行があっても inspect は成功し、データ行数に空行を数えない。
  MemoryByteSource source("A,B\n1,2\n\n\n");
  InspectInputOptions options;
  options.encoding = TextEncoding::Utf8;
  options.minProgressInterval = std::chrono::milliseconds(0);

  const auto result = InspectInput("op-trailing-blank", source, options);
  assert(result.success);
  assert(result.columnCount == 2);
  assert(result.dataRowCount == 1);
  assert(ToUtf8(result.items[0].sample) == "1");
}

void TestInspectCancelDoesNotCommit() {
  // 走査中の中止では部分結果を確定しない。
  std::string bytes = "A,B\n";
  for (int i = 0; i < 1000; ++i)
    bytes += "x,y\n";

  MemoryByteSource source(bytes);
  std::atomic<bool> cancel{false};
  InspectInputOptions options;
  options.encoding = TextEncoding::Utf8;
  options.cancelFlag = &cancel;
  options.minProgressInterval = std::chrono::milliseconds(0);
  options.readBufferBytes = 16;
  options.onProgress = [&](const InspectProgress &progress) {
    if (progress.recordsProcessed >= 3)
      cancel.store(true);
  };

  const auto result = InspectInput("op-cancel", source, options);
  assert(!result.success);
  assert(result.cancelled);
  assert(result.items.empty());
  assert(result.dataRowCount == 0);
  assert(result.issues.empty());
}

void TestInspectProgressCallbacks() {
  std::string bytes = "A,B\n";
  for (int i = 0; i < 50; ++i)
    bytes += "1,2\n";

  MemoryByteSource source(bytes);
  int progressCount = 0;
  InspectInputOptions options;
  options.encoding = TextEncoding::Utf8;
  options.minProgressInterval = std::chrono::milliseconds(0);
  options.readBufferBytes = 8;
  options.onProgress = [&](const InspectProgress &) { ++progressCount; };

  const auto result = InspectInput("op-progress", source, options);
  assert(result.success);
  assert(progressCount > 0);
}

void TestInspectMemoryConstraintKeepsOnlySample() {
  // 大きめ入力でも結果は件数と先頭サンプルだけで、全レコード vector を持たない。
  std::string bytes = "ColA,ColB\n";
  constexpr int kRows = 20000;
  for (int i = 0; i < kRows; ++i) {
    bytes += "value-";
    bytes += std::to_string(i);
    bytes += ",x\n";
  }

  MemoryByteSource source(bytes);
  InspectInputOptions options;
  options.encoding = TextEncoding::Utf8;
  options.minProgressInterval = std::chrono::milliseconds(0);

  const auto result = InspectInput("op-memory", source, options);
  assert(result.success);
  assert(result.dataRowCount == static_cast<std::size_t>(kRows));
  assert(result.items.size() == 2);
  assert(ToUtf8(result.items[0].sample) == "value-0");
  // 結果 DTO に行配列が無いこと（サンプルは先頭 1 件分のみ）。
  assert(result.items[0].sample.find(u"value-1") == std::u16string::npos);
}

void TestStreamingParserPhysicalLinesOnError() {
  StreamingCsvParser parser;
  std::size_t saw = 0;
  parser.SetRecordHandler([&](Record, CsvRecordLocation) {
    ++saw;
    return true;
  });
  const std::u16string text = u"A,B\n1,2,3\n";
  assert(!parser.Feed(text.data(), text.size()) || !parser.Finish());
  assert(parser.HasError());
  assert(parser.GetIssue().code == CsvErrorCode::InconsistentFieldCount);
  assert(parser.GetIssue().location.recordNumber == 2);
  assert(parser.GetIssue().location.startPhysicalLine == 2);
  assert(parser.GetIssue().location.endPhysicalLine == 2);
  assert(saw == 1);
}

void TestBuildDisplayNamesUniqueUnchanged() {
  const auto names = BuildInputDisplayNames({"A", "B", "A"});
  assert(names.size() == 3);
  assert(names[0] == "A［1列目］");
  assert(names[1] == "B");
  assert(names[2] == "A［3列目］");
}

void TestInspectAutoDetectSmallBufferMultibyte() {
  // Size > readBufferBytes かつ先頭が多バイトでも AutoDetect が UTF-8 を落とさないこと。
  std::string bytes = "名,値\n";
  for (int i = 0; i < 40; ++i)
    bytes += "日本,1\n";

  for (const std::size_t bufferBytes : {2u, 3u, 4u}) {
    MemoryByteSource source(bytes);
    InspectInputOptions options;
    options.encoding = TextEncoding::AutoDetect;
    options.readBufferBytes = bufferBytes;
    options.minProgressInterval = std::chrono::milliseconds(0);

    const auto result = InspectInput("op-autodetect-small", source, options);
    assert(result.success);
    assert(result.detectedEncoding == TextEncoding::Utf8);
    assert(result.items[0].header == "名");
    assert(result.dataRowCount == 40);
  }
}

void TestInspectAutoDetectLargeWindows31JWithAsciiHeader() {
  // Size > buffer。ASCII ヘッダー＋ Windows-31J 本文が境界で切れても UTF-8 と誤判定しないこと。
  std::string bytes = "A,B\n";
  const std::string row = std::string("\x82\xA0", 2) + ",x\n"; // あ,x
  while (bytes.size() < 128)
    bytes += row;

  // 短いバッファ（先頭が ASCII のみ）と、W31J フィールド途中で切れる長さの両方を試す。
  for (const std::size_t bufferBytes : {4u, 8u, 20u}) {
    MemoryByteSource source(bytes);
    InspectInputOptions options;
    options.encoding = TextEncoding::AutoDetect;
    options.readBufferBytes = bufferBytes;
    options.minProgressInterval = std::chrono::milliseconds(0);

    const auto result = InspectInput("op-autodetect-w31j", source, options);
    assert(result.success);
    assert(result.detectedEncoding == TextEncoding::Windows31J);
    assert(result.items.size() == 2);
    assert(ToUtf8(result.items[0].sample) == "あ");
  }

  // 長い W31J フィールドの途中でサンプルが終わる場合も同様。
  std::string midField = "Name,Note\nid,";
  for (int i = 0; i < 80; ++i)
    midField += std::string("\x82\xA0", 2);
  midField += "\n";
  while (midField.size() < 256)
    midField += row;

  const std::size_t cut = std::string("Name,Note\nid,").size() + 40;
  MemoryByteSource midSource(midField);
  InspectInputOptions midOptions;
  midOptions.encoding = TextEncoding::AutoDetect;
  midOptions.readBufferBytes = cut;
  midOptions.minProgressInterval = std::chrono::milliseconds(0);
  const auto midResult = InspectInput("op-autodetect-w31j-mid", midSource, midOptions);
  assert(midResult.success);
  assert(midResult.detectedEncoding == TextEncoding::Windows31J);
}

void TestInspectUtf8WithBomMismatchKeepsPrefixBytes() {
  // Utf8WithBom 指定で BOM が途中不一致のとき、一致済み接頭辞を捨てて成功しないこと。
  const std::string bytes = std::string("\xEF\xBB", 2) + "A,B\n1,2\n";
  MemoryByteSource source(bytes);
  InspectInputOptions options;
  options.encoding = TextEncoding::Utf8WithBom;

  const auto result = InspectInput("op-bom-mismatch", source, options);
  assert(!result.success);
  assert(!result.cancelled);
  assert(result.items.empty());
  assert(!result.issues.empty());
  assert(result.issues[0].code == CsvErrorCode::InvalidEncoding);
}

} // namespace csvmapper

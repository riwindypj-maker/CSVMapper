// CSV 解析と出力表現のドメインテスト。
// RELEVANT FILES: ../include/csvmapper/csv_format.h, ../src/csv_format.cpp

#include "csvmapper/csv_format.h"
#include "test_utils.h"

#include <cassert>
#include <cstring>
#include <string>
#include <system_error>
#include <vector>

namespace csvmapper {

void TestDetectUtf8() {
  std::string bytes = "a,b\nc,d";
  assert(DetectEncoding(bytes) == TextEncoding::Utf8);
}

void TestDetectUtf8Bom() {
  std::string bytes = "\xEF\xBB\xBF"
                      "a,b";
  assert(DetectEncoding(bytes) == TextEncoding::Utf8WithBom);
}

void TestDetectWindows31J() {
  // "日本" in Windows-31J
  std::string bytes = "\x93\xFA\x96\x7B";
  assert(DetectEncoding(bytes) == TextEncoding::Windows31J);
}

void TestDecodeUtf8Bom() {
  std::string bytes = "\xEF\xBB\xBF"
                      "abc";
  std::error_code ec;
  auto decoded = DecodeBytes(bytes, TextEncoding::Utf8WithBom, ec);
  assert(!ec);
  assert(decoded.size() == 3);
  assert(decoded[0] == u'a');
}

void TestDecodeWindows31J() {
  std::string bytes = "\x93\xFA\x96\x7B";
  std::error_code ec;
  auto decoded = DecodeBytes(bytes, TextEncoding::Windows31J, ec);
  assert(!ec);
  assert(decoded.size() == 2);
  assert(decoded[0] == u'\u65E5' && decoded[1] == u'\u672C');
}

void TestParseSimple() {
  std::string bytes = "Name,Age\nAlice,30\nBob,25";
  std::error_code ec;
  auto parsed = ParseCsv(bytes, TextEncoding::AutoDetect, ec);
  assert(!ec);
  assert(parsed.headers.size() == 2);
  assert(parsed.headers[0] == "Name");
  assert(parsed.headers[1] == "Age");
  assert(parsed.records.size() == 2);
  assert(ToUtf8(parsed.records[0].fields[0]) == "Alice");
  assert(ToUtf8(parsed.records[0].fields[1]) == "30");
}

void TestParseQuoted() {
  std::string bytes = "\"Hello, World\",\"Line1\nLine2\",\"A\"\"B\"";
  std::error_code ec;
  auto decoded = DecodeBytes(bytes, TextEncoding::Utf8, ec);
  assert(!ec);
  auto records = ParseCsvRecords(decoded, ec);
  assert(!ec);
  assert(records.size() == 1);
  assert(records[0].fields.size() == 3);
  assert(ToUtf8(records[0].fields[0]) == "Hello, World");
  assert(ToUtf8(records[0].fields[1]) == "Line1\nLine2");
  assert(ToUtf8(records[0].fields[2]) == "A\"B");
}

void TestParseInconsistentFields() {
  std::string bytes = "A,B\n1,2,3";
  std::error_code ec;
  auto parsed = ParseCsv(bytes, TextEncoding::AutoDetect, ec);
  assert(ec);
  assert(ec == CsvErrorCode::InconsistentFieldCount);
}

void TestParseUnclosedQuote() {
  std::string bytes = "A,B\n\"1,2";
  std::error_code ec;
  auto parsed = ParseCsv(bytes, TextEncoding::AutoDetect, ec);
  assert(ec);
  assert(ec == CsvErrorCode::MalformedCsv);
}

void TestParseQuotedTrailingGarbage() {
  std::string bytes = "\"value\"extra";
  std::error_code ec;
  auto decoded = DecodeBytes(bytes, TextEncoding::Utf8, ec);
  assert(!ec);
  auto records = ParseCsvRecords(decoded, ec);
  assert(ec);
  assert(ec == CsvErrorCode::MalformedCsv);
  assert(records.empty());
}

void TestDecodeInvalidUtf8() {
  // 不正な継続バイト列。
  std::string bytes = "\xC3\x28";
  std::error_code ec;
  auto decoded = DecodeBytes(bytes, TextEncoding::Utf8, ec);
  assert(ec);
  assert(ec == CsvErrorCode::InvalidEncoding);
  assert(decoded.empty());
}

void TestParseEmptyHeader() {
  std::string bytes = " ,B\n1,2";
  std::error_code ec;
  auto parsed = ParseCsv(bytes, TextEncoding::AutoDetect, ec);
  assert(ec);
  assert(ec == CsvErrorCode::EmptyHeader);
}

void TestParseHeaderOnly() {
  std::string bytes = "A,B\n";
  std::error_code ec;
  auto parsed = ParseCsv(bytes, TextEncoding::AutoDetect, ec);
  assert(!ec);
  assert(parsed.headers.size() == 2);
  assert(parsed.headers[0] == "A");
  assert(parsed.headers[1] == "B");
  assert(parsed.records.empty());
}

void TestFormatUtf8Bom() {
  Record r;
  r.fields = {u"a", u"b"};
  OutputSettings settings;
  settings.encoding = TextEncoding::Utf8WithBom;
  settings.lineEnding = LineEnding::CRLF;
  auto formatted = FormatCsvRecords({r}, settings);
  assert(formatted.rfind("\xEF\xBB\xBF", 0) == 0);
}

void TestFormatWindows31JMappable() {
  Record r;
  r.fields = {u"\u65E5\u672C"}; // 日本
  OutputSettings settings;
  settings.encoding = TextEncoding::Windows31J;
  auto ec = ValidateOutput({r}, settings);
  assert(!ec); // 日本語は Windows-31J で表現可能
}

void TestFormatEmojiUnmappable() {
  Record r;
  r.fields = {u"\U0001F600"}; // グラインディングフェイス
  OutputSettings settings;
  settings.encoding = TextEncoding::Windows31J;
  auto ec = ValidateOutput({r}, settings);
  assert(ec);
  assert(ec == CsvErrorCode::Windows31JUnmappable);
}

} // namespace csvmapper

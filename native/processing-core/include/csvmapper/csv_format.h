// CSV 解析と出力表現のドメイン契約を定義する。
// RELEVANT FILES: src/csv_format.cpp, tests/csv_format_tests.cpp

#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <system_error>
#include <vector>

namespace csvmapper {

// 文字コードの選択肢。
enum class TextEncoding {
  AutoDetect,
  Utf8,
  Utf8WithBom,
  Windows31J,
};

// 出力時の改行コード。
enum class LineEnding {
  CRLF,
  LF,
};

// 出力設定。
struct OutputSettings {
  TextEncoding encoding = TextEncoding::Utf8WithBom;
  LineEnding lineEnding = LineEnding::CRLF;
};

// 解析結果の記録。
struct Record {
  std::vector<std::u16string> fields;
};

// 解析結果。
struct ParsedCsv {
  TextEncoding detectedEncoding = TextEncoding::Utf8;
  std::vector<std::string> headers;
  std::vector<Record> records;
};

// 解析エラーの詳細。
struct CsvParseError {
  std::string message;
  std::size_t logicalRecord = 0;
  std::size_t startPhysicalLine = 0;
  std::size_t endPhysicalLine = 0;
};

// 与えられたバイト列の文字コードを判定する。
// 自動判定の場合は強力な UTF-8 検証を行い、失敗したら Windows-31J で検証する。
TextEncoding DetectEncoding(const std::string &bytes);

// バイト列を UTF-16 に変換する。
// エンコードド付きの場合は BOM を除去して変換する。
std::vector<char16_t> DecodeBytes(const std::string &bytes, TextEncoding encoding, std::error_code &ec);

// UTF-16 の字句を指定の文字コードでエンコードして返す。
// Windows-31J で表現できない文字がある場合は ec にエ㺊ーを設定する。
std::string EncodeUtf16(const std::u16string &text, TextEncoding encoding, std::error_code &ec);

// UTF-16 の CSV 値を対話的な論理レコードのリストに解析する。
// 失敗した場合は ec にエラーを設定して空を返す。
std::vector<Record> ParseCsvRecords(const std::vector<char16_t> &utf16, std::error_code &ec);

// 論理レコードを指定出力設定でエンコードして返す。
std::string FormatCsvRecords(const std::vector<Record> &records, const OutputSettings &settings);

// ヘッダーとデータをまとめて解析し、結果を返す。
// 失敗した場合は ec にエラーを設定し、詳細は details に追加される。
ParsedCsv ParseCsv(const std::string &bytes, TextEncoding encoding, std::error_code &ec);

// 論理レコードを誤りなく出力できるか検証する。
// 文字コードが Windows-31J であり、表現できない文字がある場合は失敗にする。
std::error_code ValidateOutput(const std::vector<Record> &records, const OutputSettings &settings);

// 公開エラーカテゴリー。
enum class CsvErrorCode {
  None = 0,
  InvalidEncoding,
  MalformedCsv,
  InconsistentFieldCount,
  EmptyHeader,
  EmptyFile,
  Windows31JUnmappable,
};

std::error_code make_error_code(CsvErrorCode code);

} // namespace csvmapper

namespace std {
template <> struct is_error_code_enum<csvmapper::CsvErrorCode> : true_type {};
} // namespace std

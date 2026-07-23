// CSV 解析と出力表現のドメイン契約を定義する。
// 文字コード変換と RFC 4180 相当のレコード解析を OS 非依存で共有するために存在する。
// RELEVANT FILES: src/csv_format.cpp, tests/csv_format_tests.cpp, include/csvmapper/csv_inspect.h

#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>
#include <system_error>
#include <vector>

namespace csvmapper {

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

// 論理レコード番号と取得可能な物理行範囲。
struct CsvRecordLocation {
  // 1 始まりの論理レコード番号。未確定時は 0。
  std::size_t recordNumber = 0;
  // 1 始まりの開始物理行。未取得時は 0。
  std::size_t startPhysicalLine = 0;
  // 1 始まりの終了物理行。未取得時は 0。
  std::size_t endPhysicalLine = 0;
};

// ストリーム解析中の問題。
struct CsvParseIssue {
  CsvErrorCode code = CsvErrorCode::None;
  CsvRecordLocation location;
};

// 解析結果。
struct ParsedCsv {
  TextEncoding detectedEncoding = TextEncoding::Utf8;
  std::vector<std::string> headers;
  std::vector<Record> records;
};

// 与えられたバイト列の文字コードを判定する。
// 自動判定の場合は強力な UTF-8 検証を行い、失敗したら Windows-31J で検証する。
TextEncoding DetectEncoding(const std::string &bytes);

// バイト列を UTF-16 に変換する。
// エンコードド付きの場合は BOM を除去して変換する。
std::vector<char16_t> DecodeBytes(const std::string &bytes, TextEncoding encoding, std::error_code &ec);

// UTF-16 の字句を指定の文字コードでエンコードして返す。
// Windows-31J で表現できない文字がある場合は ec にエラーを設定する。
std::string EncodeUtf16(const std::u16string &text, TextEncoding encoding, std::error_code &ec);

// UTF-16 の CSV 値を対話的な論理レコードのリストに解析する。
// 失敗した場合は ec にエラーを設定して空を返す。
std::vector<Record> ParseCsvRecords(const std::vector<char16_t> &utf16, std::error_code &ec);

// チャンク境界をまたいでも状態を保持する CSV パーサー。
// 全レコードを内部保持せず、完成したレコードだけをハンドラへ渡す。
class StreamingCsvParser {
public:
  // false を返すと以降の Feed / Finish を打ち切る。
  using RecordHandler = std::function<bool(Record record, CsvRecordLocation location)>;

  void Reset();
  void SetRecordHandler(RecordHandler handler);

  // UTF-16 コード単位を追加投入する。失敗時は false。
  bool Feed(const char16_t *data, std::size_t size);
  bool Feed(const std::vector<char16_t> &data) { return Feed(data.data(), data.size()); }

  // 入力終端を通知し、未閉じ引用や項目数不一致を確定する。
  bool Finish();

  const CsvParseIssue &GetIssue() const { return issue_; }
  bool HasError() const { return issue_.code != CsvErrorCode::None; }

private:
  void SetError(CsvErrorCode code);
  void FlushField();
  bool FinalizeRecord(std::size_t endPhysicalLine);

  RecordHandler handler_;
  Record current_;
  std::u16string field_;
  bool inQuotes_ = false;
  bool quoteAllowed_ = true;
  // 閉じ引用の直後は区切り（, / 改行 / EOF）以外を不正とする。
  bool expectFieldSeparator_ = false;
  bool recordEnded_ = false;
  bool finished_ = false;
  bool stopped_ = false;
  // CRLF がチャンク境界で分断されたときの保留 CR。
  bool pendingCr_ = false;
  // 引用内の " がチャンク末尾のときの保留。次投入でエスケープか閉じかを決める。
  bool pendingQuote_ = false;
  std::size_t physicalLine_ = 1;
  std::size_t startPhysicalLine_ = 1;
  std::size_t nextRecordNumber_ = 1;
  std::size_t expectedFieldCount_ = 0;
  bool hasExpectedFieldCount_ = false;
  CsvParseIssue issue_{};
};

// 論理レコードを指定出力設定でエンコードして返す。
std::string FormatCsvRecords(const std::vector<Record> &records, const OutputSettings &settings);

// ヘッダーとデータをまとめて解析し、結果を返す。
// 失敗した場合は ec にエラーを設定する。
ParsedCsv ParseCsv(const std::string &bytes, TextEncoding encoding, std::error_code &ec);

// 論理レコードを誤りなく出力できるか検証する。
// 文字コードが Windows-31J であり、表現できない文字がある場合は失敗にする。
std::error_code ValidateOutput(const std::vector<Record> &records, const OutputSettings &settings);

} // namespace csvmapper

namespace std {
template <> struct is_error_code_enum<csvmapper::CsvErrorCode> : true_type {};
} // namespace std

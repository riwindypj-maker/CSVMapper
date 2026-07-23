// CSV 読込概要（inspectInput）の Core 契約を定義する。
// 全レコードを保持せずストリーム走査で入力項目と問題を返すために存在する。
// RELEVANT FILES: src/csv_inspect.cpp, include/csvmapper/csv_format.h, tests/csv_inspect_tests.cpp

#pragma once

#include <atomic>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>
#include <string_view>
#include <vector>

#include "csvmapper/csv_format.h"

namespace csvmapper {

// 読込バッファの初期サイズ（NFR-PERF-006）。
inline constexpr std::size_t kInspectReadBufferBytes = 1024 * 1024;

// バイト列の供給口。OS ファイルダイアログとは切り離し、テストと Core で共有する。
class ByteSource {
public:
  virtual ~ByteSource() = default;
  virtual std::uint64_t Size() const = 0;
  virtual bool Rewind() = 0;
  // 最大 maxBytes まで読み、実際に読んだバイト数を返す。0 は EOF。
  virtual std::size_t Read(char *buffer, std::size_t maxBytes) = 0;
};

// メモリ上のバイト列を ByteSource として扱う。
class MemoryByteSource final : public ByteSource {
public:
  explicit MemoryByteSource(std::string bytes);

  std::uint64_t Size() const override;
  bool Rewind() override;
  std::size_t Read(char *buffer, std::size_t maxBytes) override;

private:
  std::string bytes_;
  std::size_t offset_ = 0;
};

// 入力項目（元ヘッダー・表示名・先頭データ行のサンプル）。
struct InputItem {
  std::string header;
  std::string displayName;
  std::u16string sample;
};

// 読込結果に含める問題。CSV 値そのものは載せない。
enum class InspectIssueSeverity {
  Warning,
  Error,
};

struct InspectIssue {
  InspectIssueSeverity severity = InspectIssueSeverity::Error;
  CsvErrorCode code = CsvErrorCode::None;
  std::string message;
  CsvRecordLocation location;
};

// inspectInput の結果。成功時だけセッション相当として確定してよい。
struct InspectInputResult {
  bool success = false;
  bool cancelled = false;
  std::string operationId;
  std::uint64_t byteSize = 0;
  TextEncoding detectedEncoding = TextEncoding::Utf8;
  std::vector<InputItem> items;
  std::size_t dataRowCount = 0;
  std::size_t columnCount = 0;
  std::vector<InspectIssue> issues;
};

struct InspectProgress {
  std::string operationId;
  std::uint64_t bytesRead = 0;
  std::uint64_t byteSize = 0;
  std::size_t recordsProcessed = 0;
};

using InspectProgressCallback = std::function<void(const InspectProgress &)>;

// 重複ヘッダーだけ列番号付き表示名にする（CSV-002）。
std::vector<std::string> BuildInputDisplayNames(const std::vector<std::string> &headers);

struct InspectInputOptions {
  TextEncoding encoding = TextEncoding::AutoDetect;
  const std::atomic<bool> *cancelFlag = nullptr;
  InspectProgressCallback onProgress;
  // 0 にするとチャンク境界・中止確認点のたびに進捗を通知する（テスト用）。
  std::chrono::milliseconds minProgressInterval{100};
  std::size_t readBufferBytes = kInspectReadBufferBytes;
};

// 入力 CSV をストリーム走査し、概要・入力項目・サンプル・問題を返す。
// 中止時は success=false / cancelled=true とし、部分結果を確定しない。
InspectInputResult InspectInput(std::string_view operationId, ByteSource &source,
                                const InspectInputOptions &options = {});

} // namespace csvmapper

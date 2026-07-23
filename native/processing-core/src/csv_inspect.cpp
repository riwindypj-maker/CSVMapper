// CSV 読込概要（inspectInput）の実装。
// 文字コード変換状態と CSV パーサー状態をチャンク間で保持し、全行保持を避ける。
// RELEVANT FILES: ../include/csvmapper/csv_inspect.h, ../include/csvmapper/csv_format.h, ../tests/csv_inspect_tests.cpp

#include "csvmapper/csv_inspect.h"

#include <algorithm>
#include <array>
#include <chrono>
#include <cstring>
#include <memory>
#include <string>
#include <string_view>
#include <unordered_map>
#include <utility>
#include <vector>

#include <unicode/ucnv.h>

namespace csvmapper {
namespace {

constexpr std::array<std::uint8_t, 3> kUtf8Bom = {0xEF, 0xBB, 0xBF};
constexpr std::size_t kCancelRecordBatch = 256;
constexpr auto kCancelTimeSlice = std::chrono::milliseconds(50);

const char *ConverterName(TextEncoding encoding) {
  switch (encoding) {
  case TextEncoding::Utf8:
  case TextEncoding::Utf8WithBom:
    return "UTF-8";
  case TextEncoding::Windows31J:
    return "windows-932";
  default:
    return nullptr;
  }
}

// ICU 変換器をチャンク間で保持し、不正バイトは置換せず失敗する。
class StreamingTextDecoder {
public:
  bool Open(TextEncoding encoding) {
    encoding_ = encoding;
    const char *name = ConverterName(encoding);
    if (name == nullptr)
      return false;
    UErrorCode status = U_ZERO_ERROR;
    converter_.reset(ucnv_open(name, &status));
    if (U_FAILURE(status) || !converter_)
      return false;
    ucnv_setToUCallBack(converter_.get(), UCNV_TO_U_CALLBACK_STOP, nullptr, nullptr, nullptr, &status);
    return U_SUCCESS(status);
  }

  bool Feed(const char *data, std::size_t size, std::vector<char16_t> &out, bool flush) {
    if (!converter_)
      return false;

    const char *source = data;
    std::size_t remaining = size;
    // BOM 不一致時に、既に一致していた接頭辞を変換入力へ戻すための一時領域。
    std::string rebound;

    // BOM 付き UTF-8 の先頭 3 バイトだけを読み飛ばす。
    if (!bomHandled_ && encoding_ == TextEncoding::Utf8WithBom) {
      while (remaining > 0 && bomSeen_ < kUtf8Bom.size()) {
        if (static_cast<std::uint8_t>(*source) != kUtf8Bom[bomSeen_]) {
          // 不一致時は消費済み接頭辞を捨てず、通常バイトとしてまとめて変換する。
          bomHandled_ = true;
          rebound.reserve(bomSeen_ + remaining);
          rebound.append(reinterpret_cast<const char *>(kUtf8Bom.data()), bomSeen_);
          rebound.append(source, remaining);
          source = rebound.data();
          remaining = rebound.size();
          bomSeen_ = 0;
          break;
        }
        ++source;
        --remaining;
        ++bomSeen_;
      }
      if (!bomHandled_ && bomSeen_ == kUtf8Bom.size())
        bomHandled_ = true;
      if (!bomHandled_ && flush) {
        // ファイル末尾まで BOM が揃わない場合は不正とする。
        return false;
      }
      if (!bomHandled_)
        return true;
    }

    UErrorCode status = U_ZERO_ERROR;
    const char *sourceLimit = source + remaining;
    char16_t buffer[256];
    while (source < sourceLimit || flush) {
      char16_t *target = buffer;
      char16_t *targetLimit = buffer + std::size(buffer);
      ucnv_toUnicode(converter_.get(), &target, targetLimit, &source, sourceLimit, nullptr, flush, &status);
      if (target != buffer)
        out.insert(out.end(), buffer, target);
      if (status == U_BUFFER_OVERFLOW_ERROR) {
        status = U_ZERO_ERROR;
        continue;
      }
      if (U_FAILURE(status))
        return false;
      if (!flush)
        break;
      // flush 完了。
      flush = false;
    }
    return true;
  }

private:
  TextEncoding encoding_ = TextEncoding::Utf8;
  std::unique_ptr<UConverter, void (*)(UConverter *)> converter_{nullptr, ucnv_close};
  bool bomHandled_ = false;
  std::size_t bomSeen_ = 0;
};

bool IsCancelled(const std::atomic<bool> *flag) { return flag != nullptr && flag->load(std::memory_order_relaxed); }

InspectIssue MakeErrorIssue(CsvErrorCode code, CsvRecordLocation location, std::string message) {
  InspectIssue issue;
  issue.severity = InspectIssueSeverity::Error;
  issue.code = code;
  issue.message = std::move(message);
  issue.location = location;
  return issue;
}

InspectIssue MakeHeaderOnlyWarning() {
  InspectIssue issue;
  issue.severity = InspectIssueSeverity::Warning;
  issue.code = CsvErrorCode::None;
  issue.message = "header only";
  return issue;
}

std::string MessageFor(CsvErrorCode code) {
  switch (code) {
  case CsvErrorCode::InvalidEncoding:
    return "invalid encoding";
  case CsvErrorCode::MalformedCsv:
    return "malformed CSV";
  case CsvErrorCode::InconsistentFieldCount:
    return "inconsistent field count";
  case CsvErrorCode::EmptyHeader:
    return "empty header";
  case CsvErrorCode::EmptyFile:
    return "empty file";
  default:
    return "csv inspect failed";
  }
}

// 末尾が UTF-8 マルチバイトの途中で切れているときだけ、その不完全部分を除く。
// Windows-31J の高ビット列を ASCII まで削ると UTF-8 誤判定になるため、触らない。
std::string_view StripIncompleteUtf8Suffix(std::string_view view) {
  if (view.empty())
    return view;

  const auto byteAt = [&](std::size_t index) { return static_cast<unsigned char>(view[index]); };

  // 末尾の UTF-8 継続バイト (10xxxxxx) を数える。最大 3。それ以上は不完全 UTF-8 ではない。
  std::size_t cont = 0;
  std::size_t i = view.size();
  while (i > 0 && (byteAt(i - 1) & 0xC0) == 0x80) {
    ++cont;
    --i;
    if (cont > 3)
      return view;
  }

  auto utf8ContinuationCount = [](unsigned char lead) -> int {
    if ((lead & 0xE0) == 0xC0)
      return 1;
    if ((lead & 0xF0) == 0xE0)
      return 2;
    if ((lead & 0xF8) == 0xF0)
      return 3;
    return -1;
  };

  if (cont == 0) {
    const unsigned char last = byteAt(view.size() - 1);
    if ((last & 0x80) == 0)
      return view;
    // 先頭バイトだけで終わっている不完全シーケンスだけ削る。
    if (utf8ContinuationCount(last) < 0)
      return view;
    view.remove_suffix(1);
    return view;
  }

  if (i == 0)
    return view;

  const unsigned char lead = byteAt(i - 1);
  const int needed = utf8ContinuationCount(lead);
  // 直前が UTF-8 先頭でなければ、W31J の途中切断などの可能性があるので触らない。
  if (needed < 0)
    return view;
  if (cont >= static_cast<std::size_t>(needed))
    return view;

  return view.substr(0, i - 1);
}

TextEncoding DetectEncodingFromSource(ByteSource &source, std::size_t readBufferBytes, std::error_code &ec) {
  ec.clear();
  if (!source.Rewind()) {
    ec = CsvErrorCode::InvalidEncoding;
    return TextEncoding::AutoDetect;
  }

  const std::size_t bufferSize = readBufferBytes == 0 ? kInspectReadBufferBytes : readBufferBytes;
  std::string sample;
  sample.resize(bufferSize);
  std::size_t n = source.Read(sample.data(), sample.size());
  sample.resize(n);

  // ファイル全体がバッファに収まる場合は既存の厳密判定を使う。
  if (source.Size() <= bufferSize) {
    const TextEncoding detected = DetectEncoding(sample);
    if (detected == TextEncoding::AutoDetect)
      ec = CsvErrorCode::InvalidEncoding;
    return detected;
  }

  auto tryDetect = [&](const std::string &bytes) -> TextEncoding {
    if (bytes.size() >= kUtf8Bom.size() && std::memcmp(bytes.data(), kUtf8Bom.data(), kUtf8Bom.size()) == 0)
      return TextEncoding::Utf8WithBom;

    // 不完全 UTF-8 末尾を除いたうえで判定する。削りすぎた ASCII 接頭辞だけを UTF-8 採用しない。
    const std::string_view stripped = StripIncompleteUtf8Suffix(bytes);
    if (!stripped.empty()) {
      const TextEncoding fromStripped = DetectEncoding(std::string(stripped));
      if (fromStripped == TextEncoding::Utf8 || fromStripped == TextEncoding::Utf8WithBom ||
          fromStripped == TextEncoding::Windows31J)
        return fromStripped;
    }

    const TextEncoding fromSample = DetectEncoding(bytes);
    if (fromSample == TextEncoding::Utf8 || fromSample == TextEncoding::Utf8WithBom ||
        fromSample == TextEncoding::Windows31J)
      return fromSample;
    return TextEncoding::AutoDetect;
  };

  // 先頭チャンクが ASCII だけのままだと Windows-31J 本文を見落とす。
  // 大容量時は判定用に最大 1MiB まで読んでから DetectEncoding する。
  const std::size_t detectLimit = std::max(bufferSize, kInspectReadBufferBytes);
  while (sample.size() < source.Size() && sample.size() < detectLimit) {
    std::string chunk(bufferSize, '\0');
    n = source.Read(chunk.data(), chunk.size());
    if (n == 0)
      break;
    sample.append(chunk.data(), n);
  }

  const TextEncoding detected = tryDetect(sample);
  if (detected == TextEncoding::AutoDetect)
    ec = CsvErrorCode::InvalidEncoding;
  return detected;
}

} // namespace

MemoryByteSource::MemoryByteSource(std::string bytes) : bytes_(std::move(bytes)) {}

std::uint64_t MemoryByteSource::Size() const { return bytes_.size(); }

bool MemoryByteSource::Rewind() {
  offset_ = 0;
  return true;
}

std::size_t MemoryByteSource::Read(char *buffer, std::size_t maxBytes) {
  if (buffer == nullptr || maxBytes == 0 || offset_ >= bytes_.size())
    return 0;
  const std::size_t n = std::min(maxBytes, bytes_.size() - offset_);
  std::memcpy(buffer, bytes_.data() + offset_, n);
  offset_ += n;
  return n;
}

std::vector<std::string> BuildInputDisplayNames(const std::vector<std::string> &headers) {
  std::unordered_map<std::string, std::size_t> counts;
  counts.reserve(headers.size());
  for (const auto &header : headers)
    ++counts[header];

  std::vector<std::string> displayNames;
  displayNames.reserve(headers.size());
  for (std::size_t i = 0; i < headers.size(); ++i) {
    if (counts[headers[i]] > 1) {
      displayNames.push_back(headers[i] + "［" + std::to_string(i + 1) + "列目］");
    } else {
      displayNames.push_back(headers[i]);
    }
  }
  return displayNames;
}

InspectInputResult InspectInput(std::string_view operationId, ByteSource &source, const InspectInputOptions &options) {
  InspectInputResult result;
  result.operationId = std::string(operationId);
  result.byteSize = source.Size();

  auto failWith = [&](CsvErrorCode code, CsvRecordLocation location = {}) {
    result.success = false;
    result.cancelled = false;
    result.items.clear();
    result.dataRowCount = 0;
    result.columnCount = 0;
    result.issues.clear();
    result.issues.push_back(MakeErrorIssue(code, location, MessageFor(code)));
    return result;
  };

  auto cancelResult = [&]() {
    result.success = false;
    result.cancelled = true;
    result.items.clear();
    result.dataRowCount = 0;
    result.columnCount = 0;
    result.issues.clear();
    return result;
  };

  if (IsCancelled(options.cancelFlag))
    return cancelResult();

  if (result.byteSize == 0)
    return failWith(CsvErrorCode::EmptyFile);

  TextEncoding encoding = options.encoding;
  if (encoding == TextEncoding::AutoDetect) {
    std::error_code detectEc;
    encoding = DetectEncodingFromSource(source, options.readBufferBytes, detectEc);
    if (detectEc || encoding == TextEncoding::AutoDetect)
      return failWith(CsvErrorCode::InvalidEncoding);
  }
  result.detectedEncoding = encoding;

  if (!source.Rewind())
    return failWith(CsvErrorCode::InvalidEncoding);

  StreamingTextDecoder decoder;
  if (!decoder.Open(encoding))
    return failWith(CsvErrorCode::InvalidEncoding);

  const std::size_t bufferSize = options.readBufferBytes == 0 ? kInspectReadBufferBytes : options.readBufferBytes;
  std::vector<char> readBuffer(bufferSize);

  bool headerAccepted = false;
  bool sampleCaptured = false;
  std::vector<std::string> headers;
  std::vector<std::u16string> sampleFields;
  std::size_t dataRowCount = 0;
  std::size_t recordsSinceCancelCheck = 0;
  auto lastCancelCheck = std::chrono::steady_clock::now();
  auto lastProgressAt = std::chrono::steady_clock::time_point{};
  std::uint64_t bytesRead = 0;
  std::size_t recordsProcessed = 0;
  bool sawAnyRecord = false;

  auto emitProgress = [&](bool force) {
    if (!options.onProgress)
      return;
    const auto now = std::chrono::steady_clock::now();
    if (!force && lastProgressAt.time_since_epoch().count() != 0 && options.minProgressInterval.count() > 0 &&
        now - lastProgressAt < options.minProgressInterval) {
      return;
    }
    lastProgressAt = now;
    InspectProgress progress;
    progress.operationId = result.operationId;
    progress.bytesRead = bytesRead;
    progress.byteSize = result.byteSize;
    progress.recordsProcessed = recordsProcessed;
    options.onProgress(progress);
  };

  auto shouldCancel = [&]() {
    if (IsCancelled(options.cancelFlag))
      return true;
    ++recordsSinceCancelCheck;
    const auto now = std::chrono::steady_clock::now();
    if (recordsSinceCancelCheck >= kCancelRecordBatch || now - lastCancelCheck >= kCancelTimeSlice) {
      recordsSinceCancelCheck = 0;
      lastCancelCheck = now;
      return IsCancelled(options.cancelFlag);
    }
    return false;
  };

  StreamingCsvParser parser;
  parser.SetRecordHandler([&](Record record, CsvRecordLocation location) {
    sawAnyRecord = true;
    ++recordsProcessed;

    if (shouldCancel())
      return false;

    if (!headerAccepted) {
      headers.clear();
      headers.reserve(record.fields.size());
      for (const auto &field : record.fields) {
        if (field.empty() || std::all_of(field.begin(), field.end(), [](char16_t c) { return c == u' '; })) {
          result.issues.push_back(
              MakeErrorIssue(CsvErrorCode::EmptyHeader, location, MessageFor(CsvErrorCode::EmptyHeader)));
          return false;
        }
        std::error_code encodeEc;
        std::string headerUtf8 = EncodeUtf16(field, TextEncoding::Utf8, encodeEc);
        if (encodeEc) {
          result.issues.push_back(
              MakeErrorIssue(CsvErrorCode::InvalidEncoding, location, MessageFor(CsvErrorCode::InvalidEncoding)));
          return false;
        }
        headers.push_back(std::move(headerUtf8));
      }
      headerAccepted = true;
      emitProgress(false);
      return true;
    }

    if (!sampleCaptured) {
      sampleFields = record.fields;
      sampleCaptured = true;
    }
    ++dataRowCount;
    emitProgress(false);
    return true;
  });

  for (;;) {
    if (IsCancelled(options.cancelFlag))
      return cancelResult();

    const std::size_t n = source.Read(readBuffer.data(), readBuffer.size());
    bytesRead += n;

    std::vector<char16_t> decoded;
    const bool atEnd = (n == 0);
    if (n > 0) {
      if (!decoder.Feed(readBuffer.data(), n, decoded, false))
        return failWith(CsvErrorCode::InvalidEncoding);
    }
    if (atEnd) {
      // 入力終端。変換器に残ったバイトを確定する。
      if (!decoder.Feed("", 0, decoded, true))
        return failWith(CsvErrorCode::InvalidEncoding);
    }

    if (!decoded.empty()) {
      if (!parser.Feed(decoded)) {
        if (IsCancelled(options.cancelFlag))
          return cancelResult();
        const auto &issue = parser.GetIssue();
        if (issue.code != CsvErrorCode::None)
          return failWith(issue.code, issue.location);
        if (!result.issues.empty()) {
          result.success = false;
          result.items.clear();
          result.dataRowCount = 0;
          result.columnCount = 0;
          return result;
        }
        return failWith(CsvErrorCode::MalformedCsv);
      }
    }

    // チャンク境界でも中止を確認する。
    if (IsCancelled(options.cancelFlag))
      return cancelResult();

    emitProgress(false);

    if (atEnd)
      break;
  }

  if (!parser.Finish()) {
    // ハンドラが中止で false を返した場合は GetIssue が空のことがある。
    if (IsCancelled(options.cancelFlag))
      return cancelResult();
    const auto &issue = parser.GetIssue();
    if (issue.code != CsvErrorCode::None)
      return failWith(issue.code, issue.location);
    if (!result.issues.empty()) {
      result.success = false;
      result.items.clear();
      result.dataRowCount = 0;
      result.columnCount = 0;
      return result;
    }
    return failWith(CsvErrorCode::MalformedCsv);
  }

  if (IsCancelled(options.cancelFlag))
    return cancelResult();

  if (!headerAccepted || !sawAnyRecord)
    return failWith(CsvErrorCode::EmptyFile);

  const auto displayNames = BuildInputDisplayNames(headers);
  result.items.reserve(headers.size());
  for (std::size_t i = 0; i < headers.size(); ++i) {
    InputItem item;
    item.header = headers[i];
    item.displayName = displayNames[i];
    if (sampleCaptured && i < sampleFields.size())
      item.sample = sampleFields[i];
    result.items.push_back(std::move(item));
  }

  result.columnCount = headers.size();
  result.dataRowCount = dataRowCount;
  result.success = true;
  result.cancelled = false;
  if (dataRowCount == 0)
    result.issues.push_back(MakeHeaderOnlyWarning());

  emitProgress(true);
  return result;
}

} // namespace csvmapper

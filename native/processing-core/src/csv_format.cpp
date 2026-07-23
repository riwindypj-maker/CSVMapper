// CSV 解析と出力表現の実装。
// 入力バイト列の文字コード変換と RFC 4180 相当の解析を共通化する。
// RELEVANT FILES: ../include/csvmapper/csv_format.h, ../tests/csv_format_tests.cpp

#include "csvmapper/csv_format.h"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstring>
#include <iterator>
#include <memory>
#include <sstream>
#include <string>
#include <string_view>
#include <system_error>
#include <vector>

#include <unicode/ucnv.h>

namespace csvmapper {

namespace {

class ErrorCategory : public std::error_category {
public:
  const char *name() const noexcept override { return "csvmapper::csv"; }
  std::string message(int ev) const override {
    switch (static_cast<CsvErrorCode>(ev)) {
    case CsvErrorCode::None:
      return "no error";
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
    case CsvErrorCode::Windows31JUnmappable:
      return "character not representable in Windows-31J";
    }
    return "unknown CSV error";
  }
};

const ErrorCategory &Category() {
  static ErrorCategory instance;
  return instance;
}

constexpr std::array<std::uint8_t, 3> kUtf8Bom = {0xEF, 0xBB, 0xBF};

bool IsValidUtf8(const std::string_view bytes) {
  std::size_t i = 0;
  while (i < bytes.size()) {
    const unsigned char c = static_cast<unsigned char>(bytes[i]);
    std::size_t trailing = 0;
    if ((c & 0x80) == 0) {
      ++i;
      continue;
    }
    if ((c & 0xE0) == 0xC0) {
      trailing = 1;
    } else if ((c & 0xF0) == 0xE0) {
      trailing = 2;
    } else if ((c & 0xF8) == 0xF0) {
      trailing = 3;
    } else {
      return false;
    }
    if (i + trailing >= bytes.size())
      return false;
    for (std::size_t j = 1; j <= trailing; ++j) {
      const unsigned char d = static_cast<unsigned char>(bytes[i + j]);
      if ((d & 0xC0) != 0x80)
        return false;
    }
    if (trailing == 3) {
      const std::uint32_t codepoint =
          (static_cast<std::uint32_t>(c & 0x07) << 18) | (static_cast<std::uint32_t>(bytes[i + 1] & 0x3F) << 12) |
          (static_cast<std::uint32_t>(bytes[i + 2] & 0x3F) << 6) | (static_cast<std::uint32_t>(bytes[i + 3] & 0x3F));
      if (codepoint > 0x10FFFF || codepoint < 0x10000)
        return false;
    } else if (trailing == 2) {
      const std::uint32_t codepoint = (static_cast<std::uint32_t>(c & 0x0F) << 12) |
                                      (static_cast<std::uint32_t>(bytes[i + 1] & 0x3F) << 6) |
                                      (static_cast<std::uint32_t>(bytes[i + 2] & 0x3F));
      if (codepoint >= 0xD800 && codepoint <= 0xDFFF)
        return false;
    } else if (trailing == 1) {
      const std::uint32_t codepoint =
          (static_cast<std::uint32_t>(c & 0x1F) << 6) | (static_cast<std::uint32_t>(bytes[i + 1] & 0x3F));
      if (codepoint < 0x80)
        return false;
    }
    i += trailing + 1;
  }
  return true;
}

bool IsValidWindows31J(const std::string_view bytes) {
  UErrorCode status = U_ZERO_ERROR;
  std::unique_ptr<UConverter, void (*)(UConverter *)> converter(ucnv_open("windows-932", &status), ucnv_close);
  if (U_FAILURE(status))
    return false;
  ucnv_setToUCallBack(converter.get(), UCNV_TO_U_CALLBACK_STOP, nullptr, nullptr, nullptr, &status);
  if (U_FAILURE(status))
    return false;

  const char *source = bytes.data();
  const char *sourceLimit = source + bytes.size();
  UChar buffer[256];
  while (source < sourceLimit) {
    UChar *target = buffer;
    UChar *targetLimit = buffer + std::size(buffer);
    ucnv_toUnicode(converter.get(), &target, targetLimit, &source, sourceLimit, nullptr, false, &status);
    if (U_FAILURE(status))
      return status == U_BUFFER_OVERFLOW_ERROR ? true : false;
  }
  return true;
}

std::vector<char16_t> ConvertWithConverter(const std::string &bytes, const char *name, bool stopOnError) {
  UErrorCode status = U_ZERO_ERROR;
  std::unique_ptr<UConverter, void (*)(UConverter *)> converter(ucnv_open(name, &status), ucnv_close);
  if (U_FAILURE(status))
    return {};
  if (stopOnError) {
    ucnv_setToUCallBack(converter.get(), UCNV_TO_U_CALLBACK_STOP, nullptr, nullptr, nullptr, &status);
  } else {
    ucnv_setToUCallBack(converter.get(), UCNV_TO_U_CALLBACK_SUBSTITUTE, nullptr, nullptr, nullptr, &status);
  }
  if (U_FAILURE(status))
    return {};

  std::vector<char16_t> result;
  result.reserve(bytes.size());
  const char *source = bytes.data();
  const char *sourceLimit = source + bytes.size();
  char16_t buffer[256];
  while (source < sourceLimit) {
    char16_t *target = buffer;
    char16_t *targetLimit = buffer + std::size(buffer);
    ucnv_toUnicode(converter.get(), &target, targetLimit, &source, sourceLimit, nullptr, false, &status);
    if (U_FAILURE(status) && status != U_BUFFER_OVERFLOW_ERROR)
      return {};
    result.insert(result.end(), buffer, target);
    status = U_ZERO_ERROR;
  }
  return result;
}

std::string ConvertFromUtf16(const std::u16string &text, const char *name,
                             UConverterFromUCallback callback = UCNV_FROM_U_CALLBACK_STOP,
                             bool *hadUnmappable = nullptr) {
  UErrorCode status = U_ZERO_ERROR;
  std::unique_ptr<UConverter, void (*)(UConverter *)> converter(ucnv_open(name, &status), ucnv_close);
  if (U_FAILURE(status))
    return {};
  ucnv_setFromUCallBack(converter.get(), callback, nullptr, nullptr, nullptr, &status);
  if (U_FAILURE(status))
    return {};

  std::string result;
  result.reserve(text.size() * 2);
  const UChar *source = reinterpret_cast<const UChar *>(text.data());
  const UChar *sourceLimit = source + text.size();
  char buffer[256];
  while (source < sourceLimit) {
    char *target = buffer;
    char *targetLimit = buffer + std::size(buffer);
    ucnv_fromUnicode(converter.get(), &target, targetLimit, &source, sourceLimit, nullptr, false, &status);
    if (status == U_INVALID_CHAR_FOUND || status == U_ILLEGAL_CHAR_FOUND) {
      if (hadUnmappable)
        *hadUnmappable = true;
      return {};
    }
    if (U_FAILURE(status) && status != U_BUFFER_OVERFLOW_ERROR)
      return {};
    result.insert(result.end(), buffer, target);
    status = U_ZERO_ERROR;
  }
  return result;
}

} // namespace

std::error_code make_error_code(CsvErrorCode code) { return {static_cast<int>(code), Category()}; }

TextEncoding DetectEncoding(const std::string &bytes) {
  if (bytes.size() >= kUtf8Bom.size() && std::memcmp(bytes.data(), kUtf8Bom.data(), kUtf8Bom.size()) == 0) {
    return TextEncoding::Utf8WithBom;
  }
  if (IsValidUtf8(bytes))
    return TextEncoding::Utf8;
  if (IsValidWindows31J(bytes))
    return TextEncoding::Windows31J;
  return TextEncoding::AutoDetect; // 不明
}

std::vector<char16_t> DecodeBytes(const std::string &bytes, TextEncoding encoding, std::error_code &ec) {
  ec.clear();
  if (encoding == TextEncoding::AutoDetect) {
    encoding = DetectEncoding(bytes);
    if (encoding == TextEncoding::AutoDetect) {
      ec = CsvErrorCode::InvalidEncoding;
      return {};
    }
  }

  std::string_view source = bytes;
  if (encoding == TextEncoding::Utf8WithBom && bytes.size() >= kUtf8Bom.size()) {
    source = std::string_view(bytes.data() + kUtf8Bom.size(), bytes.size() - kUtf8Bom.size());
  }

  switch (encoding) {
  case TextEncoding::Utf8:
  case TextEncoding::Utf8WithBom: {
    auto decoded = ConvertWithConverter(std::string(source), "UTF-8", true);
    // 非空入力が空結果になった場合は変換失敗として扱う。
    if (decoded.empty() && !source.empty()) {
      ec = CsvErrorCode::InvalidEncoding;
      return {};
    }
    return decoded;
  }
  case TextEncoding::Windows31J: {
    auto decoded = ConvertWithConverter(std::string(source), "windows-932", true);
    if (decoded.empty() && !source.empty()) {
      ec = CsvErrorCode::InvalidEncoding;
      return {};
    }
    return decoded;
  }
  default:
    ec = CsvErrorCode::InvalidEncoding;
    return {};
  }
}

std::string EncodeUtf16(const std::u16string &text, TextEncoding encoding, std::error_code &ec) {
  ec.clear();
  switch (encoding) {
  case TextEncoding::Utf8:
  case TextEncoding::Utf8WithBom:
    return ConvertFromUtf16(text, "UTF-8");
  case TextEncoding::Windows31J: {
    bool hadUnmappable = false;
    std::string encoded = ConvertFromUtf16(text, "windows-932", UCNV_FROM_U_CALLBACK_STOP, &hadUnmappable);
    if (hadUnmappable) {
      ec = CsvErrorCode::Windows31JUnmappable;
      return {};
    }
    return encoded;
  }
  default:
    ec = CsvErrorCode::InvalidEncoding;
    return {};
  }
}

std::vector<Record> ParseCsvRecords(const std::vector<char16_t> &utf16, std::error_code &ec) {
  ec.clear();
  std::vector<Record> records;
  if (utf16.empty()) {
    ec = CsvErrorCode::EmptyFile;
    return records;
  }

  Record current;
  std::u16string field;
  bool inQuotes = false;
  bool quoteAllowed = true;
  // 閉じ引用の直後は区切り（, / 改行 / EOF）以外を不正とする。
  bool expectFieldSeparator = false;
  bool recordEnded = false;
  std::size_t physicalLine = 1;
  std::size_t startPhysicalLine = 1;

  auto flushField = [&]() {
    current.fields.push_back(std::move(field));
    field.clear();
  };

  auto finalizeRecord = [&]() {
    flushField();
    records.push_back(std::move(current));
    current = Record{};
    startPhysicalLine = physicalLine;
    recordEnded = true;
    quoteAllowed = true;
    expectFieldSeparator = false;
  };

  for (std::size_t i = 0; i < utf16.size(); ++i) {
    const char16_t c = utf16[i];
    const char16_t next = (i + 1 < utf16.size()) ? utf16[i + 1] : 0;
    recordEnded = false;

    if (inQuotes) {
      if (c == u'"') {
        if (next == u'"') {
          field.push_back(u'"');
          ++i;
        } else {
          inQuotes = false;
          quoteAllowed = false;
          expectFieldSeparator = true;
        }
      } else if (c == u'\r') {
        if (next == u'\n') {
          ++i;
          ++physicalLine;
        } else {
          ++physicalLine;
        }
        field.push_back(u'\n');
      } else if (c == u'\n') {
        ++physicalLine;
        field.push_back(u'\n');
      } else {
        field.push_back(c);
      }
      continue;
    }

    if (c == u'"' && quoteAllowed) {
      inQuotes = true;
      quoteAllowed = false;
      continue;
    }

    if (c == u',') {
      flushField();
      quoteAllowed = true;
      expectFieldSeparator = false;
    } else if (c == u'\r') {
      if (next == u'\n')
        ++i;
      ++physicalLine;
      finalizeRecord();
    } else if (c == u'\n') {
      ++physicalLine;
      finalizeRecord();
    } else {
      if (expectFieldSeparator) {
        ec = CsvErrorCode::MalformedCsv;
        return {};
      }
      field.push_back(c);
      quoteAllowed = false;
    }
  }

  if (inQuotes) {
    ec = CsvErrorCode::MalformedCsv;
    return {};
  }

  if (!recordEnded) {
    finalizeRecord();
  }

  // 最後の空レコード（例：空行）を除去
  while (!records.empty() && records.back().fields.empty())
    records.pop_back();

  if (records.empty()) {
    ec = CsvErrorCode::EmptyFile;
    return records;
  }

  // 項目数一致チェック
  const std::size_t expected = records.front().fields.size();
  for (std::size_t r = 1; r < records.size(); ++r) {
    if (records[r].fields.size() != expected) {
      ec = CsvErrorCode::InconsistentFieldCount;
      return {};
    }
  }

  return records;
}

std::string FormatCsvRecords(const std::vector<Record> &records, const OutputSettings &settings) {
  if (records.empty())
    return {};

  std::u16string output;
  output.reserve(records.size() * records.front().fields.size() * 4);

  auto appendField = [&](const std::u16string &value) {
    output.push_back(u'"');
    for (char16_t c : value) {
      if (c == u'"')
        output.append(u"\"\"");
      else
        output.push_back(c);
    }
    output.push_back(u'"');
  };

  const char16_t newlineChar = (settings.lineEnding == LineEnding::CRLF) ? u'\r' : u'\n';

  for (std::size_t r = 0; r < records.size(); ++r) {
    if (r > 0)
      output.push_back(newlineChar);
    if (settings.lineEnding == LineEnding::CRLF)
      output.push_back(u'\n');

    for (std::size_t f = 0; f < records[r].fields.size(); ++f) {
      if (f > 0)
        output.push_back(u',');
      appendField(records[r].fields[f]);
    }
  }

  std::error_code ec;
  std::string encoded = EncodeUtf16(output, settings.encoding, ec);
  if (ec)
    return {};
  if (settings.encoding == TextEncoding::Utf8WithBom) {
    constexpr std::array<std::uint8_t, 3> kBom = {0xEF, 0xBB, 0xBF};
    encoded.insert(encoded.begin(), kBom.begin(), kBom.end());
  }
  return encoded;
}

ParsedCsv ParseCsv(const std::string &bytes, TextEncoding encoding, std::error_code &ec) {
  ec.clear();
  ParsedCsv result;
  if (encoding == TextEncoding::AutoDetect) {
    encoding = DetectEncoding(bytes);
    if (encoding == TextEncoding::AutoDetect) {
      ec = CsvErrorCode::InvalidEncoding;
      return result;
    }
  }
  result.detectedEncoding = encoding;

  auto decoded = DecodeBytes(bytes, encoding, ec);
  if (ec)
    return result;

  auto records = ParseCsvRecords(decoded, ec);
  if (ec)
    return result;

  if (records.empty()) {
    ec = CsvErrorCode::EmptyFile;
    return result;
  }

  Record headerRecord = std::move(records.front());
  records.erase(records.begin());

  for (const auto &h : headerRecord.fields) {
    if (h.empty() || std::all_of(h.begin(), h.end(), [](char16_t c) { return c == u' '; })) {
      ec = CsvErrorCode::EmptyHeader;
      return result;
    }
    // 表示・重複識別用にヘッダー名を UTF-8 へエンコードして保持する。
    std::error_code encodeEc;
    std::string headerUtf8 = EncodeUtf16(h, TextEncoding::Utf8, encodeEc);
    if (encodeEc) {
      ec = encodeEc;
      return result;
    }
    result.headers.push_back(std::move(headerUtf8));
  }

  result.records = std::move(records);
  return result;
}

std::error_code ValidateOutput(const std::vector<Record> &records, const OutputSettings &settings) {
  if (settings.encoding != TextEncoding::Windows31J)
    return {};

  for (const auto &record : records) {
    for (const auto &field : record.fields) {
      std::error_code ec;
      EncodeUtf16(field, settings.encoding, ec);
      if (ec)
        return ec;
    }
  }
  return {};
}

} // namespace csvmapper
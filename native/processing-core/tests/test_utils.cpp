// ドメインテスト間で共通する UTF-8/UTF-16 変換ヘルパーを実装する。
// RELEVANT FILES: test_utils.h

#include "test_utils.h"
#include "csvmapper/csv_format.h"

#include <system_error>

namespace csvmapper {

std::string ToUtf8(const std::u16string &u16) {
  std::error_code ec;
  std::string utf8 = EncodeUtf16(u16, TextEncoding::Utf8, ec);
  if (ec)
    throw std::system_error(ec, "ToUtf8");
  return utf8;
}

std::u16string ToUtf16(const std::string &utf8) {
  std::error_code ec;
  const auto decoded = DecodeBytes(utf8, TextEncoding::Utf8, ec);
  if (ec)
    throw std::system_error(ec, "ToUtf16");
  return std::u16string(decoded.begin(), decoded.end());
}

std::u16string operator""_u16(const char *str, std::size_t len) { return ToUtf16(std::string(str, len)); }

} // namespace csvmapper

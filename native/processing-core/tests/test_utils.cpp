// ドメインテスト間で共通する UTF-8/UTF-16 変換ヘルパーを実装する。
// RELEVANT FILES: test_utils.h

#include "test_utils.h"

namespace csvmapper {

std::string ToUtf8(const std::u16string &u16) {
  std::string result;
  for (char16_t c : u16) {
    if (c <= 0x7F) {
      result.push_back(static_cast<char>(c));
    } else if (c <= 0x7FF) {
      result.push_back(static_cast<char>(0xC0 | (c >> 6)));
      result.push_back(static_cast<char>(0x80 | (c & 0x3F)));
    } else {
      result.push_back(static_cast<char>(0xE0 | (c >> 12)));
      result.push_back(static_cast<char>(0x80 | ((c >> 6) & 0x3F)));
      result.push_back(static_cast<char>(0x80 | (c & 0x3F)));
    }
  }
  return result;
}

std::u16string ToUtf16(const std::string &utf8) {
  std::u16string result;
  for (std::size_t i = 0; i < utf8.size();) {
    const unsigned char c = static_cast<unsigned char>(utf8[i]);
    if ((c & 0x80) == 0) {
      result.push_back(static_cast<char16_t>(c));
      ++i;
    } else if ((c & 0xE0) == 0xC0 && i + 1 < utf8.size()) {
      result.push_back(static_cast<char16_t>(((c & 0x1F) << 6) | (static_cast<unsigned char>(utf8[i + 1]) & 0x3F)));
      i += 2;
    } else if ((c & 0xF0) == 0xE0 && i + 2 < utf8.size()) {
      result.push_back(static_cast<char16_t>(((c & 0x0F) << 12) |
                                             ((static_cast<unsigned char>(utf8[i + 1]) & 0x3F) << 6) |
                                             (static_cast<unsigned char>(utf8[i + 2]) & 0x3F)));
      i += 3;
    } else {
      ++i;
    }
  }
  return result;
}

std::u16string operator""_u16(const char *str, std::size_t len) { return ToUtf16(std::string(str, len)); }

} // namespace csvmapper

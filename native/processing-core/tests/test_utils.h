// ドメインテスト間で共通する UTF-8/UTF-16 変換ヘルパーを提供する。
// RELEVANT FILES: tests/*_tests.cpp

#pragma once

#include <string>

namespace csvmapper {

std::string ToUtf8(const std::u16string &u16);
std::u16string ToUtf16(const std::string &utf8);
std::u16string operator""_u16(const char *str, std::size_t len);

} // namespace csvmapper

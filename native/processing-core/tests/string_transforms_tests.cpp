// 15 種類の文字列編集ブロックのドメインテスト。
// RELEVANT FILES: ../include/csvmapper/string_transforms.h, ../src/string_transforms.cpp

#include "csvmapper/string_transforms.h"
#include "test_utils.h"

#include <cassert>
#include <string>
#include <system_error>
#include <variant>
#include <vector>

namespace csvmapper {

void TestFrontTrim() {
  auto result = EvaluateBlock(BlockType::FrontTrim, {u"abcde"}, PositionLengthConfig{1, 2});
  assert(std::get<std::u16string>(result) == u"cde");
}

void TestBackTrim() {
  auto result = EvaluateBlock(BlockType::BackTrim, {u"abcde"}, PositionLengthConfig{1, 2});
  assert(std::get<std::u16string>(result) == u"abc");
}

void TestDeleteAt() {
  auto result = EvaluateBlock(BlockType::DeleteAt, {u"A\U0001F468\u200D\U0001F469\u200D\U0001F467\u200D\U0001F466B"},
                              PositionLengthConfig{2, 1});
  assert(std::get<std::u16string>(result) == u"AB");
}

void TestSubstring() {
  auto result = EvaluateBlock(BlockType::Substring, {u"A\U0001F468\u200D\U0001F469\u200D\U0001F467\u200D\U0001F466B"},
                              PositionLengthConfig{2, 1});
  assert(std::get<std::u16string>(result) == u"\U0001F468\u200D\U0001F469\u200D\U0001F467\u200D\U0001F466");
}

void TestOutOfRange() {
  auto result = EvaluateBlock(BlockType::Substring, {u"abc"}, PositionLengthConfig{5, 2});
  assert(std::get<std::u16string>(result).empty());
  auto result2 = EvaluateBlock(BlockType::DeleteAt, {u"abc"}, PositionLengthConfig{5, 2});
  assert(std::get<std::u16string>(result2) == u"abc");
}

void TestReplace() {
  auto result = EvaluateBlock(BlockType::Replace, {u"aaaa"}, StringPairConfig{u"aa", u"b"});
  assert(std::get<std::u16string>(result) == u"bb");
}

void TestDeleteAll() {
  auto result = EvaluateBlock(BlockType::DeleteAll, {u"abab"}, StringPairConfig{u"ab", u""});
  assert(std::get<std::u16string>(result).empty());
}

void TestTrim() {
  auto result = EvaluateBlock(BlockType::Trim, {u" \t\u3000abc \u3000"}, {});
  assert(std::get<std::u16string>(result) == u"abc");
}

void TestRemoveWhitespace() {
  auto result = EvaluateBlock(BlockType::RemoveWhitespace, {u"a b\u3000c"}, {});
  assert(std::get<std::u16string>(result) == u"abc");
}

void TestCase() {
  auto upper = EvaluateBlock(BlockType::ToUpper, {u"aZ\u00e9"}, {});
  assert(std::get<std::u16string>(upper) == u"AZ\u00e9");
  auto lower = EvaluateBlock(BlockType::ToLower, {u"Az\u00c9"}, {});
  assert(std::get<std::u16string>(lower) == u"az\u00c9");
}

void TestPrefixSuffix() {
  auto prefixed = EvaluateBlock(BlockType::Prefix, {u"X"}, ConstantConfig{u"PRE"});
  assert(std::get<std::u16string>(prefixed) == u"PREX");
  auto suffixed = EvaluateBlock(BlockType::Suffix, {u"X"}, ConstantConfig{u"SUF"});
  assert(std::get<std::u16string>(suffixed) == u"XSUF");
}

void TestReplaceIfEmpty() {
  auto result = EvaluateBlock(BlockType::ReplaceIfEmpty, {u""}, ConstantConfig{u"default"});
  assert(std::get<std::u16string>(result) == u"default");
  auto result2 = EvaluateBlock(BlockType::ReplaceIfEmpty, {u"x"}, ConstantConfig{u"default"});
  assert(std::get<std::u16string>(result2) == u"x");
}

void TestJoin() {
  auto result = EvaluateBlock(BlockType::Join, {u"A", u"", u"B"}, JoinConfig{u",", true});
  assert(std::get<std::u16string>(result) == u"A,B");
  auto result2 = EvaluateBlock(BlockType::Join, {u"A", u"", u"B"}, JoinConfig{u",", false});
  assert(std::get<std::u16string>(result2) == u"A,,B");
}

void TestInvalidParameter() {
  auto result = EvaluateBlock(BlockType::Substring, {u"abc"}, PositionLengthConfig{0, 1});
  assert(std::get<std::error_code>(result) == TransformErrorCode::InvalidParameter);
}

void TestMissingTarget() {
  auto result = EvaluateBlock(BlockType::Replace, {u"abc"}, StringPairConfig{u"", u"x"});
  assert(std::get<std::error_code>(result) == TransformErrorCode::MissingRequiredParameter);
}

void TestConstantEmpty() {
  auto result = EvaluateBlock(BlockType::Constant, {}, ConstantConfig{u""});
  assert(std::get<std::u16string>(result).empty());
}

} // namespace csvmapper

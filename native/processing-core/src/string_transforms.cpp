// 15 種類の文字列編集ブロックの実装。
// RELEVANT FILES: ../include/csvmapper/string_transforms.h, ../tests/string_transforms_tests.cpp

#include "csvmapper/string_transforms.h"

#include <cctype>
#include <cstddef>
#include <string>
#include <system_error>
#include <vector>

#include <unicode/brkiter.h>

namespace csvmapper {

namespace {

class ErrorCategory : public std::error_category {
public:
  const char *name() const noexcept override { return "csvmapper::transform"; }
  std::string message(int ev) const override {
    switch (static_cast<TransformErrorCode>(ev)) {
    case TransformErrorCode::None:
      return "no error";
    case TransformErrorCode::InvalidParameter:
      return "invalid parameter";
    case TransformErrorCode::MissingRequiredParameter:
      return "missing required parameter";
    case TransformErrorCode::TooFewInputs:
      return "too few inputs";
    }
    return "unknown transform error";
  }
};

const ErrorCategory &Category() {
  static ErrorCategory instance;
  return instance;
}

// 書記素クラスタの境界インデックスを集める。
std::vector<std::size_t> GraphemeBoundaries(const std::u16string &text) {
  UErrorCode status = U_ZERO_ERROR;
  std::unique_ptr<icu::BreakIterator> iter(
      icu::BreakIterator::createCharacterInstance(icu::Locale::getDefault(), status));
  if (U_FAILURE(status))
    return {};

  icu::UnicodeString ustr(reinterpret_cast<const char16_t *>(text.data()), static_cast<int32_t>(text.size()));
  iter->setText(ustr);

  std::vector<std::size_t> boundaries;
  boundaries.push_back(0);
  int32_t pos = iter->next();
  while (pos != icu::BreakIterator::DONE) {
    boundaries.push_back(static_cast<std::size_t>(pos));
    pos = iter->next();
  }
  return boundaries;
}

// 位置と長さから UTF-16 コードユニット単位の範囲を計算する。
std::pair<std::size_t, std::size_t> GraphemeRange(const std::u16string &text, std::size_t position,
                                                  std::size_t length) {
  const auto boundaries = GraphemeBoundaries(text);
  if (position > boundaries.size() - 1)
    return {text.size(), 0};
  const std::size_t start = boundaries[position - 1];
  const std::size_t endIndex = std::min(position - 1 + length, boundaries.size() - 1);
  return {start, boundaries[endIndex] - start};
}

std::u16string FrontTrimImpl(const std::u16string &input, std::size_t count) {
  const auto [start, len] = GraphemeRange(input, 1, count);
  if (start + len > input.size())
    return {};
  return input.substr(start + len);
}

std::u16string BackTrimImpl(const std::u16string &input, std::size_t count) {
  const std::size_t total = GraphemeClusterCount(input);
  if (count >= total)
    return {};
  const auto [start, len] = GraphemeRange(input, total - count + 1, count);
  if (start > input.size())
    return input;
  return input.substr(0, start);
}

std::u16string DeleteAtImpl(const std::u16string &input, std::size_t position, std::size_t length) {
  const auto [start, len] = GraphemeRange(input, position, length);
  if (start >= input.size())
    return input;
  return input.substr(0, start) + input.substr(start + len);
}

std::u16string SubstringImpl(const std::u16string &input, std::size_t position, std::size_t length) {
  const auto [start, len] = GraphemeRange(input, position, length);
  if (start >= input.size())
    return {};
  return input.substr(start, len);
}

std::u16string ReplaceImpl(const std::u16string &input, const std::u16string &target,
                           const std::u16string &replacement) {
  std::u16string result;
  result.reserve(input.size());
  std::size_t pos = 0;
  while (pos < input.size()) {
    const std::size_t found = input.find(target, pos);
    if (found == std::u16string::npos) {
      result.append(input.substr(pos));
      break;
    }
    result.append(input.substr(pos, found - pos));
    result.append(replacement);
    pos = found + target.size();
  }
  return result;
}

std::u16string DeleteAllImpl(const std::u16string &input, const std::u16string &target) {
  return ReplaceImpl(input, target, {});
}

std::u16string TrimImpl(const std::u16string &input) {
  const auto isSpace = [](char16_t c) { return c == u' ' || c == u'\t' || c == u'\u3000'; };
  std::size_t start = 0;
  while (start < input.size() && isSpace(input[start]))
    ++start;
  if (start == input.size())
    return {};
  std::size_t end = input.size();
  while (end > start && isSpace(input[end - 1]))
    --end;
  return input.substr(start, end - start);
}

std::u16string RemoveWhitespaceImpl(const std::u16string &input) {
  std::u16string result;
  result.reserve(input.size());
  for (char16_t c : input) {
    if (c != u' ' && c != u'\u3000')
      result.push_back(c);
  }
  return result;
}

std::u16string ToUpperImpl(const std::u16string &input) {
  std::u16string result = input;
  for (char16_t &c : result) {
    if (c >= u'a' && c <= u'z')
      c = static_cast<char16_t>(c - u'a' + u'A');
  }
  return result;
}

std::u16string ToLowerImpl(const std::u16string &input) {
  std::u16string result = input;
  for (char16_t &c : result) {
    if (c >= u'A' && c <= u'Z')
      c = static_cast<char16_t>(c - u'A' + u'a');
  }
  return result;
}

std::u16string JoinImpl(const std::vector<std::u16string> &inputs, const std::u16string &separator, bool ignoreEmpty) {
  std::vector<std::u16string> filtered;
  filtered.reserve(inputs.size());
  for (const auto &v : inputs) {
    if (!ignoreEmpty || !v.empty())
      filtered.push_back(v);
  }
  if (filtered.empty())
    return {};
  std::u16string result = filtered.front();
  for (std::size_t i = 1; i < filtered.size(); ++i) {
    result.append(separator);
    result.append(filtered[i]);
  }
  return result;
}

} // namespace

std::error_code make_error_code(TransformErrorCode code) { return {static_cast<int>(code), Category()}; }

std::size_t GraphemeClusterCount(const std::u16string &text) {
  const auto boundaries = GraphemeBoundaries(text);
  return boundaries.empty() ? 0 : boundaries.size() - 1;
}

std::variant<std::u16string, std::error_code> EvaluateBlock(BlockType type, const std::vector<std::u16string> &inputs,
                                                            const BlockConfig &config) {
  switch (type) {
  case BlockType::FrontTrim: {
    if (inputs.size() != 1)
      return TransformErrorCode::TooFewInputs;
    if (std::holds_alternative<PositionLengthConfig>(config)) {
      const auto &cfg = std::get<PositionLengthConfig>(config);
      if (cfg.position != 1 || cfg.length == 0)
        return TransformErrorCode::InvalidParameter;
      return FrontTrimImpl(inputs[0], cfg.length);
    }
    return TransformErrorCode::MissingRequiredParameter;
  }
  case BlockType::BackTrim: {
    if (inputs.size() != 1)
      return TransformErrorCode::TooFewInputs;
    if (std::holds_alternative<PositionLengthConfig>(config)) {
      const auto &cfg = std::get<PositionLengthConfig>(config);
      if (cfg.position != 1 || cfg.length == 0)
        return TransformErrorCode::InvalidParameter;
      return BackTrimImpl(inputs[0], cfg.length);
    }
    return TransformErrorCode::MissingRequiredParameter;
  }
  case BlockType::DeleteAt: {
    if (inputs.size() != 1)
      return TransformErrorCode::TooFewInputs;
    if (std::holds_alternative<PositionLengthConfig>(config)) {
      const auto &cfg = std::get<PositionLengthConfig>(config);
      if (cfg.position == 0 || cfg.length == 0)
        return TransformErrorCode::InvalidParameter;
      return DeleteAtImpl(inputs[0], cfg.position, cfg.length);
    }
    return TransformErrorCode::MissingRequiredParameter;
  }
  case BlockType::Substring: {
    if (inputs.size() != 1)
      return TransformErrorCode::TooFewInputs;
    if (std::holds_alternative<PositionLengthConfig>(config)) {
      const auto &cfg = std::get<PositionLengthConfig>(config);
      if (cfg.position == 0 || cfg.length == 0)
        return TransformErrorCode::InvalidParameter;
      return SubstringImpl(inputs[0], cfg.position, cfg.length);
    }
    return TransformErrorCode::MissingRequiredParameter;
  }
  case BlockType::Replace: {
    if (inputs.size() != 1)
      return TransformErrorCode::TooFewInputs;
    if (std::holds_alternative<StringPairConfig>(config)) {
      const auto &cfg = std::get<StringPairConfig>(config);
      if (cfg.target.empty())
        return TransformErrorCode::MissingRequiredParameter;
      return ReplaceImpl(inputs[0], cfg.target, cfg.replacement);
    }
    return TransformErrorCode::MissingRequiredParameter;
  }
  case BlockType::DeleteAll: {
    if (inputs.size() != 1)
      return TransformErrorCode::TooFewInputs;
    if (std::holds_alternative<StringPairConfig>(config)) {
      const auto &cfg = std::get<StringPairConfig>(config);
      if (cfg.target.empty())
        return TransformErrorCode::MissingRequiredParameter;
      return DeleteAllImpl(inputs[0], cfg.target);
    }
    return TransformErrorCode::MissingRequiredParameter;
  }
  case BlockType::Trim: {
    if (inputs.size() != 1)
      return TransformErrorCode::TooFewInputs;
    return TrimImpl(inputs[0]);
  }
  case BlockType::RemoveWhitespace: {
    if (inputs.size() != 1)
      return TransformErrorCode::TooFewInputs;
    return RemoveWhitespaceImpl(inputs[0]);
  }
  case BlockType::ToUpper: {
    if (inputs.size() != 1)
      return TransformErrorCode::TooFewInputs;
    return ToUpperImpl(inputs[0]);
  }
  case BlockType::ToLower: {
    if (inputs.size() != 1)
      return TransformErrorCode::TooFewInputs;
    return ToLowerImpl(inputs[0]);
  }
  case BlockType::Prefix: {
    if (inputs.size() != 1)
      return TransformErrorCode::TooFewInputs;
    if (std::holds_alternative<ConstantConfig>(config)) {
      const auto &cfg = std::get<ConstantConfig>(config);
      return cfg.value + inputs[0];
    }
    return TransformErrorCode::MissingRequiredParameter;
  }
  case BlockType::Suffix: {
    if (inputs.size() != 1)
      return TransformErrorCode::TooFewInputs;
    if (std::holds_alternative<ConstantConfig>(config)) {
      const auto &cfg = std::get<ConstantConfig>(config);
      return inputs[0] + cfg.value;
    }
    return TransformErrorCode::MissingRequiredParameter;
  }
  case BlockType::ReplaceIfEmpty: {
    if (inputs.size() != 1)
      return TransformErrorCode::TooFewInputs;
    if (std::holds_alternative<ConstantConfig>(config)) {
      const auto &cfg = std::get<ConstantConfig>(config);
      return inputs[0].empty() ? cfg.value : inputs[0];
    }
    return TransformErrorCode::MissingRequiredParameter;
  }
  case BlockType::Join: {
    if (inputs.empty())
      return TransformErrorCode::TooFewInputs;
    if (std::holds_alternative<JoinConfig>(config)) {
      const auto &cfg = std::get<JoinConfig>(config);
      return JoinImpl(inputs, cfg.separator, cfg.ignoreEmpty);
    }
    return TransformErrorCode::MissingRequiredParameter;
  }
  case BlockType::Constant: {
    if (std::holds_alternative<ConstantConfig>(config)) {
      const auto &cfg = std::get<ConstantConfig>(config);
      return cfg.value;
    }
    return {};
  }
  }
  return TransformErrorCode::InvalidParameter;
}

} // namespace csvmapper

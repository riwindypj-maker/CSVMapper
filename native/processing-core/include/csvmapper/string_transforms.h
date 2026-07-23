// 15 種類の文字列編集ブロックのドメイン契約を定義する。
// RELEVANT FILES: src/string_transforms.cpp, tests/string_transforms_tests.cpp

#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <system_error>
#include <variant>
#include <vector>

namespace csvmapper {

// 設定エラーの公開コード。
enum class TransformErrorCode {
  None = 0,
  InvalidParameter,
  MissingRequiredParameter,
  TooFewInputs,
};

std::error_code make_error_code(TransformErrorCode code);

} // namespace csvmapper

namespace std {
template <> struct is_error_code_enum<csvmapper::TransformErrorCode> : true_type {};
} // namespace std

namespace csvmapper {

// 各ブロックを区別する ID。
enum class BlockType {
  FrontTrim,
  BackTrim,
  DeleteAt,
  Substring,
  Replace,
  DeleteAll,
  Trim,
  RemoveWhitespace,
  ToUpper,
  ToLower,
  Prefix,
  Suffix,
  ReplaceIfEmpty,
  Join,
  Constant,
};

// 文字位置と文字数を指定するブロックで使用する設定。
struct PositionLengthConfig {
  std::size_t position = 1; // 1-based, 書記素クラスタ単位
  std::size_t length = 1;   // 書記素クラスタ単位
};

// 置換・削除ブロックで使用する設定。
struct StringPairConfig {
  std::u16string target;
  std::u16string replacement;
};

// 固定文字追加ブロックで使用する設定。
struct ConstantConfig {
  std::u16string value;
};

// 文字列結合ブロックで使用する設定。
struct JoinConfig {
  std::u16string separator;
  bool ignoreEmpty = true;
};

// ブロック設定を何らかの形で保持する。
using BlockConfig = std::variant<std::monostate, PositionLengthConfig, StringPairConfig, ConstantConfig, JoinConfig>;

// 文字列の値を受け取り、変換結果を返す。
// 入力は 0 件から 100 件まで取る。
std::variant<std::u16string, std::error_code> EvaluateBlock(BlockType type, const std::vector<std::u16string> &inputs,
                                                            const BlockConfig &config);

// 書記素クラスタに応じた文字数を取得する。
std::size_t GraphemeClusterCount(const std::u16string &text);

} // namespace csvmapper

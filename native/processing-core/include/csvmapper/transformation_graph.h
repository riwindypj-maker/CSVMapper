// 変換グラフのドメイン契約を定義する。
// 入力・ブロック・出力の接続と結合順をグラフとして扱うために存在する。
// RELEVANT FILES: src/transformation_graph.cpp, tests/transformation_graph_tests.cpp

#pragma once

#include <cstddef>
#include <memory>
#include <optional>
#include <string>
#include <system_error>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include "csvmapper/string_transforms.h"

namespace csvmapper {

// ノードを区別する ID 。
using NodeId = std::string;

// 接続を区別する ID 。
using EdgeId = std::string;

// 端子の方向。
enum class TerminalDirection {
  Input,
  Output,
};

// ノードの種別。
enum class NodeKind {
  Input,
  Block,
  Output,
};

// ブロックの設定と入出力情報。
struct BlockInfo {
  BlockType type;
  BlockConfig config;
  std::size_t inputCount = 1;
};

// グラフ内のノード。
struct Node {
  NodeId id;
  NodeKind kind;
  std::u16string displayName;
  std::optional<BlockInfo> block;
  std::vector<NodeId> outputEdges;
  std::vector<NodeId> inputEdges;
};

// 接続情報。
struct Edge {
  EdgeId id;
  NodeId from;
  NodeId to;
  // Join ブロックの場合のみ使用する結合順序。
  std::size_t joinOrder = 0;
};

// 設定不足または接続不能の理由。
enum class GraphErrorCode {
  None = 0,
  DuplicateInput,
  OutputAsSource,
  InputAsTarget,
  SelfLoop,
  WouldCreateCycle,
  TooManyInputs,
  TerminalMismatch,
  InvalidJoinOrder,
  MissingRequiredConfig,
  MissingInput,
  NoOutputs,
  NoOutputName,
  DuplicateOutputName,
};

std::error_code make_error_code(GraphErrorCode code);

} // namespace csvmapper

namespace std {
template <> struct is_error_code_enum<csvmapper::GraphErrorCode> : true_type {};
} // namespace std

namespace csvmapper {

// グラフの不変条件を保ちつつ編集するコンテナー。
class TransformationGraph {
public:
  TransformationGraph();
  ~TransformationGraph();

  // 入力項目ノードを追加する。
  std::error_code AddInputNode(const NodeId &id, const std::u16string &displayName);

  // 編集ブロックノードを追加する。
  std::error_code AddBlockNode(const NodeId &id, const std::u16string &displayName, const BlockInfo &block);

  // 出力項目ノードを追加する。
  std::error_code AddOutputNode(const NodeId &id, const std::u16string &displayName);

  // 接続を追加する。
  std::error_code AddEdge(const EdgeId &id, const NodeId &from, const NodeId &to);

  // ノードを削除する。関連する接続も削除される。
  std::error_code RemoveNode(const NodeId &id);

  // 接続を削除する。
  std::error_code RemoveEdge(const EdgeId &id);

  // 出力項目一覧を設定する。
  std::error_code SetOutputOrder(const std::vector<NodeId> &outputIds);

  // Join ブロックの結合順をプロパティ順として設定する。
  // orderedEdgeIds は当該 Join への入力辺の順列でなければならない。
  std::error_code SetJoinInputOrder(const NodeId &joinNodeId, const std::vector<EdgeId> &orderedEdgeIds);

  // グラフが有効かどうかを検証し、エラー・警告を返す。
  // エラーがある場合は評価できない。
  std::pair<std::vector<GraphErrorCode>, std::vector<GraphErrorCode>> Validate() const;

  // 入力データを受け取り、出力項目ごとの変換結果を返す。
  std::unordered_map<NodeId, std::variant<std::u16string, std::error_code>>
  Evaluate(const std::unordered_map<NodeId, std::u16string> &inputValues) const;

  const std::unordered_map<NodeId, Node> &Nodes() const;
  const std::unordered_map<EdgeId, Edge> &Edges() const;
  const std::vector<NodeId> &OutputOrder() const;

private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

} // namespace csvmapper

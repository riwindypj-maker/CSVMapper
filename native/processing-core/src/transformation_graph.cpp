// 変換グラフの実装。
// ノード接続の不変条件を保ちつつ、結合順などプロパティ由来の評価順を反映する。
// RELEVANT FILES: ../include/csvmapper/transformation_graph.h, ../tests/transformation_graph_tests.cpp

#include "csvmapper/transformation_graph.h"

#include <algorithm>
#include <cstddef>
#include <functional>
#include <memory>
#include <queue>
#include <string>
#include <system_error>
#include <unordered_map>
#include <unordered_set>
#include <variant>
#include <vector>

namespace csvmapper {

namespace {

class ErrorCategory : public std::error_category {
public:
  const char *name() const noexcept override { return "csvmapper::graph"; }
  std::string message(int ev) const override {
    switch (static_cast<GraphErrorCode>(ev)) {
    case GraphErrorCode::None:
      return "no error";
    case GraphErrorCode::DuplicateInput:
      return "input node already exists";
    case GraphErrorCode::OutputAsSource:
      return "output node cannot be a source";
    case GraphErrorCode::InputAsTarget:
      return "input node cannot be a target";
    case GraphErrorCode::SelfLoop:
      return "self-loop is not allowed";
    case GraphErrorCode::WouldCreateCycle:
      return "connection would create a cycle";
    case GraphErrorCode::TooManyInputs:
      return "too many inputs for this node";
    case GraphErrorCode::TerminalMismatch:
      return "terminal direction mismatch";
    case GraphErrorCode::InvalidJoinOrder:
      return "join order not configured";
    case GraphErrorCode::MissingRequiredConfig:
      return "missing required configuration";
    case GraphErrorCode::MissingInput:
      return "required input missing";
    case GraphErrorCode::NoOutputs:
      return "no output nodes defined";
    case GraphErrorCode::NoOutputName:
      return "output node has no name";
    case GraphErrorCode::DuplicateOutputName:
      return "duplicate output name";
    }
    return "unknown graph error";
  }
};

const ErrorCategory &Category() {
  static ErrorCategory instance;
  return instance;
}

} // namespace

std::error_code make_error_code(GraphErrorCode code) { return {static_cast<int>(code), Category()}; }

class TransformationGraph::Impl {
public:
  std::unordered_map<NodeId, Node> nodes;
  std::unordered_map<EdgeId, Edge> edges;
  std::vector<NodeId> outputOrder;
  std::unordered_set<NodeId> inputIds;

  Node *FindNode(const NodeId &id) {
    auto it = nodes.find(id);
    return it != nodes.end() ? &it->second : nullptr;
  }

  const Node *FindNode(const NodeId &id) const {
    auto it = nodes.find(id);
    return it != nodes.end() ? &it->second : nullptr;
  }

  Edge *FindEdge(const EdgeId &id) {
    auto it = edges.find(id);
    return it != edges.end() ? &it->second : nullptr;
  }

  std::error_code AddEdgeInternal(const EdgeId &id, const NodeId &from, const NodeId &to) {
    if (from == to)
      return GraphErrorCode::SelfLoop;
    Node *fromNode = FindNode(from);
    Node *toNode = FindNode(to);
    if (!fromNode || !toNode)
      return GraphErrorCode::TerminalMismatch;
    if (fromNode->kind == NodeKind::Output)
      return GraphErrorCode::OutputAsSource;
    if (toNode->kind == NodeKind::Input)
      return GraphErrorCode::InputAsTarget;
    // 循環判定（多入力チェックより先に評価する）
    if (WouldCreateCycle(from, to))
      return GraphErrorCode::WouldCreateCycle;

    if (toNode->kind == NodeKind::Block && toNode->block && toNode->block->type != BlockType::Join) {
      if (toNode->inputEdges.size() >= 1)
        return GraphErrorCode::TooManyInputs;
    }
    if (toNode->kind == NodeKind::Block && toNode->block && toNode->block->type == BlockType::Join) {
      if (toNode->inputEdges.size() >= 100)
        return GraphErrorCode::TooManyInputs;
    }
    if (toNode->kind == NodeKind::Output && toNode->inputEdges.size() >= 1)
      return GraphErrorCode::TooManyInputs;

    // Join への新規接続は、並べ替え前の初期プロパティ順として末尾スロットを割り当てる。
    std::size_t joinOrder = 0;
    if (toNode->kind == NodeKind::Block && toNode->block && toNode->block->type == BlockType::Join)
      joinOrder = toNode->inputEdges.size();

    edges[id] = Edge{id, from, to, joinOrder};
    fromNode->outputEdges.push_back(id);
    toNode->inputEdges.push_back(id);
    return {};
  }

  bool WouldCreateCycle(const NodeId &from, const NodeId &to) const {
    std::unordered_set<NodeId> visited;
    std::queue<NodeId> queue;
    queue.push(to);
    while (!queue.empty()) {
      NodeId current = queue.front();
      queue.pop();
      if (current == from)
        return true;
      if (visited.count(current))
        continue;
      visited.insert(current);
      const Node *node = FindNode(current);
      if (!node)
        continue;
      for (const auto &edgeId : node->outputEdges) {
        auto it = edges.find(edgeId);
        if (it != edges.end())
          queue.push(it->second.to);
      }
    }
    return false;
  }

  // トポロジカルソートを 1 回計算して返す。
  std::vector<NodeId> TopologicalSort() const {
    std::unordered_map<NodeId, std::size_t> inDegree;
    for (const auto &[id, node] : nodes) {
      inDegree[id] = node.inputEdges.size();
    }
    std::queue<NodeId> ready;
    for (const auto &[id, node] : nodes) {
      if (node.inputEdges.empty())
        ready.push(id);
    }

    std::vector<NodeId> order;
    while (!ready.empty()) {
      NodeId current = ready.front();
      ready.pop();
      order.push_back(current);
      const Node *node = FindNode(current);
      if (!node)
        continue;
      for (const auto &edgeId : node->outputEdges) {
        auto it = edges.find(edgeId);
        if (it == edges.end())
          continue;
        if (--inDegree[it->second.to] == 0)
          ready.push(it->second.to);
      }
    }
    return order;
  }

  // Join ブロックの入力を joinOrder で並べる。
  std::vector<std::u16string>
  CollectJoinInputs(const Node &node,
                    const std::unordered_map<NodeId, std::variant<std::u16string, std::error_code>> &values) const {
    std::vector<std::pair<std::size_t, std::u16string>> ordered;
    for (const auto &edgeId : node.inputEdges) {
      auto it = edges.find(edgeId);
      if (it == edges.end())
        continue;
      const NodeId &from = it->second.from;
      auto valueIt = values.find(from);
      if (valueIt != values.end()) {
        if (std::holds_alternative<std::u16string>(valueIt->second))
          ordered.push_back(std::make_pair(it->second.joinOrder, std::get<std::u16string>(valueIt->second)));
      }
    }
    std::stable_sort(ordered.begin(), ordered.end(), [](const auto &a, const auto &b) { return a.first < b.first; });
    std::vector<std::u16string> result;
    result.reserve(ordered.size());
    for (const auto &p : ordered)
      result.push_back(p.second);
    return result;
  }
};

TransformationGraph::TransformationGraph() : impl_(std::make_unique<Impl>()) {}
TransformationGraph::~TransformationGraph() = default;

std::error_code TransformationGraph::AddInputNode(const NodeId &id, const std::u16string &displayName) {
  if (impl_->nodes.count(id))
    return GraphErrorCode::DuplicateInput;
  impl_->nodes[id] = Node{id, NodeKind::Input, displayName, std::nullopt, {}, {}};
  impl_->inputIds.insert(id);
  return {};
}

std::error_code TransformationGraph::AddBlockNode(const NodeId &id, const std::u16string &displayName,
                                                  const BlockInfo &block) {
  if (impl_->nodes.count(id))
    return GraphErrorCode::DuplicateInput;
  impl_->nodes[id] = Node{id, NodeKind::Block, displayName, block, {}, {}};
  return {};
}

std::error_code TransformationGraph::AddOutputNode(const NodeId &id, const std::u16string &displayName) {
  if (impl_->nodes.count(id))
    return GraphErrorCode::DuplicateInput;
  impl_->nodes[id] = Node{id, NodeKind::Output, displayName, std::nullopt, {}, {}};
  return {};
}

std::error_code TransformationGraph::AddEdge(const EdgeId &id, const NodeId &from, const NodeId &to) {
  if (impl_->edges.count(id))
    return GraphErrorCode::TerminalMismatch;
  return impl_->AddEdgeInternal(id, from, to);
}

std::error_code TransformationGraph::RemoveNode(const NodeId &id) {
  auto it = impl_->nodes.find(id);
  if (it == impl_->nodes.end())
    return GraphErrorCode::TerminalMismatch;

  std::vector<EdgeId> edgeIds = it->second.outputEdges;
  edgeIds.insert(edgeIds.end(), it->second.inputEdges.begin(), it->second.inputEdges.end());
  for (const auto &edgeId : edgeIds)
    RemoveEdge(edgeId);
  impl_->nodes.erase(it);
  impl_->inputIds.erase(id);
  return {};
}

std::error_code TransformationGraph::RemoveEdge(const EdgeId &id) {
  auto it = impl_->edges.find(id);
  if (it == impl_->edges.end())
    return GraphErrorCode::TerminalMismatch;
  const Edge &edge = it->second;
  Node *from = impl_->FindNode(edge.from);
  Node *to = impl_->FindNode(edge.to);
  if (from) {
    from->outputEdges.erase(std::remove(from->outputEdges.begin(), from->outputEdges.end(), id),
                            from->outputEdges.end());
  }
  if (to) {
    to->inputEdges.erase(std::remove(to->inputEdges.begin(), to->inputEdges.end(), id), to->inputEdges.end());
  }
  impl_->edges.erase(it);
  return {};
}

std::error_code TransformationGraph::SetOutputOrder(const std::vector<NodeId> &outputIds) {
  impl_->outputOrder = outputIds;
  return {};
}

std::error_code TransformationGraph::SetJoinInputOrder(const NodeId &joinNodeId,
                                                       const std::vector<EdgeId> &orderedEdgeIds) {
  Node *node = impl_->FindNode(joinNodeId);
  if (!node || node->kind != NodeKind::Block || !node->block || node->block->type != BlockType::Join)
    return GraphErrorCode::TerminalMismatch;
  if (orderedEdgeIds.size() != node->inputEdges.size())
    return GraphErrorCode::InvalidJoinOrder;

  // 入力辺の順列であることを確認し、プロパティ順として joinOrder を書き込む。
  std::unordered_set<EdgeId> expected(node->inputEdges.begin(), node->inputEdges.end());
  std::unordered_set<EdgeId> seen;
  for (std::size_t i = 0; i < orderedEdgeIds.size(); ++i) {
    const EdgeId &edgeId = orderedEdgeIds[i];
    if (!expected.count(edgeId) || !seen.insert(edgeId).second)
      return GraphErrorCode::InvalidJoinOrder;
    Edge *edge = impl_->FindEdge(edgeId);
    if (!edge)
      return GraphErrorCode::InvalidJoinOrder;
    edge->joinOrder = i;
  }
  return {};
}

std::pair<std::vector<GraphErrorCode>, std::vector<GraphErrorCode>> TransformationGraph::Validate() const {
  std::vector<GraphErrorCode> errors;
  std::vector<GraphErrorCode> warnings;

  if (impl_->nodes.empty()) {
    errors.push_back(GraphErrorCode::NoOutputs);
    return {errors, warnings};
  }

  bool hasOutput = false;
  std::unordered_set<std::u16string> outputNames;
  for (const auto &[id, node] : impl_->nodes) {
    if (node.kind == NodeKind::Output) {
      hasOutput = true;
      if (node.displayName.empty())
        errors.push_back(GraphErrorCode::NoOutputName);
      if (outputNames.count(node.displayName))
        errors.push_back(GraphErrorCode::DuplicateOutputName);
      outputNames.insert(node.displayName);
      if (node.inputEdges.empty())
        warnings.push_back(GraphErrorCode::MissingInput);
    }
    if (node.kind == NodeKind::Block) {
      if (node.block && node.block->type != BlockType::Constant && node.block->type != BlockType::Join) {
        if (node.inputEdges.empty())
          errors.push_back(GraphErrorCode::MissingInput);
      }
      if (node.block && node.block->type == BlockType::Join) {
        if (node.inputEdges.empty())
          errors.push_back(GraphErrorCode::MissingInput);
        if (node.inputEdges.size() == 1)
          warnings.push_back(GraphErrorCode::MissingInput);
        // 結合順は 0..n-1 の一意な値でなければならない。
        std::vector<bool> used(node.inputEdges.size(), false);
        bool orderOk = !node.inputEdges.empty();
        for (const auto &edgeId : node.inputEdges) {
          auto it = impl_->edges.find(edgeId);
          if (it == impl_->edges.end() || it->second.joinOrder >= node.inputEdges.size() ||
              used[it->second.joinOrder]) {
            orderOk = false;
            break;
          }
          used[it->second.joinOrder] = true;
        }
        if (!node.inputEdges.empty() && !orderOk)
          errors.push_back(GraphErrorCode::InvalidJoinOrder);
      }
      if (node.block && node.block->type == BlockType::Constant && node.inputEdges.empty()) {
        // 固定値は入力不要
      } else if (node.block && node.outputEdges.empty()) {
        warnings.push_back(GraphErrorCode::MissingInput);
      }
    }
  }
  if (!hasOutput)
    errors.push_back(GraphErrorCode::NoOutputs);

  return {errors, warnings};
}

std::unordered_map<NodeId, std::variant<std::u16string, std::error_code>>
TransformationGraph::Evaluate(const std::unordered_map<NodeId, std::u16string> &inputValues) const {
  std::unordered_map<NodeId, std::variant<std::u16string, std::error_code>> values;
  for (const auto &[id, v] : inputValues)
    values[id] = v;

  const auto order = impl_->TopologicalSort();
  for (const auto &id : order) {
    const Node *node = impl_->FindNode(id);
    if (!node)
      continue;
    if (node->kind == NodeKind::Input || node->kind == NodeKind::Output)
      continue;
    if (!node->block)
      continue;

    std::vector<std::u16string> inputs;
    if (node->block->type == BlockType::Join) {
      inputs = impl_->CollectJoinInputs(*node, values);
    } else {
      for (const auto &edgeId : node->inputEdges) {
        auto edgeIt = impl_->edges.find(edgeId);
        if (edgeIt == impl_->edges.end())
          continue;
        auto valueIt = values.find(edgeIt->second.from);
        if (valueIt != values.end()) {
          if (std::holds_alternative<std::u16string>(valueIt->second))
            inputs.push_back(std::get<std::u16string>(valueIt->second));
        }
      }
    }

    auto result = EvaluateBlock(node->block->type, inputs, node->block->config);
    if (std::holds_alternative<std::error_code>(result))
      values[id] = std::get<std::error_code>(result);
    else
      values[id] = std::get<std::u16string>(result);
  }

  // 出力項目の評価 — outputOrder が未設定なら全 Output ノードを走査する。
  auto outputIds = impl_->outputOrder;
  if (outputIds.empty()) {
    for (const auto &[id, node] : impl_->nodes)
      if (node.kind == NodeKind::Output)
        outputIds.push_back(id);
  }
  for (const auto &id : outputIds) {
    const Node *node = impl_->FindNode(id);
    if (!node || node->kind != NodeKind::Output)
      continue;
    if (node->inputEdges.empty()) {
      values[id] = std::u16string{};
      continue;
    }
    const EdgeId &edgeId = node->inputEdges.front();
    auto edgeIt = impl_->edges.find(edgeId);
    if (edgeIt != impl_->edges.end()) {
      auto valueIt = values.find(edgeIt->second.from);
      if (valueIt != values.end()) {
        values[id] = valueIt->second;
      } else {
        values[id] = std::u16string{};
      }
    }
  }

  return values;
}

const std::unordered_map<NodeId, Node> &TransformationGraph::Nodes() const { return impl_->nodes; }

const std::unordered_map<EdgeId, Edge> &TransformationGraph::Edges() const { return impl_->edges; }

const std::vector<NodeId> &TransformationGraph::OutputOrder() const { return impl_->outputOrder; }

} // namespace csvmapper

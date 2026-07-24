// プレビューとセル経路の実装。
// ストリーム CSV 走査と TransformationGraph 評価を組み合わせ、ページ分割結果を返す。
// RELEVANT FILES: ../include/csvmapper/preview.h, csv_inspect.cpp, transformation_graph.cpp

#include "csvmapper/preview.h"

#include <algorithm>
#include <array>
#include <chrono>
#include <cstring>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <queue>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <variant>
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
    std::string rebound;

    if (!bomHandled_ && encoding_ == TextEncoding::Utf8WithBom) {
      while (remaining > 0 && bomSeen_ < kUtf8Bom.size()) {
        if (static_cast<std::uint8_t>(*source) != kUtf8Bom[bomSeen_]) {
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
      if (!bomHandled_ && flush)
        return false;
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

std::string MessageForCsv(CsvErrorCode code) {
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
    return "csv preview failed";
  }
}

std::string MessageForGraph(GraphErrorCode code) {
  switch (code) {
  case GraphErrorCode::WouldCreateCycle:
    return "graph contains a cycle";
  case GraphErrorCode::MissingRequiredConfig:
    return "missing required configuration";
  case GraphErrorCode::MissingInput:
    return "required input missing";
  case GraphErrorCode::NoOutputs:
    return "no output nodes defined";
  case GraphErrorCode::NoOutputName:
    return "output node has no name";
  case GraphErrorCode::InvalidJoinOrder:
    return "join order not configured";
  default:
    return "graph invalid";
  }
}

std::string_view StripIncompleteUtf8Suffix(std::string_view view) {
  if (view.empty())
    return view;
  const auto byteAt = [&](std::size_t index) { return static_cast<unsigned char>(view[index]); };
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
    if (utf8ContinuationCount(last) < 0)
      return view;
    view.remove_suffix(1);
    return view;
  }
  if (i == 0)
    return view;
  const unsigned char lead = byteAt(i - 1);
  const int needed = utf8ContinuationCount(lead);
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
  if (source.Size() <= bufferSize) {
    const TextEncoding detected = DetectEncoding(sample);
    if (detected == TextEncoding::AutoDetect)
      ec = CsvErrorCode::InvalidEncoding;
    return detected;
  }
  auto tryDetect = [&](const std::string &bytes) -> TextEncoding {
    if (bytes.size() >= kUtf8Bom.size() && std::memcmp(bytes.data(), kUtf8Bom.data(), kUtf8Bom.size()) == 0)
      return TextEncoding::Utf8WithBom;
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

struct BuiltGraph {
  TransformationGraph graph;
  // inputColumnId -> input node id
  std::unordered_map<std::string, NodeId> columnToInputNode;
  // CSV 列 index -> input node id（スナップショット inputColumns 順）
  std::vector<NodeId> inputNodesByColumnIndex;
  bool hasCycle = false;
  bool hasFatalGraphError = false;
  PreviewIssue fatalIssue;
  // 出力ごとの列エラー（評価前に判明する設定不足など）
  std::unordered_map<NodeId, PreviewIssue> columnIssues;

  BuiltGraph() = default;
  BuiltGraph(BuiltGraph &&) noexcept = default;
  BuiltGraph &operator=(BuiltGraph &&) noexcept = default;
  BuiltGraph(const BuiltGraph &) = delete;
  BuiltGraph &operator=(const BuiltGraph &) = delete;
};

bool IsConfigMissing(const BlockInfo &block) {
  switch (block.type) {
  case BlockType::FrontTrim:
  case BlockType::BackTrim:
  case BlockType::DeleteAt:
  case BlockType::Substring:
    return !std::holds_alternative<PositionLengthConfig>(block.config) ||
           std::get<PositionLengthConfig>(block.config).position < 1 ||
           std::get<PositionLengthConfig>(block.config).length < 1;
  case BlockType::Replace:
  case BlockType::DeleteAll:
    return !std::holds_alternative<StringPairConfig>(block.config) ||
           std::get<StringPairConfig>(block.config).target.empty();
  case BlockType::Prefix:
  case BlockType::Suffix:
  case BlockType::ReplaceIfEmpty:
  case BlockType::Constant:
    return !std::holds_alternative<ConstantConfig>(block.config);
  case BlockType::Join:
    return !std::holds_alternative<JoinConfig>(block.config);
  default:
    return false;
  }
}

BuiltGraph BuildGraph(const ProcessingSnapshot &snapshot) {
  BuiltGraph built;
  for (const auto &node : snapshot.nodes) {
    std::error_code ec;
    if (node.kind == NodeKind::Input) {
      ec = built.graph.AddInputNode(node.id, node.displayName);
      if (!ec && !node.inputColumnId.empty())
        built.columnToInputNode[node.inputColumnId] = node.id;
    } else if (node.kind == NodeKind::Block) {
      BlockInfo info = node.hasBlock ? node.block : BlockInfo{BlockType::Trim, {}};
      ec = built.graph.AddBlockNode(node.id, node.displayName, info);
    } else {
      ec = built.graph.AddOutputNode(node.id, node.displayName);
    }
    if (ec) {
      built.hasFatalGraphError = true;
      built.fatalIssue.severity = PreviewIssueSeverity::Error;
      built.fatalIssue.graphCode = static_cast<GraphErrorCode>(ec.value());
      built.fatalIssue.message = MessageForGraph(built.fatalIssue.graphCode);
      built.fatalIssue.nodeId = node.id;
      return std::move(built);
    }
  }

  // 入力列順とノード対応を確定する。
  built.inputNodesByColumnIndex.reserve(snapshot.inputColumns.size());
  for (const auto &col : snapshot.inputColumns) {
    auto it = built.columnToInputNode.find(col.id);
    if (it != built.columnToInputNode.end())
      built.inputNodesByColumnIndex.push_back(it->second);
    else
      built.inputNodesByColumnIndex.push_back({});
  }

  std::unordered_map<NodeId, std::vector<EdgeId>> joinEdges;
  for (const auto &edge : snapshot.edges) {
    auto ec = built.graph.AddEdge(edge.id, edge.from, edge.to);
    if (ec == GraphErrorCode::WouldCreateCycle) {
      built.hasCycle = true;
      built.hasFatalGraphError = true;
      built.fatalIssue.severity = PreviewIssueSeverity::Error;
      built.fatalIssue.graphCode = GraphErrorCode::WouldCreateCycle;
      built.fatalIssue.message = MessageForGraph(GraphErrorCode::WouldCreateCycle);
      built.fatalIssue.edgeId = edge.id;
      return std::move(built);
    }
    if (ec) {
      built.hasFatalGraphError = true;
      built.fatalIssue.severity = PreviewIssueSeverity::Error;
      built.fatalIssue.graphCode = static_cast<GraphErrorCode>(ec.value());
      built.fatalIssue.message = MessageForGraph(built.fatalIssue.graphCode);
      built.fatalIssue.edgeId = edge.id;
      return std::move(built);
    }
    const auto &nodes = built.graph.Nodes();
    auto toIt = nodes.find(edge.to);
    if (toIt != nodes.end() && toIt->second.kind == NodeKind::Block && toIt->second.block &&
        toIt->second.block->type == BlockType::Join) {
      joinEdges[edge.to].push_back(edge.id);
    }
  }

  for (auto &[joinId, edgeIds] : joinEdges) {
    std::vector<std::pair<std::size_t, EdgeId>> ordered;
    for (const auto &edgeId : edgeIds) {
      auto eIt = built.graph.Edges().find(edgeId);
      std::size_t order = 0;
      for (const auto &se : snapshot.edges) {
        if (se.id == edgeId) {
          order = se.joinOrder;
          break;
        }
      }
      ordered.push_back({order, edgeId});
    }
    std::stable_sort(ordered.begin(), ordered.end(), [](const auto &a, const auto &b) { return a.first < b.first; });
    std::vector<EdgeId> orderedIds;
    for (const auto &p : ordered)
      orderedIds.push_back(p.second);
    built.graph.SetJoinInputOrder(joinId, orderedIds);
  }

  if (!snapshot.outputOrder.empty())
    built.graph.SetOutputOrder(snapshot.outputOrder);

  // トポロジカルソート件数不足は循環の別経路検出。
  {
    std::size_t reachable = 0;
    std::unordered_map<NodeId, std::size_t> inDegree;
    for (const auto &[id, node] : built.graph.Nodes())
      inDegree[id] = node.inputEdges.size();
    std::queue<NodeId> ready;
    for (const auto &[id, deg] : inDegree) {
      if (deg == 0)
        ready.push(id);
    }
    while (!ready.empty()) {
      NodeId cur = ready.front();
      ready.pop();
      ++reachable;
      auto nIt = built.graph.Nodes().find(cur);
      if (nIt == built.graph.Nodes().end())
        continue;
      for (const auto &edgeId : nIt->second.outputEdges) {
        auto eIt = built.graph.Edges().find(edgeId);
        if (eIt == built.graph.Edges().end())
          continue;
        if (--inDegree[eIt->second.to] == 0)
          ready.push(eIt->second.to);
      }
    }
    if (reachable != built.graph.Nodes().size()) {
      built.hasCycle = true;
      built.hasFatalGraphError = true;
      built.fatalIssue.severity = PreviewIssueSeverity::Error;
      built.fatalIssue.graphCode = GraphErrorCode::WouldCreateCycle;
      built.fatalIssue.message = MessageForGraph(GraphErrorCode::WouldCreateCycle);
      return std::move(built);
    }
  }

  // 出力へ到達する経路上の設定不足を列単位問題にする。
  auto reaches = [&](const NodeId &from, const NodeId &to) {
    std::unordered_set<NodeId> visited;
    std::queue<NodeId> q;
    q.push(from);
    visited.insert(from);
    while (!q.empty()) {
      NodeId cur = q.front();
      q.pop();
      if (cur == to)
        return true;
      auto nIt = built.graph.Nodes().find(cur);
      if (nIt == built.graph.Nodes().end())
        continue;
      for (const auto &edgeId : nIt->second.outputEdges) {
        auto eIt = built.graph.Edges().find(edgeId);
        if (eIt == built.graph.Edges().end())
          continue;
        if (visited.insert(eIt->second.to).second)
          q.push(eIt->second.to);
      }
    }
    return false;
  };

  for (const auto &node : snapshot.nodes) {
    if (node.kind != NodeKind::Block || !node.hasBlock)
      continue;
    if (!IsConfigMissing(node.block))
      continue;
    PreviewIssue issue;
    issue.severity = PreviewIssueSeverity::Error;
    issue.graphCode = GraphErrorCode::MissingRequiredConfig;
    issue.message = MessageForGraph(GraphErrorCode::MissingRequiredConfig);
    issue.nodeId = node.id;
    for (const auto &outId : snapshot.outputOrder) {
      if (reaches(node.id, outId)) {
        built.columnIssues[outId] = issue;
      }
    }
    // outputOrder が空なら全 Output を対象にする。
    if (snapshot.outputOrder.empty()) {
      for (const auto &[id, n] : built.graph.Nodes()) {
        if (n.kind == NodeKind::Output && reaches(node.id, id))
          built.columnIssues[id] = issue;
      }
    }
  }

  return std::move(built);
}

struct StoredSnapshot {
  ProcessingSnapshot snapshot;
  BuiltGraph built;
  // 評価済み行の入力値（rowNumber 1-based に対応する index = rowNumber-1）
  std::vector<std::unordered_map<NodeId, std::u16string>> rowInputs;
};

std::mutex g_storeMutex;
std::unordered_map<std::string, StoredSnapshot> g_snapshots;

std::vector<PreviewPage> Paginate(const std::vector<PreviewRow> &rows) {
  std::vector<PreviewPage> pages;
  if (rows.empty()) {
    PreviewPage empty;
    empty.pageIndex = 0;
    pages.push_back(std::move(empty));
    return pages;
  }
  for (std::size_t i = 0; i < rows.size(); i += kPreviewPageRowCount) {
    PreviewPage page;
    page.pageIndex = pages.size();
    const std::size_t end = std::min(rows.size(), i + kPreviewPageRowCount);
    page.rows.insert(page.rows.end(), rows.begin() + static_cast<std::ptrdiff_t>(i),
                     rows.begin() + static_cast<std::ptrdiff_t>(end));
    pages.push_back(std::move(page));
  }
  return pages;
}

std::vector<NodeId> CollectPathToOutput(const TransformationGraph &graph, const NodeId &outputId) {
  std::unordered_set<NodeId> visiting;
  std::vector<NodeId> path;
  std::function<void(const NodeId &)> dfs = [&](const NodeId &id) {
    if (!visiting.insert(id).second)
      return;
    auto nIt = graph.Nodes().find(id);
    if (nIt == graph.Nodes().end())
      return;
    for (const auto &edgeId : nIt->second.inputEdges) {
      auto eIt = graph.Edges().find(edgeId);
      if (eIt != graph.Edges().end())
        dfs(eIt->second.from);
    }
    path.push_back(id);
  };
  dfs(outputId);
  return path;
}

} // namespace

PreviewResult Preview(std::string_view operationId, ByteSource &source, const ProcessingSnapshot &snapshot,
                      std::size_t rowCount, const PreviewOptions &options) {
  PreviewResult result;
  result.operationId = std::string(operationId);
  result.snapshotId = snapshot.snapshotId;

  auto failGlobal = [&](CsvErrorCode csv, GraphErrorCode graph, std::string message) {
    result.success = false;
    result.cancelled = false;
    result.globalError = true;
    result.columns.clear();
    result.pages.clear();
    result.evaluatedRowCount = 0;
    result.issues.clear();
    PreviewIssue issue;
    issue.severity = PreviewIssueSeverity::Error;
    issue.csvCode = csv;
    issue.graphCode = graph;
    issue.message = std::move(message);
    result.issues.push_back(std::move(issue));
    return result;
  };

  auto cancelResult = [&]() {
    result.success = false;
    result.cancelled = true;
    result.globalError = false;
    result.columns.clear();
    result.pages.clear();
    result.evaluatedRowCount = 0;
    result.issues.clear();
    return result;
  };

  if (IsCancelled(options.cancelFlag))
    return cancelResult();

  const std::size_t limit = std::min(std::max<std::size_t>(1, rowCount), kPreviewMaxRows);
  BuiltGraph built = BuildGraph(snapshot);
  if (built.hasFatalGraphError) {
    return failGlobal(CsvErrorCode::None, built.fatalIssue.graphCode, built.fatalIssue.message);
  }

  if (source.Size() == 0)
    return failGlobal(CsvErrorCode::EmptyFile, GraphErrorCode::None, MessageForCsv(CsvErrorCode::EmptyFile));

  TextEncoding encoding = options.encoding;
  if (encoding == TextEncoding::AutoDetect) {
    std::error_code detectEc;
    encoding = DetectEncodingFromSource(source, options.readBufferBytes, detectEc);
    if (detectEc || encoding == TextEncoding::AutoDetect)
      return failGlobal(CsvErrorCode::InvalidEncoding, GraphErrorCode::None,
                        MessageForCsv(CsvErrorCode::InvalidEncoding));
  }
  if (!source.Rewind())
    return failGlobal(CsvErrorCode::InvalidEncoding, GraphErrorCode::None,
                      MessageForCsv(CsvErrorCode::InvalidEncoding));

  StreamingTextDecoder decoder;
  if (!decoder.Open(encoding))
    return failGlobal(CsvErrorCode::InvalidEncoding, GraphErrorCode::None,
                      MessageForCsv(CsvErrorCode::InvalidEncoding));

  // 出力列メタデータを先に用意する。
  std::vector<NodeId> outputIds = snapshot.outputOrder;
  if (outputIds.empty()) {
    for (const auto &[id, node] : built.graph.Nodes()) {
      if (node.kind == NodeKind::Output)
        outputIds.push_back(id);
    }
  }
  result.columns.reserve(outputIds.size());
  for (const auto &outId : outputIds) {
    PreviewColumn col;
    col.outputItemId = outId;
    auto nIt = built.graph.Nodes().find(outId);
    if (nIt != built.graph.Nodes().end())
      col.displayName = nIt->second.displayName;
    auto issueIt = built.columnIssues.find(outId);
    if (issueIt != built.columnIssues.end()) {
      col.hasError = true;
      col.issueCode = issueIt->second.graphCode;
      col.issueMessage = issueIt->second.message;
      result.issues.push_back(issueIt->second);
    }
    result.columns.push_back(std::move(col));
  }

  const std::size_t bufferSize = options.readBufferBytes == 0 ? kInspectReadBufferBytes : options.readBufferBytes;
  std::vector<char> readBuffer(bufferSize);
  bool headerAccepted = false;
  std::size_t headerFieldCount = 0;
  std::size_t dataRowCount = 0;
  std::size_t recordsSinceCancelCheck = 0;
  auto lastCancelCheck = std::chrono::steady_clock::now();
  auto lastProgressAt = std::chrono::steady_clock::time_point{};
  std::uint64_t bytesRead = 0;
  std::size_t recordsProcessed = 0;
  std::vector<PreviewRow> rows;
  std::vector<std::unordered_map<NodeId, std::u16string>> storedInputs;
  bool parseFailed = false;
  CsvErrorCode parseCode = CsvErrorCode::None;
  CsvRecordLocation parseLocation{};

  auto emitProgress = [&](bool force) {
    if (!options.onProgress)
      return;
    const auto now = std::chrono::steady_clock::now();
    if (!force && lastProgressAt.time_since_epoch().count() != 0 && options.minProgressInterval.count() > 0 &&
        now - lastProgressAt < options.minProgressInterval) {
      return;
    }
    lastProgressAt = now;
    PreviewProgress progress;
    progress.operationId = result.operationId;
    progress.bytesRead = bytesRead;
    progress.byteSize = source.Size();
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
    ++recordsProcessed;
    if (shouldCancel())
      return false;

    if (!headerAccepted) {
      for (const auto &field : record.fields) {
        if (field.empty() || std::all_of(field.begin(), field.end(), [](char16_t c) { return c == u' '; })) {
          parseFailed = true;
          parseCode = CsvErrorCode::EmptyHeader;
          parseLocation = location;
          return false;
        }
      }
      headerFieldCount = record.fields.size();
      headerAccepted = true;
      emitProgress(false);
      return true;
    }

    if (record.fields.size() != headerFieldCount) {
      parseFailed = true;
      parseCode = CsvErrorCode::InconsistentFieldCount;
      parseLocation = location;
      return false;
    }

    ++dataRowCount;
    if (dataRowCount > limit) {
      // 必要行数を超えたら以降は読まず終了する。
      return false;
    }

    std::unordered_map<NodeId, std::u16string> inputValues;
    for (std::size_t i = 0; i < built.inputNodesByColumnIndex.size() && i < record.fields.size(); ++i) {
      const NodeId &nodeId = built.inputNodesByColumnIndex[i];
      if (!nodeId.empty())
        inputValues[nodeId] = record.fields[i];
    }

    // キャンバスに置いていない入力列は評価に不要。
    for (const auto &[id, node] : built.graph.Nodes()) {
      if (node.kind == NodeKind::Input && inputValues.find(id) == inputValues.end())
        inputValues[id] = u"";
    }

    auto values = built.graph.Evaluate(inputValues);
    PreviewRow row;
    row.rowNumber = dataRowCount;
    row.cells.reserve(result.columns.size());
    for (std::size_t ci = 0; ci < result.columns.size(); ++ci) {
      auto &col = result.columns[ci];
      if (col.hasError) {
        row.cells.emplace_back();
        continue;
      }
      auto vIt = values.find(col.outputItemId);
      if (vIt == values.end()) {
        row.cells.emplace_back();
        continue;
      }
      if (std::holds_alternative<std::error_code>(vIt->second)) {
        col.hasError = true;
        col.issueCode = GraphErrorCode::MissingRequiredConfig;
        col.issueMessage = MessageForGraph(GraphErrorCode::MissingRequiredConfig);
        PreviewIssue issue;
        issue.severity = PreviewIssueSeverity::Error;
        issue.graphCode = col.issueCode;
        issue.message = col.issueMessage;
        issue.nodeId = col.outputItemId;
        result.issues.push_back(issue);
        row.cells.emplace_back();
        continue;
      }
      row.cells.push_back(std::get<std::u16string>(vIt->second));
    }
    rows.push_back(std::move(row));
    storedInputs.push_back(std::move(inputValues));
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
        return failGlobal(CsvErrorCode::InvalidEncoding, GraphErrorCode::None,
                          MessageForCsv(CsvErrorCode::InvalidEncoding));
    }
    if (atEnd) {
      if (!decoder.Feed("", 0, decoded, true))
        return failGlobal(CsvErrorCode::InvalidEncoding, GraphErrorCode::None,
                          MessageForCsv(CsvErrorCode::InvalidEncoding));
    }
    if (!decoded.empty()) {
      if (!parser.Feed(decoded)) {
        if (IsCancelled(options.cancelFlag))
          return cancelResult();
        if (parseFailed)
          return failGlobal(parseCode, GraphErrorCode::None, MessageForCsv(parseCode));
        const auto &issue = parser.GetIssue();
        if (issue.code != CsvErrorCode::None)
          return failGlobal(issue.code, GraphErrorCode::None, MessageForCsv(issue.code));
        // 行数上限でハンドラが false を返した場合は成功継続。
        if (dataRowCount >= limit)
          break;
        return failGlobal(CsvErrorCode::MalformedCsv, GraphErrorCode::None, MessageForCsv(CsvErrorCode::MalformedCsv));
      }
    }
    if (IsCancelled(options.cancelFlag))
      return cancelResult();
    emitProgress(false);
    if (atEnd || dataRowCount >= limit)
      break;
  }

  if (dataRowCount < limit) {
    if (!parser.Finish()) {
      if (IsCancelled(options.cancelFlag))
        return cancelResult();
      if (parseFailed)
        return failGlobal(parseCode, GraphErrorCode::None, MessageForCsv(parseCode));
      const auto &issue = parser.GetIssue();
      if (issue.code != CsvErrorCode::None)
        return failGlobal(issue.code, GraphErrorCode::None, MessageForCsv(issue.code));
      // 行数上限到達後の Finish 失敗は無視してよい場合がある。
      if (dataRowCount == 0 && !headerAccepted)
        return failGlobal(CsvErrorCode::MalformedCsv, GraphErrorCode::None, MessageForCsv(CsvErrorCode::MalformedCsv));
    }
  }

  if (IsCancelled(options.cancelFlag))
    return cancelResult();
  if (!headerAccepted)
    return failGlobal(CsvErrorCode::EmptyFile, GraphErrorCode::None, MessageForCsv(CsvErrorCode::EmptyFile));
  if (parseFailed)
    return failGlobal(parseCode, GraphErrorCode::None, MessageForCsv(parseCode));

  result.pages = Paginate(rows);
  result.evaluatedRowCount = rows.size();
  result.success = true;
  result.cancelled = false;
  result.globalError = false;

  {
    std::lock_guard<std::mutex> lock(g_storeMutex);
    StoredSnapshot stored;
    stored.snapshot = snapshot;
    stored.built = std::move(built);
    stored.rowInputs = std::move(storedInputs);
    // 成功確定分だけ残し、前回までのセル経路用メモリを解放する。
    g_snapshots.clear();
    g_snapshots.emplace(snapshot.snapshotId, std::move(stored));
  }

  emitProgress(true);
  return result;
}

CellPathResult InspectCellPath(std::string_view snapshotId, std::size_t rowNumber, const NodeId &outputItemId) {
  CellPathResult result;
  result.snapshotId = std::string(snapshotId);
  result.rowNumber = rowNumber;
  result.outputItemId = outputItemId;

  std::lock_guard<std::mutex> lock(g_storeMutex);
  auto it = g_snapshots.find(result.snapshotId);
  if (it == g_snapshots.end()) {
    result.success = false;
    result.errorMessage = "unknown snapshot";
    return result;
  }
  if (rowNumber == 0 || rowNumber > it->second.rowInputs.size()) {
    result.success = false;
    result.errorMessage = "row out of range";
    return result;
  }

  const auto &inputs = it->second.rowInputs[rowNumber - 1];
  auto values = it->second.built.graph.Evaluate(inputs);
  const auto path = CollectPathToOutput(it->second.built.graph, outputItemId);
  result.steps.reserve(path.size());
  for (const auto &nodeId : path) {
    auto nIt = it->second.built.graph.Nodes().find(nodeId);
    if (nIt == it->second.built.graph.Nodes().end())
      continue;
    // 出力ノード自体は最終値として含める（経路の末端）。
    CellPathStep step;
    step.nodeId = nodeId;
    step.kind = nIt->second.kind;
    step.displayName = nIt->second.displayName;
    auto vIt = values.find(nodeId);
    if (vIt != values.end()) {
      if (std::holds_alternative<std::u16string>(vIt->second)) {
        step.hasValue = true;
        step.value = std::get<std::u16string>(vIt->second);
      } else {
        step.hasError = true;
        step.errorCode = GraphErrorCode::MissingRequiredConfig;
        step.errorMessage = MessageForGraph(GraphErrorCode::MissingRequiredConfig);
      }
    } else if (nIt->second.kind == NodeKind::Input) {
      step.hasValue = true;
      step.value = u"";
    }
    result.steps.push_back(std::move(step));
  }
  result.success = true;
  return result;
}

void ClearPreviewSnapshots() {
  std::lock_guard<std::mutex> lock(g_storeMutex);
  g_snapshots.clear();
}

} // namespace csvmapper

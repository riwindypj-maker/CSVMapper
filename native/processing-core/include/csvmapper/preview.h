// プレビューとセル経路の Core 契約を定義する。
// 先頭 N 行の評価結果と選択セルの再評価を Application へ返すために存在する。
// RELEVANT FILES: src/preview.cpp, csv_inspect.h, transformation_graph.h, filesystem_port.h

#pragma once

#include <atomic>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>
#include <string_view>
#include <vector>

#include "csvmapper/csv_inspect.h"
#include "csvmapper/string_transforms.h"
#include "csvmapper/transformation_graph.h"

namespace csvmapper {

// JS 側 PREVIEW_PAGE_ROW_COUNT と揃える固定ページ行数。
inline constexpr std::size_t kPreviewPageRowCount = 100;
inline constexpr std::size_t kPreviewMaxRows = 1000;

// 処理スナップショットの入力列。
struct SnapshotInputColumn {
  std::string id;
  std::string displayName;
};

// 処理スナップショットのノード。
struct SnapshotNode {
  NodeId id;
  NodeKind kind = NodeKind::Input;
  std::u16string displayName;
  std::string inputColumnId;
  BlockInfo block{};
  bool hasBlock = false;
};

// 処理スナップショットの辺。
struct SnapshotEdge {
  EdgeId id;
  NodeId from;
  NodeId to;
  std::size_t joinOrder = 0;
};

// 変更不能な処理スナップショット（C++ 表現）。
struct ProcessingSnapshot {
  std::string schemaVersion;
  std::string snapshotId;
  std::vector<SnapshotInputColumn> inputColumns;
  std::vector<SnapshotNode> nodes;
  std::vector<SnapshotEdge> edges;
  std::vector<NodeId> outputOrder;
  std::size_t previewRowCount = 100;
};

enum class PreviewIssueSeverity {
  Warning,
  Error,
};

// 列単位または全体の問題。CSV 値は載せない。
struct PreviewIssue {
  PreviewIssueSeverity severity = PreviewIssueSeverity::Error;
  GraphErrorCode graphCode = GraphErrorCode::None;
  CsvErrorCode csvCode = CsvErrorCode::None;
  std::string message;
  NodeId nodeId;
  EdgeId edgeId;
};

struct PreviewColumn {
  NodeId outputItemId;
  std::u16string displayName;
  bool hasError = false;
  GraphErrorCode issueCode = GraphErrorCode::None;
  std::string issueMessage;
};

struct PreviewRow {
  std::size_t rowNumber = 0; // 1-based data row
  std::vector<std::u16string> cells;
};

struct PreviewPage {
  std::size_t pageIndex = 0;
  std::vector<PreviewRow> rows;
};

struct PreviewResult {
  bool success = false;
  bool cancelled = false;
  bool globalError = false;
  std::string operationId;
  std::string snapshotId;
  std::vector<PreviewColumn> columns;
  std::vector<PreviewPage> pages;
  std::size_t evaluatedRowCount = 0;
  std::vector<PreviewIssue> issues;
};

struct CellPathStep {
  NodeId nodeId;
  NodeKind kind = NodeKind::Input;
  std::u16string displayName;
  bool hasValue = false;
  std::u16string value;
  bool hasError = false;
  GraphErrorCode errorCode = GraphErrorCode::None;
  std::string errorMessage;
};

struct CellPathResult {
  bool success = false;
  std::string snapshotId;
  std::size_t rowNumber = 0;
  NodeId outputItemId;
  std::vector<CellPathStep> steps;
  std::string errorMessage;
};

struct PreviewProgress {
  std::string operationId;
  std::uint64_t bytesRead = 0;
  std::uint64_t byteSize = 0;
  std::size_t recordsProcessed = 0;
};

using PreviewProgressCallback = std::function<void(const PreviewProgress &)>;

struct PreviewOptions {
  TextEncoding encoding = TextEncoding::AutoDetect;
  const std::atomic<bool> *cancelFlag = nullptr;
  PreviewProgressCallback onProgress;
  std::chrono::milliseconds minProgressInterval{100};
  std::size_t readBufferBytes = kInspectReadBufferBytes;
};

// 先頭 rowCount 行（最大 1000）を評価し、100 行ページで返す。
// 循環 / CSV 解析エラーは評価開始せず globalError=true。
// 成功時は snapshotId を保持し InspectCellPath で再評価できる（最新 1 件のみ）。
PreviewResult Preview(std::string_view operationId, ByteSource &source, const ProcessingSnapshot &snapshot,
                      std::size_t rowCount, const PreviewOptions &options = {});

// 直近成功プレビューの保持スナップショットから選択セル経路を再評価する。
// Preview 成功時は最新 1 件だけ保持する（旧 ID は破棄）。
CellPathResult InspectCellPath(std::string_view snapshotId, std::size_t rowNumber, const NodeId &outputItemId);

// テスト用: 保持スナップショットを破棄する。
void ClearPreviewSnapshots();

} // namespace csvmapper

// プレビューとセル経路の C++ テスト（PREVIEW-001〜004 / E001 / E003 相当）。
// Core 単体で件数・列順・部分エラー・循環・絵文字を固定するために存在する。
// RELEVANT FILES: ../include/csvmapper/preview.h, ../src/preview.cpp, all_tests.cpp

#include "csvmapper/preview.h"
#include "csvmapper/string_transforms.h"
#include "test_utils.h"

#include <atomic>
#include <cassert>
#include <chrono>
#include <string>
#include <vector>

namespace csvmapper {
namespace {

ProcessingSnapshot MakeBaseSnapshot(std::string snapshotId) {
  ProcessingSnapshot snap;
  snap.schemaVersion = "1";
  snap.snapshotId = std::move(snapshotId);
  snap.inputColumns = {{"col-a", "a"}, {"col-b", "b"}};
  snap.previewRowCount = 100;

  SnapshotNode inA;
  inA.id = "in-a";
  inA.kind = NodeKind::Input;
  inA.displayName = u"a";
  inA.inputColumnId = "col-a";

  SnapshotNode inB;
  inB.id = "in-b";
  inB.kind = NodeKind::Input;
  inB.displayName = u"b";
  inB.inputColumnId = "col-b";

  SnapshotNode upper;
  upper.id = "blk-upper";
  upper.kind = NodeKind::Block;
  upper.displayName = u"upper";
  upper.hasBlock = true;
  upper.block = BlockInfo{BlockType::ToUpper, {}};

  SnapshotNode out1;
  out1.id = "out-1";
  out1.kind = NodeKind::Output;
  out1.displayName = u"名前";

  SnapshotNode out2;
  out2.id = "out-2";
  out2.kind = NodeKind::Output;
  out2.displayName = u"備考";

  snap.nodes = {inA, inB, upper, out1, out2};
  snap.edges = {
      {"e1", "in-a", "blk-upper", 0},
      {"e2", "blk-upper", "out-1", 0},
      // out-2 は未接続
  };
  snap.outputOrder = {"out-2", "out-1"}; // 一覧順とキャンバス配置をずらす
  return snap;
}

std::string MakeCsv(std::size_t dataRows) {
  std::string csv = "a,b\n";
  for (std::size_t i = 0; i < dataRows; ++i) {
    csv += "name" + std::to_string(i) + ",note" + std::to_string(i) + "\n";
  }
  return csv;
}

} // namespace

void TestPreviewRowLimitsAndPages() {
  ClearPreviewSnapshots();
  auto snap = MakeBaseSnapshot("snap-001");
  MemoryByteSource source(MakeCsv(250));
  auto result = Preview("op-1", source, snap, 100);
  assert(result.success);
  assert(result.evaluatedRowCount == 100);
  assert(result.pages.size() == 1);
  assert(result.pages[0].rows.size() == 100);

  result = Preview("op-2", source, snap, 500);
  // 入力は 250 行しかない。
  assert(result.success);
  assert(result.evaluatedRowCount == 250);
  assert(result.pages.size() == 3);
  assert(result.pages[0].rows.size() == 100);
  assert(result.pages[1].rows.size() == 100);
  assert(result.pages[2].rows.size() == 50);
}

void TestPreviewOutputOrderAndUnconnected() {
  ClearPreviewSnapshots();
  auto snap = MakeBaseSnapshot("snap-002");
  MemoryByteSource source(MakeCsv(3));
  auto result = Preview("op-order", source, snap, 100);
  assert(result.success);
  assert(result.columns.size() == 2);
  assert(result.columns[0].outputItemId == "out-2");
  assert(result.columns[1].outputItemId == "out-1");
  assert(result.pages[0].rows.size() == 3);
  // 未接続列は空文字、接続列は ToUpper。
  assert(result.pages[0].rows[0].cells[0].empty());
  assert(result.pages[0].rows[0].cells[1] == u"NAME0");
}

void TestPreviewCellPathTwoBlocks() {
  ClearPreviewSnapshots();
  ProcessingSnapshot snap;
  snap.schemaVersion = "1";
  snap.snapshotId = "snap-path";
  snap.inputColumns = {{"col-a", "a"}};
  snap.previewRowCount = 100;

  SnapshotNode inA{"in-a", NodeKind::Input, u"a", "col-a", {}, false};
  SnapshotNode trim{"blk-trim", NodeKind::Block, u"trim", "", BlockInfo{BlockType::Trim, {}}, true};
  SnapshotNode upper{"blk-upper", NodeKind::Block, u"upper", "", BlockInfo{BlockType::ToUpper, {}}, true};
  SnapshotNode out{"out-1", NodeKind::Output, u"o", "", {}, false};
  snap.nodes = {inA, trim, upper, out};
  snap.edges = {{"e1", "in-a", "blk-trim", 0}, {"e2", "blk-trim", "blk-upper", 0}, {"e3", "blk-upper", "out-1", 0}};
  snap.outputOrder = {"out-1"};

  MemoryByteSource source(std::string("a\n  hello  \n"));
  auto preview = Preview("op-path", source, snap, 100);
  assert(preview.success);
  assert(preview.evaluatedRowCount == 1);
  assert(preview.pages[0].rows[0].cells[0] == u"HELLO");

  auto path = InspectCellPath("snap-path", 1, "out-1");
  assert(path.success);
  // 入力 → trim → upper → 出力 の順。
  assert(path.steps.size() >= 3);
  assert(path.steps[0].kind == NodeKind::Input);
  assert(path.steps[0].value == u"  hello  ");
  assert(path.steps[1].kind == NodeKind::Block);
  assert(path.steps[1].value == u"hello");
  assert(path.steps[2].kind == NodeKind::Block);
  assert(path.steps[2].value == u"HELLO");
}

void TestPreviewColumnConfigErrorKeepsOtherColumns() {
  ClearPreviewSnapshots();
  ProcessingSnapshot snap;
  snap.schemaVersion = "1";
  snap.snapshotId = "snap-col-err";
  snap.inputColumns = {{"col-a", "a"}, {"col-b", "b"}};
  snap.previewRowCount = 100;

  SnapshotNode inA{"in-a", NodeKind::Input, u"a", "col-a", {}, false};
  SnapshotNode inB{"in-b", NodeKind::Input, u"b", "col-b", {}, false};
  // FrontTrim の必須設定を欠く。
  SnapshotNode bad{"blk-bad", NodeKind::Block, u"bad", "", BlockInfo{BlockType::FrontTrim, {}}, true};
  SnapshotNode upper{"blk-upper", NodeKind::Block, u"upper", "", BlockInfo{BlockType::ToUpper, {}}, true};
  SnapshotNode outBad{"out-bad", NodeKind::Output, u"bad", "", {}, false};
  SnapshotNode outOk{"out-ok", NodeKind::Output, u"ok", "", {}, false};
  snap.nodes = {inA, inB, bad, upper, outBad, outOk};
  snap.edges = {{"e1", "in-a", "blk-bad", 0},
                {"e2", "blk-bad", "out-bad", 0},
                {"e3", "in-b", "blk-upper", 0},
                {"e4", "blk-upper", "out-ok", 0}};
  snap.outputOrder = {"out-bad", "out-ok"};

  MemoryByteSource source(std::string("a,b\nx,y\n"));
  auto result = Preview("op-col", source, snap, 100);
  assert(result.success);
  assert(!result.globalError);
  assert(result.columns[0].hasError);
  assert(!result.columns[1].hasError);
  assert(result.pages[0].rows[0].cells[0].empty());
  assert(result.pages[0].rows[0].cells[1] == u"Y");
}

void TestPreviewCycleIsGlobalError() {
  ClearPreviewSnapshots();
  ProcessingSnapshot snap;
  snap.schemaVersion = "1";
  snap.snapshotId = "snap-cycle";
  snap.inputColumns = {{"col-a", "a"}};
  SnapshotNode inA{"in-a", NodeKind::Input, u"a", "col-a", {}, false};
  SnapshotNode b1{"b1", NodeKind::Block, u"b1", "", BlockInfo{BlockType::ToUpper, {}}, true};
  SnapshotNode b2{"b2", NodeKind::Block, u"b2", "", BlockInfo{BlockType::ToUpper, {}}, true};
  SnapshotNode out{"out-1", NodeKind::Output, u"o", "", {}, false};
  snap.nodes = {inA, b1, b2, out};
  snap.edges = {{"e1", "in-a", "b1", 0}, {"e2", "b1", "b2", 0}, {"e3", "b2", "b1", 0}, {"e4", "b2", "out-1", 0}};
  snap.outputOrder = {"out-1"};

  MemoryByteSource source(std::string("a\nv\n"));
  auto result = Preview("op-cycle", source, snap, 100);
  assert(!result.success);
  assert(result.globalError);
  assert(result.evaluatedRowCount == 0);
  assert(!result.issues.empty());
  assert(result.issues[0].graphCode == GraphErrorCode::WouldCreateCycle);
}

void TestPreviewEmojiDoesNotRaiseEncodingError() {
  ClearPreviewSnapshots();
  auto snap = MakeBaseSnapshot("snap-emoji");
  // 絵文字を含む CSV。プレビューは表現不能エラーを出さない。
  std::string csv = "a,b\n😀,note\n";
  MemoryByteSource source(csv);
  auto result = Preview("op-emoji", source, snap, 100);
  assert(result.success);
  assert(result.evaluatedRowCount == 1);
  assert(result.pages[0].rows[0].cells[1].find(u"😀") != std::u16string::npos ||
         result.pages[0].rows[0].cells[1] == u"😀");
}

void TestPreviewCancelDoesNotCommit() {
  ClearPreviewSnapshots();
  auto snap = MakeBaseSnapshot("snap-cancel");
  MemoryByteSource source(MakeCsv(1000));
  std::atomic<bool> cancel{false};
  PreviewOptions options;
  options.encoding = TextEncoding::Utf8;
  options.cancelFlag = &cancel;
  options.minProgressInterval = std::chrono::milliseconds(0);
  options.readBufferBytes = 16;
  options.onProgress = [&](const PreviewProgress &progress) {
    if (progress.recordsProcessed >= 3)
      cancel.store(true);
  };
  auto result = Preview("op-cancel", source, snap, 1000, options);
  assert(!result.success);
  assert(result.cancelled);
  assert(result.evaluatedRowCount == 0);
  auto path = InspectCellPath("snap-cancel", 1, "out-1");
  assert(!path.success);
}

void TestPreviewKeepsOnlyLatestSnapshot() {
  ClearPreviewSnapshots();
  MemoryByteSource source(MakeCsv(3));
  auto oldSnap = MakeBaseSnapshot("snap-old");
  assert(Preview("op-old", source, oldSnap, 100).success);
  assert(InspectCellPath("snap-old", 1, "out-1").success);

  auto newSnap = MakeBaseSnapshot("snap-new");
  assert(Preview("op-new", source, newSnap, 100).success);
  // 成功確定後は最新 ID だけ残る。
  assert(!InspectCellPath("snap-old", 1, "out-1").success);
  assert(InspectCellPath("snap-new", 1, "out-1").success);
}

} // namespace csvmapper

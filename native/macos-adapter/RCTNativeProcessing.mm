// NativeProcessing モジュール実装。
// バックグラウンド 1 ジョブで Core の inspect/preview を回しイベントを送るために存在する。
// RELEVANT FILES: RCTNativeProcessing.h, MacOSFileSystemAdapter.mm, ../../processing-core/include/csvmapper/preview.h

#import "RCTNativeProcessing.h"

#import <React/RCTBridge.h>
#import <React/RCTUtils.h>

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

#include "MacOSFileSystemAdapter.h"
#include "csvmapper/csv_inspect.h"
#include "csvmapper/filesystem_port.h"
#include "csvmapper/preview.h"
#include "csvmapper/string_transforms.h"
#include "csvmapper/transformation_graph.h"

@interface MacOSFilePicker : NSObject
+ (void)pickCsvWithCompletion:(void (^)(NSDictionary *_Nullable file, BOOL cancelled))completion;
@end

namespace {

csvmapper::MacOSFileSystemAdapter g_fs;
std::mutex g_jobMutex;
std::string g_activeOperationId;
std::atomic<bool> g_cancelFlag{false};
std::unique_ptr<std::thread> g_jobThread;

std::u16string ToU16(NSString *value) {
  if (value == nil)
    return u"";
  NSData *data = [value dataUsingEncoding:NSUTF16LittleEndianStringEncoding];
  if (data.length < 2)
    return u"";
  const char16_t *chars = reinterpret_cast<const char16_t *>(data.bytes);
  return std::u16string(chars, data.length / 2);
}

NSString *FromU16(const std::u16string &value) {
  if (value.empty())
    return @"";
  return [[NSString alloc] initWithBytes:value.data()
                                  length:value.size() * sizeof(char16_t)
                                encoding:NSUTF16LittleEndianStringEncoding];
}

csvmapper::BlockType ParseBlockType(NSString *type) {
  static NSDictionary<NSString *, NSNumber *> *map = @{
    @"FrontTrim" : @(static_cast<int>(csvmapper::BlockType::FrontTrim)),
    @"BackTrim" : @(static_cast<int>(csvmapper::BlockType::BackTrim)),
    @"DeleteAt" : @(static_cast<int>(csvmapper::BlockType::DeleteAt)),
    @"Substring" : @(static_cast<int>(csvmapper::BlockType::Substring)),
    @"Replace" : @(static_cast<int>(csvmapper::BlockType::Replace)),
    @"DeleteAll" : @(static_cast<int>(csvmapper::BlockType::DeleteAll)),
    @"Trim" : @(static_cast<int>(csvmapper::BlockType::Trim)),
    @"RemoveWhitespace" : @(static_cast<int>(csvmapper::BlockType::RemoveWhitespace)),
    @"ToUpper" : @(static_cast<int>(csvmapper::BlockType::ToUpper)),
    @"ToLower" : @(static_cast<int>(csvmapper::BlockType::ToLower)),
    @"Prefix" : @(static_cast<int>(csvmapper::BlockType::Prefix)),
    @"Suffix" : @(static_cast<int>(csvmapper::BlockType::Suffix)),
    @"ReplaceIfEmpty" : @(static_cast<int>(csvmapper::BlockType::ReplaceIfEmpty)),
    @"Join" : @(static_cast<int>(csvmapper::BlockType::Join)),
    @"Constant" : @(static_cast<int>(csvmapper::BlockType::Constant)),
  };
  NSNumber *n = map[type];
  return n ? static_cast<csvmapper::BlockType>(n.intValue) : csvmapper::BlockType::Trim;
}

csvmapper::BlockInfo ParseBlock(NSDictionary *block) {
  csvmapper::BlockInfo info;
  info.type = ParseBlockType(block[@"type"]);
  info.inputCount = 1;
  NSDictionary *config = block[@"config"];
  NSString *kind = config[@"kind"];
  if ([kind isEqualToString:@"positionLength"]) {
    csvmapper::PositionLengthConfig cfg;
    cfg.position = [config[@"position"] unsignedLongValue];
    cfg.length = [config[@"length"] unsignedLongValue];
    info.config = cfg;
  } else if ([kind isEqualToString:@"stringPair"]) {
    csvmapper::StringPairConfig cfg;
    cfg.target = ToU16(config[@"target"]);
    cfg.replacement = ToU16(config[@"replacement"]);
    info.config = cfg;
  } else if ([kind isEqualToString:@"constant"]) {
    csvmapper::ConstantConfig cfg;
    cfg.value = ToU16(config[@"value"]);
    info.config = cfg;
  } else if ([kind isEqualToString:@"join"]) {
    csvmapper::JoinConfig cfg;
    cfg.separator = ToU16(config[@"separator"]);
    cfg.ignoreEmpty = [config[@"ignoreEmpty"] boolValue];
    info.config = cfg;
    info.inputCount = 100;
  } else {
    info.config = std::monostate{};
  }
  return info;
}

csvmapper::ProcessingSnapshot ParseSnapshot(NSDictionary *dict) {
  csvmapper::ProcessingSnapshot snap;
  snap.schemaVersion = [dict[@"schemaVersion"] UTF8String] ?: "1";
  snap.snapshotId = [dict[@"snapshotId"] UTF8String] ?: "";
  snap.previewRowCount = [dict[@"previewRowCount"] unsignedLongValue];

  for (NSDictionary *col in dict[@"inputColumns"]) {
    csvmapper::SnapshotInputColumn c;
    c.id = [col[@"id"] UTF8String] ?: "";
    c.displayName = [col[@"displayName"] UTF8String] ?: "";
    snap.inputColumns.push_back(std::move(c));
  }
  for (NSDictionary *node in dict[@"nodes"]) {
    csvmapper::SnapshotNode n;
    n.id = [node[@"id"] UTF8String] ?: "";
    NSString *kind = node[@"kind"];
    if ([kind isEqualToString:@"Input"])
      n.kind = csvmapper::NodeKind::Input;
    else if ([kind isEqualToString:@"Block"])
      n.kind = csvmapper::NodeKind::Block;
    else
      n.kind = csvmapper::NodeKind::Output;
    n.displayName = ToU16(node[@"displayName"]);
    if (node[@"inputColumnId"])
      n.inputColumnId = [node[@"inputColumnId"] UTF8String] ?: "";
    if (node[@"block"]) {
      n.hasBlock = true;
      n.block = ParseBlock(node[@"block"]);
    }
    snap.nodes.push_back(std::move(n));
  }
  for (NSDictionary *edge in dict[@"edges"]) {
    csvmapper::SnapshotEdge e;
    e.id = [edge[@"id"] UTF8String] ?: "";
    e.from = [edge[@"from"] UTF8String] ?: "";
    e.to = [edge[@"to"] UTF8String] ?: "";
    e.joinOrder = [edge[@"joinOrder"] unsignedLongValue];
    snap.edges.push_back(std::move(e));
  }
  for (NSString *outId in dict[@"outputOrder"]) {
    snap.outputOrder.push_back(outId.UTF8String ?: "");
  }
  return snap;
}

csvmapper::FileIdentity ParseFile(NSDictionary *file) {
  csvmapper::FileIdentity identity;
  identity.path = [file[@"path"] UTF8String] ?: "";
  if (file[@"osFileId"])
    identity.osFileId = [file[@"osFileId"] UTF8String] ?: "";
  identity.size = [file[@"size"] unsignedLongLongValue];
  identity.modifiedTimeMs = [file[@"modifiedTimeMs"] longLongValue];
  return identity;
}

NSString *ProcessingErrorFromCsv(csvmapper::CsvErrorCode code) {
  switch (code) {
  case csvmapper::CsvErrorCode::InvalidEncoding:
    return @"INPUT_INVALID_ENCODING";
  case csvmapper::CsvErrorCode::MalformedCsv:
    return @"CSV_MALFORMED";
  case csvmapper::CsvErrorCode::InconsistentFieldCount:
    return @"CSV_INCONSISTENT_FIELDS";
  case csvmapper::CsvErrorCode::EmptyHeader:
    return @"CSV_EMPTY_HEADER";
  case csvmapper::CsvErrorCode::EmptyFile:
    return @"CSV_EMPTY_FILE";
  default:
    return @"INTERNAL";
  }
}

NSString *ProcessingErrorFromGraph(csvmapper::GraphErrorCode code) {
  if (code == csvmapper::GraphErrorCode::WouldCreateCycle)
    return @"GRAPH_CYCLE";
  return @"GRAPH_INVALID";
}

} // namespace

@implementation RCTNativeProcessing {
  BOOL hasListeners;
}

RCT_EXPORT_MODULE(NativeProcessing);

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[ @"ProcessingEvent" ];
}

- (void)startObserving {
  hasListeners = YES;
}

- (void)stopObserving {
  hasListeners = NO;
}

- (void)emitEvent:(NSDictionary *)body {
  if (hasListeners) {
    [self sendEventWithName:@"ProcessingEvent" body:body];
  }
}

RCT_EXPORT_METHOD(pickInputFile : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject) {
  [MacOSFilePicker pickCsvWithCompletion:^(NSDictionary *file, BOOL cancelled) {
    if (cancelled || file == nil) {
      resolve(@{@"cancelled" : @YES});
      return;
    }
    resolve(@{@"cancelled" : @NO, @"file" : file});
  }];
}

RCT_EXPORT_METHOD(inspectInput : (NSString *)operationId file : (NSDictionary *)file resolver : (RCTPromiseResolveBlock)
                      resolve rejecter : (RCTPromiseRejectBlock)reject) {
  std::string op = operationId.UTF8String ?: "";
  {
    std::lock_guard<std::mutex> lock(g_jobMutex);
    if (!g_activeOperationId.empty()) {
      [self emitEvent:@{
        @"type" : @"failed",
        @"operationId" : operationId ?: @"",
        @"errorCode" : @"BUSY",
        @"message" : @"別の処理が実行中です",
      }];
      resolve(nil);
      return;
    }
    g_activeOperationId = op;
    g_cancelFlag.store(false);
  }

  auto identity = ParseFile(file);
  __weak RCTNativeProcessing *weakSelf = self;
  if (g_jobThread && g_jobThread->joinable()) {
    g_jobThread->join();
  }
  g_jobThread = std::make_unique<std::thread>([weakSelf, op, identity]() {
    RCTNativeProcessing *strongSelf = weakSelf;
    auto clearActive = []() {
      std::lock_guard<std::mutex> lock(g_jobMutex);
      g_activeOperationId.clear();
    };
    // 完了イベント送出後に active を消す（送出前 clear だと cancel 判定が壊れる）。
    auto finishOnMain = [strongSelf, op, clearActive](NSDictionary *body) {
      dispatch_async(dispatch_get_main_queue(), ^{
        [strongSelf emitEvent:body];
        clearActive();
      });
    };

    std::error_code ec;
    auto source = g_fs.OpenRead(identity, ec);
    if (!source) {
      finishOnMain(@{
        @"type" : @"failed",
        @"operationId" : [NSString stringWithUTF8String:op.c_str()],
        @"errorCode" : @"INPUT_UNREADABLE",
        @"message" : @"input unreadable",
      });
      return;
    }

    csvmapper::InspectInputOptions options;
    options.cancelFlag = &g_cancelFlag;
    options.minProgressInterval = std::chrono::milliseconds(100);
    options.onProgress = [strongSelf, op](const csvmapper::InspectProgress &progress) {
      dispatch_async(dispatch_get_main_queue(), ^{
        [strongSelf emitEvent:@{
          @"type" : @"progress",
          @"operationId" : [NSString stringWithUTF8String:op.c_str()],
          @"bytesRead" : @(progress.bytesRead),
          @"byteSize" : @(progress.byteSize),
          @"recordsProcessed" : @(progress.recordsProcessed),
        }];
      });
    };

    auto result = csvmapper::InspectInput(op, *source, options);
    if (result.cancelled) {
      finishOnMain(@{
        @"type" : @"cancelled",
        @"operationId" : [NSString stringWithUTF8String:op.c_str()],
      });
    } else if (!result.success) {
      NSString *code = @"INTERNAL";
      if (!result.issues.empty())
        code = ProcessingErrorFromCsv(result.issues.front().code);
      finishOnMain(@{
        @"type" : @"failed",
        @"operationId" : [NSString stringWithUTF8String:op.c_str()],
        @"errorCode" : code,
        @"message" : result.issues.empty() ? @"inspect failed"
                                           : [NSString stringWithUTF8String:result.issues.front().message.c_str()],
      });
    } else {
      NSMutableArray *items = [NSMutableArray array];
      for (const auto &item : result.items) {
        [items addObject:@{
          @"header" : [NSString stringWithUTF8String:item.header.c_str()],
          @"displayName" : [NSString stringWithUTF8String:item.displayName.c_str()],
          @"sample" : FromU16(item.sample),
        }];
      }
      NSMutableArray *issues = [NSMutableArray array];
      for (const auto &issue : result.issues) {
        [issues addObject:@{
          @"severity" : issue.severity == csvmapper::InspectIssueSeverity::Warning ? @"Warning" : @"Error",
          @"code" : ProcessingErrorFromCsv(issue.code),
          @"message" : [NSString stringWithUTF8String:issue.message.c_str()],
          @"recordNumber" : @(issue.location.recordNumber),
          @"startPhysicalLine" : @(issue.location.startPhysicalLine),
          @"endPhysicalLine" : @(issue.location.endPhysicalLine),
        }];
      }
      NSString *enc = @"Utf8";
      if (result.detectedEncoding == csvmapper::TextEncoding::Utf8WithBom)
        enc = @"Utf8WithBom";
      else if (result.detectedEncoding == csvmapper::TextEncoding::Windows31J)
        enc = @"Windows31J";
      finishOnMain(@{
        @"type" : @"completed",
        @"operationId" : [NSString stringWithUTF8String:op.c_str()],
        @"kind" : @"inspectInput",
        @"inspectResult" : @{
          @"operationId" : [NSString stringWithUTF8String:op.c_str()],
          @"byteSize" : @(result.byteSize),
          @"detectedEncoding" : enc,
          @"items" : items,
          @"dataRowCount" : @(result.dataRowCount),
          @"columnCount" : @(result.columnCount),
          @"issues" : issues,
        },
      });
    }
  });
  resolve(nil);
}

RCT_EXPORT_METHOD(preview : (NSString *)operationId file : (NSDictionary *)file snapshot : (NSDictionary *)
                      snapshot rowCount : (nonnull NSNumber *)rowCount resolver : (RCTPromiseResolveBlock)
                          resolve rejecter : (RCTPromiseRejectBlock)reject) {
  std::string op = operationId.UTF8String ?: "";
  {
    std::lock_guard<std::mutex> lock(g_jobMutex);
    if (!g_activeOperationId.empty()) {
      [self emitEvent:@{
        @"type" : @"failed",
        @"operationId" : operationId ?: @"",
        @"errorCode" : @"BUSY",
        @"message" : @"別の処理が実行中です",
      }];
      resolve(nil);
      return;
    }
    g_activeOperationId = op;
    g_cancelFlag.store(false);
  }

  auto identity = ParseFile(file);
  auto snap = ParseSnapshot(snapshot);
  const std::size_t limit = rowCount.unsignedLongValue;
  __weak RCTNativeProcessing *weakSelf = self;
  if (g_jobThread && g_jobThread->joinable()) {
    g_jobThread->join();
  }
  g_jobThread = std::make_unique<std::thread>([weakSelf, op, identity, snap, limit]() {
    RCTNativeProcessing *strongSelf = weakSelf;
    auto clearActive = []() {
      std::lock_guard<std::mutex> lock(g_jobMutex);
      g_activeOperationId.clear();
    };
    auto finishOnMain = [strongSelf, clearActive](NSDictionary *body) {
      dispatch_async(dispatch_get_main_queue(), ^{
        [strongSelf emitEvent:body];
        clearActive();
      });
    };

    std::error_code ec;
    auto source = g_fs.OpenRead(identity, ec);
    if (!source) {
      finishOnMain(@{
        @"type" : @"failed",
        @"operationId" : [NSString stringWithUTF8String:op.c_str()],
        @"errorCode" : @"INPUT_UNREADABLE",
        @"message" : @"input unreadable",
      });
      return;
    }

    csvmapper::PreviewOptions options;
    options.cancelFlag = &g_cancelFlag;
    options.minProgressInterval = std::chrono::milliseconds(100);
    options.onProgress = [strongSelf, op](const csvmapper::PreviewProgress &progress) {
      dispatch_async(dispatch_get_main_queue(), ^{
        [strongSelf emitEvent:@{
          @"type" : @"progress",
          @"operationId" : [NSString stringWithUTF8String:op.c_str()],
          @"bytesRead" : @(progress.bytesRead),
          @"byteSize" : @(progress.byteSize),
          @"recordsProcessed" : @(progress.recordsProcessed),
        }];
      });
    };

    auto result = csvmapper::Preview(op, *source, snap, limit, options);
    if (result.cancelled) {
      finishOnMain(@{
        @"type" : @"cancelled",
        @"operationId" : [NSString stringWithUTF8String:op.c_str()],
      });
    } else if (!result.success) {
      NSString *code = @"INTERNAL";
      NSString *message = @"preview failed";
      if (!result.issues.empty()) {
        if (result.issues.front().graphCode != csvmapper::GraphErrorCode::None)
          code = ProcessingErrorFromGraph(result.issues.front().graphCode);
        else
          code = ProcessingErrorFromCsv(result.issues.front().csvCode);
        message = [NSString stringWithUTF8String:result.issues.front().message.c_str()];
      }
      finishOnMain(@{
        @"type" : @"failed",
        @"operationId" : [NSString stringWithUTF8String:op.c_str()],
        @"errorCode" : code,
        @"message" : message,
      });
    } else {
      NSMutableArray *columns = [NSMutableArray array];
      for (const auto &col : result.columns) {
        [columns addObject:@{
          @"outputItemId" : [NSString stringWithUTF8String:col.outputItemId.c_str()],
          @"displayName" : FromU16(col.displayName),
          @"hasError" : @(col.hasError),
          @"issueMessage" : [NSString stringWithUTF8String:col.issueMessage.c_str()],
        }];
      }
      NSMutableArray *pages = [NSMutableArray array];
      for (const auto &page : result.pages) {
        NSMutableArray *rows = [NSMutableArray array];
        for (const auto &row : page.rows) {
          NSMutableArray *cells = [NSMutableArray array];
          for (const auto &cell : row.cells)
            [cells addObject:FromU16(cell)];
          [rows addObject:@{@"rowNumber" : @(row.rowNumber), @"cells" : cells}];
        }
        [pages addObject:@{@"pageIndex" : @(page.pageIndex), @"rows" : rows}];
      }
      NSMutableArray *columnIssues = [NSMutableArray array];
      for (const auto &issue : result.issues) {
        [columnIssues addObject:@{
          @"code" : @"MissingRequiredConfig",
          @"severity" : @"Error",
          @"nodeId" : [NSString stringWithUTF8String:issue.nodeId.c_str()],
          @"message" : [NSString stringWithUTF8String:issue.message.c_str()],
        }];
      }
      finishOnMain(@{
        @"type" : @"completed",
        @"operationId" : [NSString stringWithUTF8String:op.c_str()],
        @"kind" : @"preview",
        @"previewResult" : @{
          @"operationId" : [NSString stringWithUTF8String:op.c_str()],
          @"snapshotId" : [NSString stringWithUTF8String:result.snapshotId.c_str()],
          @"columns" : columns,
          @"pages" : pages,
          @"evaluatedRowCount" : @(result.evaluatedRowCount),
          @"columnIssues" : columnIssues,
        },
      });
    }
  });
  resolve(nil);
}

RCT_EXPORT_METHOD(inspectCellPath : (NSString *)snapshotId rowNumber : (nonnull NSNumber *)rowNumber outputItemId : (
    NSString *)outputItemId resolver : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject) {
  auto result = csvmapper::InspectCellPath(snapshotId.UTF8String ?: "", rowNumber.unsignedLongValue,
                                           outputItemId.UTF8String ?: "");
  NSMutableArray *steps = [NSMutableArray array];
  for (const auto &step : result.steps) {
    NSString *kind = @"Input";
    if (step.kind == csvmapper::NodeKind::Block)
      kind = @"Block";
    else if (step.kind == csvmapper::NodeKind::Output)
      kind = @"Output";
    NSMutableDictionary *dict = [@{
      @"nodeId" : [NSString stringWithUTF8String:step.nodeId.c_str()],
      @"kind" : kind,
      @"displayName" : FromU16(step.displayName),
    } mutableCopy];
    if (step.hasValue)
      dict[@"value"] = FromU16(step.value);
    if (step.hasError) {
      dict[@"errorCode"] = @"MissingRequiredConfig";
      dict[@"errorMessage"] = [NSString stringWithUTF8String:step.errorMessage.c_str()];
    }
    [steps addObject:dict];
  }
  resolve(@{
    @"snapshotId" : snapshotId ?: @"",
    @"rowNumber" : rowNumber,
    @"outputItemId" : outputItemId ?: @"",
    @"steps" : steps,
  });
}

RCT_EXPORT_METHOD(cancel : (NSString *)operationId resolver : (RCTPromiseResolveBlock)
                      resolve rejecter : (RCTPromiseRejectBlock)reject) {
  std::lock_guard<std::mutex> lock(g_jobMutex);
  std::string op = operationId.UTF8String ?: "";
  if (!g_activeOperationId.empty() && g_activeOperationId == op) {
    g_cancelFlag.store(true);
    resolve(@{@"accepted" : @YES});
    return;
  }
  resolve(@{@"accepted" : @NO});
}

@end

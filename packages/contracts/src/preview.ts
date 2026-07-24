// プレビュー・処理境界の DTO とイベント契約を定義する。
// Application と TurboModule / Processing Core が同じ型でやり取りするために存在する。
// RELEVANT FILES: snapshot.ts, issues.ts, nodes.ts, blocks.ts

import type { BlockInfo } from './blocks';
import type { GraphEdge } from './edges';
import type { GraphErrorCode, GraphIssue, IssueSeverity } from './issues';
import type { EdgeId, InputColumnId, NodeId } from './ids';
import type { CanvasPoint, InputColumn, NodeKind } from './nodes';

/** 処理スナップショットのスキーマ版。破壊的変更時に上げる。 */
export const PROCESSING_SNAPSHOT_SCHEMA_VERSION = '1';

/** プレビュー結果を JS へ渡すときの固定ページ行数。 */
export const PREVIEW_PAGE_ROW_COUNT = 100;

/** プレビュー件数の選択肢（仕様どおり）。 */
export const PREVIEW_ROW_OPTIONS = [100, 500, 1000] as const;
export type PreviewRowOption = (typeof PREVIEW_ROW_OPTIONS)[number];

/** ネイティブ境界の安定エラーコード。 */
export enum ProcessingErrorCode {
  None = 'None',
  INPUT_UNREADABLE = 'INPUT_UNREADABLE',
  INPUT_CHANGED = 'INPUT_CHANGED',
  INPUT_INVALID_ENCODING = 'INPUT_INVALID_ENCODING',
  CSV_MALFORMED = 'CSV_MALFORMED',
  CSV_INCONSISTENT_FIELDS = 'CSV_INCONSISTENT_FIELDS',
  CSV_EMPTY_HEADER = 'CSV_EMPTY_HEADER',
  CSV_EMPTY_FILE = 'CSV_EMPTY_FILE',
  GRAPH_CYCLE = 'GRAPH_CYCLE',
  GRAPH_INVALID = 'GRAPH_INVALID',
  GRAPH_MISSING_CONFIG = 'GRAPH_MISSING_CONFIG',
  ENCODING_UNMAPPABLE = 'ENCODING_UNMAPPABLE',
  OUTPUT_SAME_ENTITY = 'OUTPUT_SAME_ENTITY',
  OUTPUT_FAILED = 'OUTPUT_FAILED',
  CANCELLED = 'CANCELLED',
  INTERNAL = 'INTERNAL',
  BUSY = 'BUSY',
  UNKNOWN_OPERATION = 'UNKNOWN_OPERATION',
  UNKNOWN_SNAPSHOT = 'UNKNOWN_SNAPSHOT',
}

/** 入力ファイル参照。パスと照合用メタデータ。 */
export interface FileRef {
  path: string;
  osFileId?: string;
  size: number;
  modifiedTimeMs: number;
}

/** 処理スナップショット内のノード（座標は評価に不要だが往復のため保持）。 */
export interface ProcessingNode {
  id: NodeId;
  kind: NodeKind;
  displayName: string;
  position: CanvasPoint;
  inputColumnId?: InputColumnId;
  block?: BlockInfo;
}

/** 処理スナップショット内の辺。 */
export interface ProcessingEdge {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  joinOrder: number;
}

/**
 * 変更不能な処理スナップショット。
 * Core 側で構造・循環・必須設定を再検証する。
 */
export interface ProcessingSnapshot {
  schemaVersion: string;
  snapshotId: string;
  inputColumns: readonly InputColumn[];
  nodes: readonly ProcessingNode[];
  edges: readonly ProcessingEdge[];
  outputOrder: readonly NodeId[];
  previewRowCount: number;
}

/** プレビュー表の 1 列。 */
export interface PreviewColumn {
  outputItemId: NodeId;
  displayName: string;
  /** 列単位の問題がある場合 true。セル値は空でもよい。 */
  hasError: boolean;
  issueCode?: GraphErrorCode | ProcessingErrorCode;
  issueMessage?: string;
}

/** プレビュー表の 1 行（出力列順のセル値）。 */
export interface PreviewRow {
  /** 1 始まりのデータ行番号。 */
  rowNumber: number;
  cells: readonly string[];
}

/** 固定サイズのプレビューページ。 */
export interface PreviewPage {
  pageIndex: number;
  rows: readonly PreviewRow[];
}

/** プレビュー成功結果。 */
export interface PreviewResult {
  operationId: string;
  snapshotId: string;
  columns: readonly PreviewColumn[];
  pages: readonly PreviewPage[];
  evaluatedRowCount: number;
  columnIssues: readonly GraphIssue[];
}

/** セル経路上の 1 段階。 */
export interface CellPathStep {
  nodeId: NodeId;
  kind: NodeKind;
  displayName: string;
  /** ブロック結果または入力値。エラー時は未設定でもよい。 */
  value?: string;
  errorCode?: GraphErrorCode | ProcessingErrorCode;
  errorMessage?: string;
}

/** 選択セルの変換経路。 */
export interface CellPathResult {
  snapshotId: string;
  rowNumber: number;
  outputItemId: NodeId;
  steps: readonly CellPathStep[];
}

/** 進捗イベント。 */
export interface ProcessingProgressEvent {
  type: 'progress';
  operationId: string;
  bytesRead: number;
  byteSize: number;
  recordsProcessed: number;
}

/** 完了イベント（inspect / preview）。 */
export interface ProcessingCompletedEvent {
  type: 'completed';
  operationId: string;
  kind: 'inspectInput' | 'preview';
  inspectResult?: InspectInputResultDto;
  previewResult?: PreviewResult;
}

/** 失敗イベント。 */
export interface ProcessingFailedEvent {
  type: 'failed';
  operationId: string;
  errorCode: ProcessingErrorCode;
  message: string;
  issues?: readonly GraphIssue[];
}

/** 中止イベント。 */
export interface ProcessingCancelledEvent {
  type: 'cancelled';
  operationId: string;
}

export type ProcessingEvent =
  | ProcessingProgressEvent
  | ProcessingCompletedEvent
  | ProcessingFailedEvent
  | ProcessingCancelledEvent;

/** inspectInput 成功時の入力項目。 */
export interface InspectInputItemDto {
  header: string;
  displayName: string;
  sample: string;
}

/** inspectInput の問題。 */
export interface InspectInputIssueDto {
  severity: IssueSeverity;
  code: ProcessingErrorCode;
  message: string;
  recordNumber?: number;
  startPhysicalLine?: number;
  endPhysicalLine?: number;
}

/** inspectInput 成功結果（JS 境界）。 */
export interface InspectInputResultDto {
  operationId: string;
  byteSize: number;
  detectedEncoding: 'Utf8' | 'Utf8WithBom' | 'Windows31J';
  items: readonly InspectInputItemDto[];
  dataRowCount: number;
  columnCount: number;
  issues: readonly InspectInputIssueDto[];
}

/** ファイル選択結果。 */
export interface PickInputFileResult {
  cancelled: boolean;
  file?: FileRef;
}

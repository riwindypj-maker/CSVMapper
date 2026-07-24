// マッピング編集セッションの単一ストア。
// 文書状態・一時 UI 状態・履歴・検証・プレビュー結果を Application 層で調停するために存在する。
// RELEVANT FILES: history.ts, JobMediator.ts, ../graph/model.ts, ../gateway/ProcessingGateway.ts

import {
  BlockInfo,
  CanvasPoint,
  CommandResult,
  EdgeId,
  FileRef,
  GraphEdge,
  GraphErrorCode,
  GraphIssue,
  GraphNode,
  GraphSnapshot,
  InputColumn,
  InputColumnId,
  IssueSeverity,
  NodeId,
  PreviewResult,
  ProcessingErrorCode,
  ProcessingProgressEvent,
  ProcessingSnapshot,
} from '@csvmapper/contracts';

import { evaluateGraph } from '../graph/evaluate';
import { GraphModel } from '../graph/model';
import { validateGraph } from '../graph/validation';
import { computeAutoLayout } from '../layout/autoLayout';
import { HistoryStack } from './history';
import {
  buildProcessingSnapshot,
  normalizePreviewRowCount,
} from './processingSnapshot';

/** ズーム下限（25%）。 */
export const MIN_ZOOM = 0.25;
/** ズーム上限（200%）。 */
export const MAX_ZOOM = 2;

/**
 * セッション相。出力系（exporting 等）は順序 7 で拡張する。
 */
export type SessionPhase =
  | 'unloaded'
  | 'loading'
  | 'editable'
  | 'previewing';

export interface TransientUiState {
  selection: ReadonlySet<NodeId>;
  /** ノード選択と排他。接続線の選択削除に使う。 */
  edgeSelection: ReadonlySet<EdgeId>;
  searchQuery: string;
  focusRequest: NodeId | null;
  /** 履歴対象外。UI が後続で購読する。 */
  zoom: number;
  scrollX: number;
  scrollY: number;
}

export interface JobProgressView {
  operationId: string;
  bytesRead: number;
  byteSize: number;
  recordsProcessed: number;
}

export interface SessionFailure {
  errorCode: ProcessingErrorCode;
  message: string;
  issues?: readonly GraphIssue[];
}

/**
 * 入力項目一覧とキャンバス文書、Undo/Redo、選択/検索、プレビューをまとめるセッション。
 */
export class MappingSession {
  private inputColumns: InputColumn[] = [];
  private graph = new GraphModel();
  private readonly history = new HistoryStack();
  private issues: GraphIssue[] = [];
  private coreIssues: GraphIssue[] = [];
  private selection = new Set<NodeId>();
  private edgeSelection = new Set<EdgeId>();
  private searchQuery = '';
  private focusRequest: NodeId | null = null;
  private zoom = 1;
  private scrollX = 0;
  private scrollY = 0;
  private revision = 0;
  private readonly listeners = new Set<() => void>();

  private phase: SessionPhase = 'unloaded';
  private inputFile: FileRef | null = null;
  private inputSamples = new Map<string, string>();
  private dataRowCount = 0;
  private columnCount = 0;
  private detectedEncoding: 'Utf8' | 'Utf8WithBom' | 'Windows31J' | null = null;

  private previewResult: PreviewResult | null = null;
  private previewStale = true;
  private previewSnapshotId: string | null = null;
  private previewRowCount = 100;
  private jobProgress: JobProgressView | null = null;
  private lastFailure: SessionFailure | null = null;
  /** 再読込失敗・中止時に戻す、開始前の入力ファイル。 */
  private loadingRollbackFile: FileRef | null = null;
  /** プレビュー失敗・中止時に戻す、開始前のスナップショット ID。 */
  private previewingRollbackSnapshotId: string | null = null;

  /**
   * useSyncExternalStore 用の購読。解除関数を返す。
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** スナップショット比較用の単調増加リビジョン。 */
  getRevision(): number {
    return this.revision;
  }

  getPhase(): SessionPhase {
    return this.phase;
  }

  getInputFile(): FileRef | null {
    return this.inputFile ? { ...this.inputFile } : null;
  }

  getInputSamples(): ReadonlyMap<string, string> {
    return new Map(this.inputSamples);
  }

  getDataRowCount(): number {
    return this.dataRowCount;
  }

  getColumnCount(): number {
    return this.columnCount;
  }

  getDetectedEncoding(): 'Utf8' | 'Utf8WithBom' | 'Windows31J' | null {
    return this.detectedEncoding;
  }

  getPreviewResult(): PreviewResult | null {
    return this.previewResult;
  }

  getPreviewStale(): boolean {
    return this.previewStale;
  }

  getPreviewSnapshotId(): string | null {
    return this.previewSnapshotId;
  }

  getPreviewRowCount(): number {
    return this.previewRowCount;
  }

  setPreviewRowCount(count: number): void {
    const next = normalizePreviewRowCount(count);
    if (next === this.previewRowCount) {
      return;
    }
    this.previewRowCount = next;
    // 件数変更は既存プレビュー結果を無効化する（再実行が必要）。
    this.markPreviewStale();
    this.notify();
  }

  getJobProgress(): JobProgressView | null {
    return this.jobProgress;
  }

  getLastFailure(): SessionFailure | null {
    return this.lastFailure;
  }

  /**
   * エラーが 0 件なら CSV 出力可能（警告のみ可）。出力 UI 本体は順序 7。
   */
  get canExport(): boolean {
    return this.phase === 'editable' && this.errorIssues().length === 0;
  }

  getInputColumns(): readonly InputColumn[] {
    return this.inputColumns.map(c => ({ ...c }));
  }

  getNodes(): readonly GraphNode[] {
    return this.graph.getNodes();
  }

  getEdges(): readonly GraphEdge[] {
    return this.graph.getEdges();
  }

  getOutputOrder(): readonly NodeId[] {
    return this.graph.getOutputOrder();
  }

  getIssues(): readonly GraphIssue[] {
    return this.mergeIssues().map(i => ({ ...i }));
  }

  getTransientUi(): TransientUiState {
    return {
      selection: new Set(this.selection),
      edgeSelection: new Set(this.edgeSelection),
      searchQuery: this.searchQuery,
      focusRequest: this.focusRequest,
      zoom: this.zoom,
      scrollX: this.scrollX,
      scrollY: this.scrollY,
    };
  }

  get canUndo(): boolean {
    return this.phase === 'editable' && this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.phase === 'editable' && this.history.canRedo;
  }

  createProcessingSnapshot(previewRowCount?: number): ProcessingSnapshot {
    return buildProcessingSnapshot(
      this,
      previewRowCount ?? this.previewRowCount,
    );
  }

  beginLoading(file: FileRef, operationId: string): void {
    // 再読込失敗時に列とパスがずれないよう、開始前のファイルを退避する。
    this.loadingRollbackFile = this.inputFile ? { ...this.inputFile } : null;
    this.phase = 'loading';
    this.inputFile = { ...file };
    // 調停者が再生成されても完了イベントを拾えるよう operationId を残す。
    this.jobProgress = {
      operationId,
      bytesRead: 0,
      byteSize: file.size,
      recordsProcessed: 0,
    };
    this.lastFailure = null;
    this.notify();
  }

  commitInspectResult(params: {
    columns: readonly InputColumn[];
    samples: ReadonlyMap<string, string>;
    dataRowCount: number;
    columnCount: number;
    detectedEncoding: 'Utf8' | 'Utf8WithBom' | 'Windows31J';
    extraIssues?: readonly GraphIssue[];
  }): void {
    this.inputColumns = params.columns.map(c => ({ ...c }));
    this.inputSamples = new Map(params.samples);
    this.dataRowCount = params.dataRowCount;
    this.columnCount = params.columnCount;
    this.detectedEncoding = params.detectedEncoding;
    this.graph = new GraphModel();
    this.history.clear();
    this.selection.clear();
    this.edgeSelection.clear();
    this.searchQuery = '';
    this.focusRequest = null;
    this.zoom = 1;
    this.scrollX = 0;
    this.scrollY = 0;
    this.previewResult = null;
    this.previewStale = true;
    this.previewSnapshotId = null;
    this.loadingRollbackFile = null;
    this.previewingRollbackSnapshotId = null;
    this.coreIssues = [...(params.extraIssues ?? [])];
    this.jobProgress = null;
    this.lastFailure = null;
    this.phase = 'editable';
    this.refreshIssues();
    this.notify();
  }

  beginPreviewing(operationId: string, snapshotId: string): void {
    // 中止・失敗時にセル経路が旧プレビューとずれないよう、開始前の ID を退避する。
    this.previewingRollbackSnapshotId = this.previewSnapshotId;
    this.phase = 'previewing';
    // 新 ID は Core 登録後の commit で採用する。再実行中に未登録 ID へ inspect しない。
    void snapshotId;
    // 仕様: 結果確定まで前回結果を最新として扱わない。
    this.markPreviewStale();
    this.jobProgress = {
      operationId,
      bytesRead: 0,
      byteSize: this.inputFile?.size ?? 0,
      recordsProcessed: 0,
    };
    this.lastFailure = null;
    this.notify();
  }

  updateJobProgress(event: ProcessingProgressEvent): void {
    this.jobProgress = {
      operationId: event.operationId,
      bytesRead: event.bytesRead,
      byteSize: event.byteSize,
      recordsProcessed: event.recordsProcessed,
    };
    this.notify();
  }

  commitPreviewResult(result: PreviewResult): void {
    this.previewResult = result;
    this.previewSnapshotId = result.snapshotId;
    this.previewStale = false;
    this.previewingRollbackSnapshotId = null;
    // 読込時の NoDataRows 等を消さないよう、プレビュー列問題と併存させる。
    this.replaceCoreIssuesKeepingFileWarnings(result.columnIssues);
    this.jobProgress = null;
    this.lastFailure = null;
    this.phase = 'editable';
    this.refreshIssues();
    this.notify();
  }

  failOrCancelJob(
    kind: 'cancelled' | 'failed',
    failure?: SessionFailure,
  ): void {
    this.jobProgress = null;
    if (kind === 'failed' && failure) {
      this.lastFailure = failure;
      if (failure.issues) {
        this.replaceCoreIssuesKeepingFileWarnings(failure.issues);
      }
    } else {
      this.lastFailure = null;
    }
    // 読込失敗時は unloaded、プレビュー失敗/中止は editable へ戻す。
    if (this.phase === 'loading') {
      this.phase = this.inputColumns.length > 0 ? 'editable' : 'unloaded';
      if (this.phase === 'unloaded') {
        this.inputFile = null;
      } else {
        // 既存列がある再読込失敗: 新しいパスを捨てて読込前のファイルへ戻す。
        this.inputFile = this.loadingRollbackFile
          ? { ...this.loadingRollbackFile }
          : null;
      }
      this.loadingRollbackFile = null;
    } else if (this.phase === 'previewing') {
      // プレビュー表は前回結果のままなので、セル経路用 ID も戻す。
      this.previewSnapshotId = this.previewingRollbackSnapshotId;
      this.previewingRollbackSnapshotId = null;
      this.phase = 'editable';
    } else {
      this.phase = 'editable';
    }
    this.refreshIssues();
    this.notify();
  }

  /**
   * テスト互換: 入力列だけを入れる（Gateway 無し）。
   */
  replaceInputColumns(columns: readonly InputColumn[]): void {
    this.inputColumns = columns.map(c => ({ ...c }));
    this.graph = new GraphModel();
    this.history.clear();
    this.selection.clear();
    this.edgeSelection.clear();
    this.searchQuery = '';
    this.focusRequest = null;
    this.zoom = 1;
    this.scrollX = 0;
    this.scrollY = 0;
    this.previewResult = null;
    this.previewStale = true;
    this.previewSnapshotId = null;
    this.loadingRollbackFile = null;
    this.previewingRollbackSnapshotId = null;
    this.coreIssues = [];
    this.phase = columns.length === 0 ? 'unloaded' : 'editable';
    this.refreshIssues();
    this.notify();
  }

  /** セッション全体の初期化。履歴も空にする。 */
  resetSession(): void {
    this.inputColumns = [];
    this.graph = new GraphModel();
    this.history.clear();
    this.selection.clear();
    this.edgeSelection.clear();
    this.searchQuery = '';
    this.focusRequest = null;
    this.zoom = 1;
    this.scrollX = 0;
    this.scrollY = 0;
    this.issues = [];
    this.coreIssues = [];
    this.inputFile = null;
    this.inputSamples = new Map();
    this.dataRowCount = 0;
    this.columnCount = 0;
    this.detectedEncoding = null;
    this.previewResult = null;
    this.previewStale = true;
    this.previewSnapshotId = null;
    this.loadingRollbackFile = null;
    this.previewingRollbackSnapshotId = null;
    this.jobProgress = null;
    this.lastFailure = null;
    this.phase = 'unloaded';
    this.notify();
  }

  setSelection(ids: readonly NodeId[]): void {
    this.selection = new Set(ids);
    // ノード選択 API は接続線選択を常に解除する（背景クリック・Escape 含む）。
    this.edgeSelection.clear();
    this.notify();
  }

  setEdgeSelection(ids: readonly EdgeId[]): void {
    this.edgeSelection = new Set(ids);
    // 接続線選択中はノード選択と排他にする。
    if (ids.length > 0) {
      this.selection.clear();
    }
    this.notify();
  }

  setSearchQuery(query: string): void {
    this.searchQuery = query;
    this.notify();
  }

  requestFocus(nodeId: NodeId | null): void {
    this.focusRequest = nodeId;
    this.notify();
  }

  /**
   * フォーカス要求を一度だけ取り出し、内部状態をクリアする。
   */
  consumeFocusRequest(): NodeId | null {
    const id = this.focusRequest;
    if (id === null) {
      return null;
    }
    this.focusRequest = null;
    this.notify();
    return id;
  }

  setZoom(zoom: number): void {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    if (clamped === this.zoom) {
      return;
    }
    this.zoom = clamped;
    this.notify();
  }

  setScroll(x: number, y: number): void {
    if (x === this.scrollX && y === this.scrollY) {
      return;
    }
    this.scrollX = x;
    this.scrollY = y;
    this.notify();
  }

  /**
   * ズームとスクロールを 1 回の通知で更新する。
   * 中間フレームで中心がずれないようにするために使う。
   */
  setViewTransform(zoom: number, scrollX: number, scrollY: number): void {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    if (
      clamped === this.zoom &&
      scrollX === this.scrollX &&
      scrollY === this.scrollY
    ) {
      return;
    }
    this.zoom = clamped;
    this.scrollX = scrollX;
    this.scrollY = scrollY;
    this.notify();
  }

  addInputNode(
    id: NodeId,
    inputColumnId: InputColumnId,
    position: CanvasPoint,
  ): CommandResult {
    if (this.phase !== 'editable') {
      return { ok: false, code: GraphErrorCode.UnknownNode, message: '編集不可' };
    }
    const column = this.inputColumns.find(c => c.id === inputColumnId);
    if (!column) {
      return {
        ok: false,
        code: GraphErrorCode.UnknownNode,
        message: '入力項目一覧に存在しない列',
      };
    }
    return this.runMutation(g =>
      g.addInputNode(id, column.displayName, position, inputColumnId),
    );
  }

  addBlockNode(
    id: NodeId,
    displayName: string,
    position: CanvasPoint,
    block: BlockInfo,
  ): CommandResult {
    if (this.phase !== 'editable') {
      return { ok: false, code: GraphErrorCode.UnknownNode, message: '編集不可' };
    }
    return this.runMutation(g =>
      g.addBlockNode(id, displayName, position, block),
    );
  }

  addOutputNode(
    id: NodeId,
    displayName: string,
    position: CanvasPoint,
  ): CommandResult {
    if (this.phase !== 'editable') {
      return { ok: false, code: GraphErrorCode.UnknownNode, message: '編集不可' };
    }
    return this.runMutation(g => g.addOutputNode(id, displayName, position));
  }

  moveNodes(positions: ReadonlyMap<NodeId, CanvasPoint>): CommandResult {
    if (this.phase !== 'editable') {
      return { ok: false, code: GraphErrorCode.UnknownNode, message: '編集不可' };
    }
    return this.runMutation(g => g.moveNodes(positions));
  }

  removeNode(id: NodeId): CommandResult {
    if (this.phase !== 'editable') {
      return { ok: false, code: GraphErrorCode.UnknownNode, message: '編集不可' };
    }
    return this.runMutation(g => g.removeNode(id));
  }

  /** 複数選択削除を 1 つの Undo ステップにする。 */
  removeNodes(ids: readonly NodeId[]): CommandResult {
    if (this.phase !== 'editable') {
      return { ok: false, code: GraphErrorCode.UnknownNode, message: '編集不可' };
    }
    if (ids.length === 0) {
      return { ok: true };
    }
    return this.runMutation(g => g.removeNodes(ids));
  }

  addEdge(id: EdgeId, from: NodeId, to: NodeId): CommandResult {
    if (this.phase !== 'editable') {
      return { ok: false, code: GraphErrorCode.UnknownNode, message: '編集不可' };
    }
    return this.runMutation(g => g.addEdge(id, from, to));
  }

  removeEdge(id: EdgeId): CommandResult {
    if (this.phase !== 'editable') {
      return { ok: false, code: GraphErrorCode.UnknownNode, message: '編集不可' };
    }
    return this.runMutation(g => g.removeEdge(id));
  }

  /** 複数接続削除を 1 つの Undo ステップにする。 */
  removeEdges(ids: readonly EdgeId[]): CommandResult {
    if (this.phase !== 'editable') {
      return { ok: false, code: GraphErrorCode.UnknownNode, message: '編集不可' };
    }
    if (ids.length === 0) {
      return { ok: true };
    }
    return this.runMutation(g => g.removeEdges(ids));
  }

  setOutputName(id: NodeId, displayName: string): CommandResult {
    if (this.phase !== 'editable') {
      return { ok: false, code: GraphErrorCode.UnknownNode, message: '編集不可' };
    }
    return this.runMutation(g => g.setDisplayName(id, displayName));
  }

  setBlockConfig(id: NodeId, block: BlockInfo): CommandResult {
    if (this.phase !== 'editable') {
      return { ok: false, code: GraphErrorCode.UnknownNode, message: '編集不可' };
    }
    return this.runMutation(g => g.setBlockConfig(id, block));
  }

  setOutputOrder(outputIds: readonly NodeId[]): CommandResult {
    if (this.phase !== 'editable') {
      return { ok: false, code: GraphErrorCode.UnknownNode, message: '編集不可' };
    }
    return this.runMutation(g => g.setOutputOrder(outputIds));
  }

  setJoinInputOrder(
    joinNodeId: NodeId,
    orderedEdgeIds: readonly EdgeId[],
  ): CommandResult {
    if (this.phase !== 'editable') {
      return { ok: false, code: GraphErrorCode.UnknownNode, message: '編集不可' };
    }
    return this.runMutation(g =>
      g.setJoinInputOrder(joinNodeId, orderedEdgeIds),
    );
  }

  /** 自動整列を 1 操作として全座標を確定する。 */
  autoLayout(): CommandResult {
    if (this.phase !== 'editable') {
      return { ok: false, code: GraphErrorCode.UnknownNode, message: '編集不可' };
    }
    if (this.graph.getNodes().length === 0) {
      return { ok: true };
    }
    // dagre 例外は runMutation 外で受け止め、グラフを汚さない。
    let positions: Map<NodeId, CanvasPoint>;
    try {
      positions = computeAutoLayout(this.graph);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '自動整列に失敗しました';
      return {
        ok: false,
        code: GraphErrorCode.UnknownNode,
        message,
      };
    }
    return this.runMutation(g => g.moveNodes(positions));
  }

  undo(): boolean {
    if (this.phase !== 'editable') {
      return false;
    }
    const restored = this.history.undo({ graph: this.graph });
    if (!restored) {
      return false;
    }
    this.graph = restored.graph;
    this.markPreviewStale();
    this.refreshIssues();
    this.notify();
    return true;
  }

  redo(): boolean {
    if (this.phase !== 'editable') {
      return false;
    }
    const restored = this.history.redo({ graph: this.graph });
    if (!restored) {
      return false;
    }
    this.graph = restored.graph;
    this.markPreviewStale();
    this.refreshIssues();
    this.notify();
    return true;
  }

  isAcyclic(): boolean {
    return this.graph.isAcyclic();
  }

  evaluate(
    inputValues: ReadonlyMap<NodeId, string> | Record<NodeId, string>,
  ): Map<NodeId, string> {
    return evaluateGraph(this.graph, inputValues);
  }

  snapshot(): GraphSnapshot {
    return {
      inputColumns: this.getInputColumns(),
      nodes: this.getNodes(),
      edges: this.getEdges(),
      outputOrder: this.getOutputOrder(),
    };
  }

  errorIssues(): readonly GraphIssue[] {
    return this.mergeIssues().filter(i => i.severity === IssueSeverity.Error);
  }

  warningIssues(): readonly GraphIssue[] {
    return this.mergeIssues().filter(i => i.severity === IssueSeverity.Warning);
  }

  private markPreviewStale(): void {
    if (this.previewResult) {
      this.previewStale = true;
    }
  }

  /**
   * Core 由来問題を差し替えるが、読込時の NoDataRows 警告は残す。
   * プレビュー列問題だけで丸ごと置換するとヘッダーのみ CSV の警告が消えるため。
   */
  private replaceCoreIssuesKeepingFileWarnings(
    next: readonly GraphIssue[],
  ): void {
    const retained = this.coreIssues.filter(
      issue =>
        issue.code === GraphErrorCode.NoDataRows &&
        !next.some(candidate => candidate.code === GraphErrorCode.NoDataRows),
    );
    this.coreIssues = [...retained, ...next];
  }

  private runMutation(
    mutate: (graph: GraphModel) => CommandResult,
  ): CommandResult {
    const before = this.graph.clone();
    const result = mutate(this.graph);
    if (!result.ok) {
      this.graph = before;
      return result;
    }
    this.history.pushBeforeChange({ graph: before });
    this.markPreviewStale();
    this.refreshIssues();
    this.notify();
    return result;
  }

  private refreshIssues(): void {
    this.issues = validateGraph(this.graph);
  }

  /**
   * validateGraph と Core 由来問題を統合する。同一要素はエラー優先。
   */
  private mergeIssues(): GraphIssue[] {
    const byKey = new Map<string, GraphIssue>();
    const keyOf = (issue: GraphIssue) =>
      `${issue.nodeId ?? ''}|${issue.edgeId ?? ''}|${issue.code}`;

    const consider = (issue: GraphIssue) => {
      const key = keyOf(issue);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, issue);
        return;
      }
      if (
        existing.severity === IssueSeverity.Warning &&
        issue.severity === IssueSeverity.Error
      ) {
        byKey.set(key, issue);
      }
    };

    for (const issue of this.issues) {
      consider(issue);
    }
    for (const issue of this.coreIssues) {
      consider(issue);
    }

    // 同一 nodeId で Error があれば Warning を伏せる。
    const byNode = new Map<string, GraphIssue[]>();
    const global: GraphIssue[] = [];
    for (const issue of byKey.values()) {
      if (issue.nodeId) {
        const list = byNode.get(issue.nodeId) ?? [];
        list.push(issue);
        byNode.set(issue.nodeId, list);
      } else {
        global.push(issue);
      }
    }
    const merged: GraphIssue[] = [...global];
    for (const list of byNode.values()) {
      const hasError = list.some(i => i.severity === IssueSeverity.Error);
      if (hasError) {
        merged.push(...list.filter(i => i.severity === IssueSeverity.Error));
      } else {
        merged.push(...list);
      }
    }
    return merged;
  }

  private notify(): void {
    this.revision += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

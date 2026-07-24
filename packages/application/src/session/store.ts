// マッピング編集セッションの単一ストア。
// 文書状態・一時 UI 状態・履歴・検証を Application 層で調停するために存在する。
// RELEVANT FILES: history.ts, ../graph/model.ts, ../layout/autoLayout.ts

import {
  BlockInfo,
  CanvasPoint,
  CommandResult,
  EdgeId,
  GraphEdge,
  GraphErrorCode,
  GraphIssue,
  GraphNode,
  GraphSnapshot,
  InputColumn,
  InputColumnId,
  NodeId,
  IssueSeverity,
} from '@csvmapper/contracts';

import { evaluateGraph } from '../graph/evaluate';
import { GraphModel } from '../graph/model';
import { validateGraph } from '../graph/validation';
import { computeAutoLayout } from '../layout/autoLayout';
import { HistoryStack } from './history';

/** ズーム下限（25%）。 */
export const MIN_ZOOM = 0.25;
/** ズーム上限（200%）。 */
export const MAX_ZOOM = 2;

/**
 * UI が編集可否を切り替えるための簡易セッション相。
 * 読込中・プレビュー中の本格状態機械は後続順序で拡張する。
 */
export type SessionPhase = 'unloaded' | 'editable';

export interface TransientUiState {
  selection: ReadonlySet<NodeId>;
  searchQuery: string;
  focusRequest: NodeId | null;
  /** 履歴対象外。UI が後続で購読する。 */
  zoom: number;
  scrollX: number;
  scrollY: number;
}

/**
 * 入力項目一覧とキャンバス文書、Undo/Redo、選択/検索をまとめるセッション。
 */
export class MappingSession {
  private inputColumns: InputColumn[] = [];
  private graph = new GraphModel();
  private readonly history = new HistoryStack();
  private issues: GraphIssue[] = [];
  private selection = new Set<NodeId>();
  private searchQuery = '';
  private focusRequest: NodeId | null = null;
  private zoom = 1;
  private scrollX = 0;
  private scrollY = 0;
  private revision = 0;
  private readonly listeners = new Set<() => void>();

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

  /**
   * 未読込は unloaded、入力列がある場合は editable。
   */
  getPhase(): SessionPhase {
    return this.inputColumns.length === 0 ? 'unloaded' : 'editable';
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
    return this.issues.map(i => ({ ...i }));
  }

  getTransientUi(): TransientUiState {
    return {
      selection: new Set(this.selection),
      searchQuery: this.searchQuery,
      focusRequest: this.focusRequest,
      zoom: this.zoom,
      scrollX: this.scrollX,
      scrollY: this.scrollY,
    };
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  /**
   * 入力 CSV 読込相当。マッピングと履歴を破棄し、列一覧だけを入れる。
   */
  replaceInputColumns(columns: readonly InputColumn[]): void {
    this.inputColumns = columns.map(c => ({ ...c }));
    this.graph = new GraphModel();
    this.history.clear();
    this.selection.clear();
    this.searchQuery = '';
    this.focusRequest = null;
    // マッピング破棄に合わせてビューポートも初期化する（resetSession と同方針）。
    this.zoom = 1;
    this.scrollX = 0;
    this.scrollY = 0;
    this.refreshIssues();
    this.notify();
  }

  /** セッション全体の初期化。履歴も空にする。 */
  resetSession(): void {
    this.inputColumns = [];
    this.graph = new GraphModel();
    this.history.clear();
    this.selection.clear();
    this.searchQuery = '';
    this.focusRequest = null;
    this.zoom = 1;
    this.scrollX = 0;
    this.scrollY = 0;
    this.issues = [];
    this.notify();
  }

  setSelection(ids: readonly NodeId[]): void {
    this.selection = new Set(ids);
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

  addInputNode(
    id: NodeId,
    inputColumnId: InputColumnId,
    position: CanvasPoint,
  ): CommandResult {
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
    return this.runMutation(g =>
      g.addBlockNode(id, displayName, position, block),
    );
  }

  addOutputNode(
    id: NodeId,
    displayName: string,
    position: CanvasPoint,
  ): CommandResult {
    return this.runMutation(g => g.addOutputNode(id, displayName, position));
  }

  moveNodes(positions: ReadonlyMap<NodeId, CanvasPoint>): CommandResult {
    return this.runMutation(g => g.moveNodes(positions));
  }

  removeNode(id: NodeId): CommandResult {
    return this.runMutation(g => g.removeNode(id));
  }

  /** 複数選択削除を 1 つの Undo ステップにする。 */
  removeNodes(ids: readonly NodeId[]): CommandResult {
    // 空配列は GraphModel が ok を返すため、ここで弾かないと空の Undo が残る。
    if (ids.length === 0) {
      return { ok: true };
    }
    return this.runMutation(g => g.removeNodes(ids));
  }

  addEdge(id: EdgeId, from: NodeId, to: NodeId): CommandResult {
    return this.runMutation(g => g.addEdge(id, from, to));
  }

  removeEdge(id: EdgeId): CommandResult {
    return this.runMutation(g => g.removeEdge(id));
  }

  setOutputName(id: NodeId, displayName: string): CommandResult {
    return this.runMutation(g => g.setDisplayName(id, displayName));
  }

  setBlockConfig(id: NodeId, block: BlockInfo): CommandResult {
    return this.runMutation(g => g.setBlockConfig(id, block));
  }

  setOutputOrder(outputIds: readonly NodeId[]): CommandResult {
    return this.runMutation(g => g.setOutputOrder(outputIds));
  }

  setJoinInputOrder(
    joinNodeId: NodeId,
    orderedEdgeIds: readonly EdgeId[],
  ): CommandResult {
    return this.runMutation(g =>
      g.setJoinInputOrder(joinNodeId, orderedEdgeIds),
    );
  }

  /** 自動整列を 1 操作として全座標を確定する。 */
  autoLayout(): CommandResult {
    return this.runMutation(g => {
      const positions = computeAutoLayout(g);
      return g.moveNodes(positions);
    });
  }

  undo(): boolean {
    const restored = this.history.undo({ graph: this.graph });
    if (!restored) {
      return false;
    }
    this.graph = restored.graph;
    this.refreshIssues();
    this.notify();
    return true;
  }

  redo(): boolean {
    const restored = this.history.redo({ graph: this.graph });
    if (!restored) {
      return false;
    }
    this.graph = restored.graph;
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
    return this.issues.filter(i => i.severity === IssueSeverity.Error);
  }

  warningIssues(): readonly GraphIssue[] {
    return this.issues.filter(i => i.severity === IssueSeverity.Warning);
  }

  private runMutation(
    mutate: (graph: GraphModel) => CommandResult,
  ): CommandResult {
    const before = this.graph.clone();
    const result = mutate(this.graph);
    if (!result.ok) {
      // 失敗時は呼び出し側が部分変更しない前提だが、安全のため戻す。
      this.graph = before;
      return result;
    }
    this.history.pushBeforeChange({ graph: before });
    this.refreshIssues();
    this.notify();
    return result;
  }

  private refreshIssues(): void {
    this.issues = validateGraph(this.graph);
  }

  private notify(): void {
    this.revision += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

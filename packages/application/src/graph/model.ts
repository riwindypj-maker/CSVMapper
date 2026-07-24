// 編集時グラフの可変モデルを保持する。
// 接続不変条件を保ちつつノード・辺を更新するために存在する。
// RELEVANT FILES: validation.ts, evaluate.ts, ../session/store.ts

import {
  BlockInfo,
  BlockType,
  CanvasPoint,
  CommandFailure,
  CommandResult,
  CommandSuccess,
  EdgeId,
  GraphEdge,
  GraphErrorCode,
  GraphNode,
  JOIN_INPUT_LIMIT,
  NodeId,
  NodeKind,
  SINGLE_INPUT_LIMIT,
} from '@csvmapper/contracts';

const ok = (): CommandSuccess => ({ ok: true });

const fail = (code: GraphErrorCode, message: string): CommandFailure => ({
  ok: false,
  code,
  message,
});

/** ノードに付随する入出力辺 ID を高速参照するための内部索引。 */
interface NodeLinks {
  inputEdgeIds: EdgeId[];
  outputEdgeIds: EdgeId[];
}

/**
 * キャンバス編集用の有向非巡回グラフ。
 * C++ TransformationGraph の接続規則を TypeScript に移植した編集時正本。
 */
export class GraphModel {
  private readonly nodes = new Map<NodeId, GraphNode>();
  private readonly edges = new Map<EdgeId, GraphEdge>();
  private readonly links = new Map<NodeId, NodeLinks>();
  private outputOrder: NodeId[] = [];
  /** キャンバス上に配置済みの入力列 ID。同一列の二重配置を防ぐ。 */
  private readonly placedInputColumns = new Set<string>();

  clone(): GraphModel {
    const copy = new GraphModel();
    for (const node of this.nodes.values()) {
      copy.nodes.set(node.id, cloneNode(node));
      const link = this.links.get(node.id)!;
      copy.links.set(node.id, {
        inputEdgeIds: [...link.inputEdgeIds],
        outputEdgeIds: [...link.outputEdgeIds],
      });
      if (node.kind === NodeKind.Input && node.inputColumnId) {
        copy.placedInputColumns.add(node.inputColumnId);
      }
    }
    for (const edge of this.edges.values()) {
      copy.edges.set(edge.id, { ...edge });
    }
    copy.outputOrder = [...this.outputOrder];
    return copy;
  }

  getNodes(): readonly GraphNode[] {
    return [...this.nodes.values()].map(cloneNode);
  }

  getNode(id: NodeId): GraphNode | undefined {
    const node = this.nodes.get(id);
    return node ? cloneNode(node) : undefined;
  }

  getEdges(): readonly GraphEdge[] {
    return [...this.edges.values()].map(e => ({ ...e }));
  }

  getEdge(id: EdgeId): GraphEdge | undefined {
    const edge = this.edges.get(id);
    return edge ? { ...edge } : undefined;
  }

  getOutputOrder(): readonly NodeId[] {
    return [...this.outputOrder];
  }

  getInputEdgeIds(nodeId: NodeId): readonly EdgeId[] {
    return [...(this.links.get(nodeId)?.inputEdgeIds ?? [])];
  }

  getOutputEdgeIds(nodeId: NodeId): readonly EdgeId[] {
    return [...(this.links.get(nodeId)?.outputEdgeIds ?? [])];
  }

  hasPlacedInputColumn(columnId: string): boolean {
    return this.placedInputColumns.has(columnId);
  }

  addInputNode(
    id: NodeId,
    displayName: string,
    position: CanvasPoint,
    inputColumnId: string,
  ): CommandResult {
    if (this.nodes.has(id)) {
      return fail(GraphErrorCode.DuplicateInput, 'ノード ID が既に存在する');
    }
    if (this.placedInputColumns.has(inputColumnId)) {
      return fail(
        GraphErrorCode.DuplicateInput,
        '同一入力項目はキャンバスに 1 ノードだけ配置できる',
      );
    }
    this.nodes.set(id, {
      id,
      kind: NodeKind.Input,
      displayName,
      position: { ...position },
      inputColumnId,
    });
    this.links.set(id, { inputEdgeIds: [], outputEdgeIds: [] });
    this.placedInputColumns.add(inputColumnId);
    return ok();
  }

  addBlockNode(
    id: NodeId,
    displayName: string,
    position: CanvasPoint,
    block: BlockInfo,
  ): CommandResult {
    if (this.nodes.has(id)) {
      return fail(GraphErrorCode.DuplicateInput, 'ノード ID が既に存在する');
    }
    this.nodes.set(id, {
      id,
      kind: NodeKind.Block,
      displayName,
      position: { ...position },
      block: cloneBlock(block),
    });
    this.links.set(id, { inputEdgeIds: [], outputEdgeIds: [] });
    return ok();
  }

  addOutputNode(
    id: NodeId,
    displayName: string,
    position: CanvasPoint,
  ): CommandResult {
    if (this.nodes.has(id)) {
      return fail(GraphErrorCode.DuplicateInput, 'ノード ID が既に存在する');
    }
    this.nodes.set(id, {
      id,
      kind: NodeKind.Output,
      displayName,
      position: { ...position },
    });
    this.links.set(id, { inputEdgeIds: [], outputEdgeIds: [] });
    this.outputOrder.push(id);
    return ok();
  }

  addEdge(id: EdgeId, from: NodeId, to: NodeId): CommandResult {
    if (this.edges.has(id)) {
      return fail(GraphErrorCode.TerminalMismatch, '接続 ID が既に存在する');
    }
    return this.addEdgeInternal(id, from, to);
  }

  removeNode(id: NodeId): CommandResult {
    const node = this.nodes.get(id);
    if (!node) {
      return fail(GraphErrorCode.UnknownNode, 'ノードが存在しない');
    }
    this.removeNodeInternal(id, node);
    return ok();
  }

  /**
   * 複数ノードを 1 コマンドとして削除する。
   * 存在確認を先に完了し、失敗時は状態を変えない。
   */
  removeNodes(ids: readonly NodeId[]): CommandResult {
    if (ids.length === 0) {
      return ok();
    }
    const unique: NodeId[] = [];
    const seen = new Set<NodeId>();
    for (const id of ids) {
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      unique.push(id);
    }
    for (const id of unique) {
      if (!this.nodes.has(id)) {
        return fail(GraphErrorCode.UnknownNode, `ノードが存在しない: ${id}`);
      }
    }
    for (const id of unique) {
      this.removeNodeInternal(id, this.nodes.get(id)!);
    }
    return ok();
  }

  removeEdge(id: EdgeId): CommandResult {
    const edge = this.edges.get(id);
    if (!edge) {
      return fail(GraphErrorCode.UnknownEdge, '接続が存在しない');
    }
    const toNodeId = edge.to;
    const fromLink = this.links.get(edge.from);
    const toLink = this.links.get(edge.to);
    if (fromLink) {
      fromLink.outputEdgeIds = fromLink.outputEdgeIds.filter(e => e !== id);
    }
    if (toLink) {
      toLink.inputEdgeIds = toLink.inputEdgeIds.filter(e => e !== id);
    }
    this.edges.delete(id);
    // Join 入力辺の削除で結合順に欠番が出るため、残辺を 0..n-1 に詰め直す。
    this.compactJoinOrderIfNeeded(toNodeId);
    return ok();
  }

  moveNodes(positions: ReadonlyMap<NodeId, CanvasPoint>): CommandResult {
    // CommandFailure 時は状態を変えないため、存在確認を書き込み前に完了する。
    for (const id of positions.keys()) {
      if (!this.nodes.has(id)) {
        return fail(GraphErrorCode.UnknownNode, `ノードが存在しない: ${id}`);
      }
    }
    for (const [id, point] of positions) {
      const node = this.nodes.get(id)!;
      node.position = {
        x: Math.round(point.x),
        y: Math.round(point.y),
      };
    }
    return ok();
  }

  setDisplayName(id: NodeId, displayName: string): CommandResult {
    const node = this.nodes.get(id);
    if (!node) {
      return fail(GraphErrorCode.UnknownNode, 'ノードが存在しない');
    }
    node.displayName = displayName;
    return ok();
  }

  setBlockConfig(id: NodeId, block: BlockInfo): CommandResult {
    const node = this.nodes.get(id);
    if (!node || node.kind !== NodeKind.Block) {
      return fail(GraphErrorCode.TerminalMismatch, '編集ブロックではない');
    }
    node.block = cloneBlock(block);
    return ok();
  }

  setOutputOrder(outputIds: readonly NodeId[]): CommandResult {
    const outputs = [...this.nodes.values()].filter(
      n => n.kind === NodeKind.Output,
    );
    if (outputIds.length !== outputs.length) {
      return fail(
        GraphErrorCode.TerminalMismatch,
        '出力項目の並びが出力ノードと一致しない',
      );
    }
    const expected = new Set(outputs.map(o => o.id));
    const seen = new Set<NodeId>();
    for (const id of outputIds) {
      if (!expected.has(id) || seen.has(id)) {
        return fail(
          GraphErrorCode.TerminalMismatch,
          '出力項目の並びが不正である',
        );
      }
      seen.add(id);
    }
    this.outputOrder = [...outputIds];
    return ok();
  }

  setJoinInputOrder(
    joinNodeId: NodeId,
    orderedEdgeIds: readonly EdgeId[],
  ): CommandResult {
    const node = this.nodes.get(joinNodeId);
    if (
      !node ||
      node.kind !== NodeKind.Block ||
      !node.block ||
      node.block.type !== BlockType.Join
    ) {
      return fail(GraphErrorCode.TerminalMismatch, 'Join ブロックではない');
    }
    const link = this.links.get(joinNodeId)!;
    if (orderedEdgeIds.length !== link.inputEdgeIds.length) {
      return fail(GraphErrorCode.InvalidJoinOrder, '結合順の要素数が一致しない');
    }
    const expected = new Set(link.inputEdgeIds);
    const seen = new Set<EdgeId>();
    // CommandFailure 時は状態を変えないため、検証完了後にだけ joinOrder を書く。
    for (const edgeId of orderedEdgeIds) {
      if (!expected.has(edgeId) || seen.has(edgeId) || !this.edges.has(edgeId)) {
        return fail(GraphErrorCode.InvalidJoinOrder, '結合順が不正である');
      }
      seen.add(edgeId);
    }
    orderedEdgeIds.forEach((edgeId, i) => {
      this.edges.get(edgeId)!.joinOrder = i;
    });
    return ok();
  }

  /** トポロジカル順。循環があれば不完全な配列を返す。 */
  topologicalSort(): NodeId[] {
    const inDegree = new Map<NodeId, number>();
    for (const id of this.nodes.keys()) {
      inDegree.set(id, this.links.get(id)?.inputEdgeIds.length ?? 0);
    }
    const ready: NodeId[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        ready.push(id);
      }
    }
    const order: NodeId[] = [];
    while (ready.length > 0) {
      const current = ready.shift()!;
      order.push(current);
      const link = this.links.get(current);
      if (!link) {
        continue;
      }
      for (const edgeId of link.outputEdgeIds) {
        const edge = this.edges.get(edgeId);
        if (!edge) {
          continue;
        }
        const next = inDegree.get(edge.to)! - 1;
        inDegree.set(edge.to, next);
        if (next === 0) {
          ready.push(edge.to);
        }
      }
    }
    return order;
  }

  isAcyclic(): boolean {
    return this.topologicalSort().length === this.nodes.size;
  }

  private removeNodeInternal(id: NodeId, node: GraphNode): void {
    const link = this.links.get(id)!;
    const edgeIds = [...link.inputEdgeIds, ...link.outputEdgeIds];
    for (const edgeId of edgeIds) {
      this.removeEdge(edgeId);
    }
    if (node.kind === NodeKind.Input && node.inputColumnId) {
      this.placedInputColumns.delete(node.inputColumnId);
    }
    if (node.kind === NodeKind.Output) {
      this.outputOrder = this.outputOrder.filter(oid => oid !== id);
    }
    this.nodes.delete(id);
    this.links.delete(id);
  }

  private addEdgeInternal(id: EdgeId, from: NodeId, to: NodeId): CommandResult {
    if (from === to) {
      return fail(GraphErrorCode.SelfLoop, '自己接続は許可されない');
    }
    const fromNode = this.nodes.get(from);
    const toNode = this.nodes.get(to);
    if (!fromNode || !toNode) {
      return fail(GraphErrorCode.UnknownNode, '接続端点が存在しない');
    }
    if (fromNode.kind === NodeKind.Output) {
      return fail(GraphErrorCode.OutputAsSource, '出力項目を接続元にできない');
    }
    if (toNode.kind === NodeKind.Input) {
      return fail(GraphErrorCode.InputAsTarget, '入力項目を接続先にできない');
    }
    if (toNode.kind === NodeKind.Block && toNode.block?.type === BlockType.Constant) {
      return fail(
        GraphErrorCode.TerminalMismatch,
        '固定値ブロックは入力端子を持たない',
      );
    }
    if (this.wouldCreateCycle(from, to)) {
      return fail(GraphErrorCode.WouldCreateCycle, '循環を生む接続は許可されない');
    }

    const toLink = this.links.get(to)!;
    if (toNode.kind === NodeKind.Block && toNode.block) {
      if (toNode.block.type === BlockType.Join) {
        if (toLink.inputEdgeIds.length >= JOIN_INPUT_LIMIT) {
          return fail(
            GraphErrorCode.TooManyInputs,
            `Join の入力は最大 ${JOIN_INPUT_LIMIT} 件まで`,
          );
        }
      } else if (toLink.inputEdgeIds.length >= SINGLE_INPUT_LIMIT) {
        return fail(GraphErrorCode.TooManyInputs, 'このブロックは 1 入力まで');
      }
    }
    if (
      toNode.kind === NodeKind.Output &&
      toLink.inputEdgeIds.length >= SINGLE_INPUT_LIMIT
    ) {
      return fail(GraphErrorCode.TooManyInputs, '出力項目は 1 入力まで');
    }

    let joinOrder = 0;
    if (toNode.kind === NodeKind.Block && toNode.block?.type === BlockType.Join) {
      joinOrder = toLink.inputEdgeIds.length;
    }

    this.edges.set(id, { id, from, to, joinOrder });
    this.links.get(from)!.outputEdgeIds.push(id);
    toLink.inputEdgeIds.push(id);
    return ok();
  }

  /**
   * Join ノードの残入力辺を、既存の結合順を保ったまま 0..n-1 へ詰め直す。
   * removeEdge / removeNode 後に validateGraph が InvalidJoinOrder にならないようにする。
   */
  private compactJoinOrderIfNeeded(nodeId: NodeId): void {
    const node = this.nodes.get(nodeId);
    if (
      !node ||
      node.kind !== NodeKind.Block ||
      node.block?.type !== BlockType.Join
    ) {
      return;
    }
    const link = this.links.get(nodeId);
    if (!link || link.inputEdgeIds.length === 0) {
      return;
    }
    const remaining = link.inputEdgeIds
      .map(edgeId => this.edges.get(edgeId))
      .filter((e): e is GraphEdge => e !== undefined)
      .sort((a, b) => a.joinOrder - b.joinOrder);
    for (let i = 0; i < remaining.length; i++) {
      remaining[i].joinOrder = i;
    }
  }

  private wouldCreateCycle(from: NodeId, to: NodeId): boolean {
    const visited = new Set<NodeId>();
    const queue: NodeId[] = [to];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === from) {
        return true;
      }
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);
      const link = this.links.get(current);
      if (!link) {
        continue;
      }
      for (const edgeId of link.outputEdgeIds) {
        const edge = this.edges.get(edgeId);
        if (edge) {
          queue.push(edge.to);
        }
      }
    }
    return false;
  }
}

function cloneNode(node: GraphNode): GraphNode {
  return {
    ...node,
    position: { ...node.position },
    block: node.block ? cloneBlock(node.block) : undefined,
  };
}

function cloneBlock(block: BlockInfo): BlockInfo {
  return {
    type: block.type,
    config: { ...block.config },
  };
}

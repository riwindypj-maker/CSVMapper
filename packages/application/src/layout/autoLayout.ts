// @dagrejs/dagre でノード座標案を計算する。
// 自動整列を 1 操作の座標更新として扱うために存在する。
// RELEVANT FILES: ../session/store.ts, ../graph/model.ts

import dagre from '@dagrejs/dagre';

import type { CanvasPoint, NodeId } from '@csvmapper/contracts';

import type { GraphModel } from '../graph/model';

/** UI の layout.nodeWidth / nodeHeight と一致させる。 */
const NODE_WIDTH = 148;
const NODE_HEIGHT = 60;

/**
 * Hermes には Web API の structuredClone が無い。
 * dagre 3 の整列経路が参照するため、未定義時だけ JSON ベースの代替を置く。
 */
function ensureStructuredClone(): void {
  const globalObj = globalThis as typeof globalThis & {
    structuredClone?: <T>(value: T) => T;
  };
  if (typeof globalObj.structuredClone === 'function') {
    return;
  }
  globalObj.structuredClone = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 現在の接続関係から整列後の整数座標を返す。
 * グラフ自体は変更しない。
 */
export function computeAutoLayout(
  graph: GraphModel,
): Map<NodeId, CanvasPoint> {
  const positions = new Map<NodeId, CanvasPoint>();
  const nodes = graph.getNodes();
  if (nodes.length === 0) {
    return positions;
  }

  ensureStructuredClone();

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'LR',
    nodesep: 48,
    ranksep: 80,
    marginx: 24,
    marginy: 24,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of graph.getEdges()) {
    g.setEdge(edge.from, edge.to);
  }

  dagre.layout(g);

  for (const node of nodes) {
    const layout = g.node(node.id);
    if (!layout) {
      continue;
    }
    // dagre は中心座標を返すため、左上へ変換して整数化する。
    positions.set(node.id, {
      x: Math.round(layout.x - NODE_WIDTH / 2),
      y: Math.round(layout.y - NODE_HEIGHT / 2),
    });
  }
  return positions;
}

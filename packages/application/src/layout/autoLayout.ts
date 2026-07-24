// @dagrejs/dagre でノード座標案を計算する。
// 自動整列を 1 操作の座標更新として扱うために存在する。
// RELEVANT FILES: ../session/store.ts, ../graph/model.ts

import * as dagre from '@dagrejs/dagre';

import type { CanvasPoint, NodeId } from '@csvmapper/contracts';

import type { GraphModel } from '../graph/model';

const NODE_WIDTH = 160;
const NODE_HEIGHT = 48;

/**
 * 現在の接続関係から整列後の整数座標を返す。
 * グラフ自体は変更しない。
 */
export function computeAutoLayout(
  graph: GraphModel,
): Map<NodeId, CanvasPoint> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'LR',
    nodesep: 48,
    ranksep: 80,
    marginx: 24,
    marginy: 24,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of graph.getNodes()) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of graph.getEdges()) {
    g.setEdge(edge.from, edge.to);
  }

  dagre.layout(g);

  const positions = new Map<NodeId, CanvasPoint>();
  for (const node of graph.getNodes()) {
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

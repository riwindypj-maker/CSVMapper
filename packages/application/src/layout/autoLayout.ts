// @dagrejs/dagre でノード座標案を計算する。
// 自動整列を 1 操作の座標更新として扱うために存在する。
// RELEVANT FILES: ../session/store.ts, ../graph/model.ts

import dagre from '@dagrejs/dagre';

import type { CanvasPoint, NodeId } from '@csvmapper/contracts';

import type { GraphModel } from '../graph/model';

/** UI の layout.nodeWidth / nodeHeight と一致させる。 */
const NODE_WIDTH = 148;
const NODE_HEIGHT = 60;

type StructuredCloneFn = <T>(value: T) => T;

/**
 * Hermes には Web API の structuredClone が無い。
 * dagre 3 の整列経路が参照するため、呼び出し中だけ JSON ベースの代替を置く。
 * グローバルを恒久上書きしないよう、finally で必ず元へ戻す。
 */
function withStructuredCloneFallback<T>(run: () => T): T {
  const globalObj = globalThis as typeof globalThis & {
    structuredClone?: StructuredCloneFn;
  };
  if (typeof globalObj.structuredClone === 'function') {
    return run();
  }
  const previous = globalObj.structuredClone;
  globalObj.structuredClone = <U>(value: U): U =>
    JSON.parse(JSON.stringify(value)) as U;
  try {
    return run();
  } finally {
    if (typeof previous === 'function') {
      globalObj.structuredClone = previous;
    } else {
      Reflect.deleteProperty(globalObj, 'structuredClone');
    }
  }
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

  return withStructuredCloneFallback(() => {
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
  });
}

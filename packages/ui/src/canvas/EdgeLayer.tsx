// 接続線を SVG ベジェ曲線で描画する。
// ノード View と分離し、線だけを軽量に更新するために存在する。
// RELEVANT FILES: CanvasViewport.tsx, NodeView.tsx

import React, { useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';
import type { GraphEdge, GraphNode, NodeId } from '@csvmapper/contracts';

import { colors, layout } from '../theme/tokens';

export interface EdgeLayerProps {
  edges: readonly GraphEdge[];
  nodesById: ReadonlyMap<NodeId, GraphNode>;
  dragOffsets: ReadonlyMap<NodeId, { x: number; y: number }>;
  width: number;
  height: number;
  /** 接続ドラッグ中の一時ガイド（ワールド座標）。 */
  draft?: { fromX: number; fromY: number; toX: number; toY: number } | null;
}

function portCenters(
  node: GraphNode,
  offset: { x: number; y: number } | undefined,
): { inX: number; inY: number; outX: number; outY: number } {
  const x = node.position.x + (offset?.x ?? 0);
  const y = node.position.y + (offset?.y ?? 0);
  const midY = y + layout.nodeHeight / 2;
  return {
    inX: x,
    inY: midY,
    outX: x + layout.nodeWidth,
    outY: midY,
  };
}

function bezierPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export function EdgeLayer({
  edges,
  nodesById,
  dragOffsets,
  width,
  height,
  draft,
}: EdgeLayerProps) {
  const paths = useMemo(() => {
    return edges.flatMap(edge => {
      const from = nodesById.get(edge.from);
      const to = nodesById.get(edge.to);
      if (!from || !to) {
        return [];
      }
      const a = portCenters(from, dragOffsets.get(from.id));
      const b = portCenters(to, dragOffsets.get(to.id));
      return [
        {
          id: edge.id,
          d: bezierPath(a.outX, a.outY, b.inX, b.inY),
        },
      ];
    });
  }, [edges, nodesById, dragOffsets]);

  return (
    <Svg
      width={width}
      height={height}
      style={{ position: 'absolute', left: 0, top: 0 }}
      pointerEvents="none"
    >
      {paths.map(path => (
        <Path
          key={path.id}
          d={path.d}
          stroke={colors.edge}
          strokeWidth={2}
          fill="none"
        />
      ))}
      {draft ? (
        <Path
          d={bezierPath(draft.fromX, draft.fromY, draft.toX, draft.toY)}
          stroke={colors.accent}
          strokeWidth={2}
          strokeDasharray="6 4"
          fill="none"
        />
      ) : null}
    </Svg>
  );
}

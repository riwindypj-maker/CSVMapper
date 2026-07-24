// 接続線を SVG ベジェ曲線で描画する。
// ノード View と分離し、線だけを軽量に更新するために存在する。
// RELEVANT FILES: CanvasViewport.tsx, NodeView.tsx

import React, { useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';
import type { EdgeId, GraphEdge, GraphNode, NodeId } from '@csvmapper/contracts';

import { edgeAccessibilityLabel } from '../accessibility/labels';
import { colors, layout } from '../theme/tokens';

/** クリックしやすいよう見た目より太い当たり判定。 */
const EDGE_HIT_STROKE = 16;

export interface EdgeLayerProps {
  edges: readonly GraphEdge[];
  nodesById: ReadonlyMap<NodeId, GraphNode>;
  dragOffsets: ReadonlyMap<NodeId, { x: number; y: number }>;
  /** ワールド View 左上に対応するモデル座標。 */
  originX?: number;
  originY?: number;
  width: number;
  height: number;
  /** 接続ドラッグ中の一時ガイド（ワールド＝モデル座標）。 */
  draft?: { fromX: number; fromY: number; toX: number; toY: number } | null;
  selectedEdgeIds?: ReadonlySet<EdgeId>;
  editable?: boolean;
  onEdgePress?: (edgeId: EdgeId, additive: boolean) => void;
}

function portCenters(
  node: GraphNode,
  offset: { x: number; y: number } | undefined,
  originX: number,
  originY: number,
): { inX: number; inY: number; outX: number; outY: number } {
  const x = node.position.x + (offset?.x ?? 0) - originX;
  const y = node.position.y + (offset?.y ?? 0) - originY;
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

/** 接続ドラッグ中は狙いやすいよう曲線ではなく直線で結ぶ。 */
function straightPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

export function EdgeLayer({
  edges,
  nodesById,
  dragOffsets,
  originX = 0,
  originY = 0,
  width,
  height,
  draft,
  selectedEdgeIds,
  editable = false,
  onEdgePress,
}: EdgeLayerProps) {
  const paths = useMemo(() => {
    return edges.flatMap(edge => {
      const from = nodesById.get(edge.from);
      const to = nodesById.get(edge.to);
      if (!from || !to) {
        return [];
      }
      const a = portCenters(from, dragOffsets.get(from.id), originX, originY);
      const b = portCenters(to, dragOffsets.get(to.id), originX, originY);
      return [
        {
          id: edge.id,
          d: bezierPath(a.outX, a.outY, b.inX, b.inY),
          fromName: from.displayName,
          toName: to.displayName,
        },
      ];
    });
  }, [edges, nodesById, dragOffsets, originX, originY]);

  const draftLocal = draft
    ? {
        fromX: draft.fromX - originX,
        fromY: draft.fromY - originY,
        toX: draft.toX - originX,
        toY: draft.toY - originY,
      }
    : null;

  return (
    <Svg
      width={width}
      height={height}
      style={{ position: 'absolute', left: 0, top: 0 }}
      // 空領域は背景パンへ通し、線 Path だけがヒットする。
      pointerEvents="box-none"
    >
      {paths.map(path => {
        const selected = selectedEdgeIds?.has(path.id) ?? false;
        return (
          <React.Fragment key={path.id}>
            {editable && onEdgePress ? (
              <Path
                d={path.d}
                stroke="transparent"
                strokeWidth={EDGE_HIT_STROKE}
                fill="none"
                accessibilityLabel={edgeAccessibilityLabel({
                  fromName: path.fromName,
                  toName: path.toName,
                  selected,
                })}
                onPress={event => {
                  const native = event.nativeEvent as {
                    metaKey?: boolean;
                    ctrlKey?: boolean;
                  };
                  onEdgePress(
                    path.id,
                    !!(native.metaKey || native.ctrlKey),
                  );
                }}
              />
            ) : null}
            <Path
              d={path.d}
              stroke={selected ? colors.selection : colors.edge}
              strokeWidth={selected ? 3 : 2}
              fill="none"
              pointerEvents="none"
            />
          </React.Fragment>
        );
      })}
      {draftLocal ? (
        <Path
          d={straightPath(
            draftLocal.fromX,
            draftLocal.fromY,
            draftLocal.toX,
            draftLocal.toY,
          )}
          stroke={colors.accent}
          strokeWidth={2}
          strokeDasharray="6 4"
          fill="none"
          pointerEvents="none"
        />
      ) : null}
    </Svg>
  );
}

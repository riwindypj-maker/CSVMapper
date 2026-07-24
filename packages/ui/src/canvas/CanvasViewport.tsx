// マッピングキャンバスのビューポートと基本操作。
// 選択・移動・端子接続・ズーム表示を UI から扱うために存在する。
// RELEVANT FILES: NodeView.tsx, EdgeLayer.tsx, SelectionOverlay.tsx

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import type { MappingSession } from '@csvmapper/application';
import {
  GraphIssue,
  GraphNode,
  IssueSeverity,
  NodeId,
  NodeKind,
} from '@csvmapper/contracts';

import { labels } from '../accessibility/labels';
import { colors, layout } from '../theme/tokens';
import { EdgeLayer } from './EdgeLayer';
import { NodeView } from './NodeView';
import { SelectionOverlay } from './SelectionOverlay';

export interface CanvasViewportProps {
  session: MappingSession;
  nodes: readonly GraphNode[];
  edges: ReturnType<MappingSession['getEdges']>;
  issues: readonly GraphIssue[];
  selection: ReadonlySet<NodeId>;
  zoom: number;
  scrollX: number;
  scrollY: number;
  editable: boolean;
  keyboardFocusId: NodeId | null;
  connectSourceId: NodeId | null;
  onConnectSourceChange: (id: NodeId | null) => void;
  /** クリップ領域の実サイズ。全体表示の計算に使う。 */
  onViewportLayout?: (size: { width: number; height: number }) => void;
}

/**
 * RN 既定の中心原点でも screen = (world + scroll) * zoom になる world 用 transform。
 * transformOrigin は macos で無視され得るため使わず、中心原点の補正を数式に含める。
 */
export function buildWorldTransform(
  scrollX: number,
  scrollY: number,
  zoom: number,
  worldWidth: number,
  worldHeight: number,
): [
  { scale: number },
  { translateX: number },
  { translateY: number },
] {
  const originX = worldWidth / 2;
  const originY = worldHeight / 2;
  return [
    { scale: zoom },
    { translateX: zoom * scrollX + originX * (zoom - 1) },
    { translateY: zoom * scrollY + originY * (zoom - 1) },
  ];
}

function issueCountsFor(
  issues: readonly GraphIssue[],
  nodeId: NodeId,
): { errorCount: number; warningCount: number } {
  let errorCount = 0;
  let warningCount = 0;
  for (const issue of issues) {
    if (issue.nodeId !== nodeId) {
      continue;
    }
    if (issue.severity === IssueSeverity.Error) {
      errorCount += 1;
    } else {
      warningCount += 1;
    }
  }
  return { errorCount, warningCount };
}

export function CanvasViewport({
  session,
  nodes,
  edges,
  issues,
  selection,
  zoom,
  scrollX,
  scrollY,
  editable,
  keyboardFocusId,
  connectSourceId,
  onConnectSourceChange,
  onViewportLayout,
}: CanvasViewportProps) {
  const [dragOffsets, setDragOffsets] = useState<
    Map<NodeId, { x: number; y: number }>
  >(new Map());
  // Release は最終 setState と同ターンのため、クロージャの state は古くなり得る。
  const dragOffsetsRef = useRef(dragOffsets);
  dragOffsetsRef.current = dragOffsets;
  const [worldSize] = useState({ width: 2400, height: 1600 });

  const nodesById = useMemo(() => {
    const map = new Map<NodeId, GraphNode>();
    for (const node of nodes) {
      map.set(node.id, node);
    }
    return map;
  }, [nodes]);
  const nodesByIdRef = useRef(nodesById);
  nodesByIdRef.current = nodesById;

  const incoming = useMemo(() => {
    const set = new Set<NodeId>();
    for (const edge of edges) {
      set.add(edge.to);
    }
    return set;
  }, [edges]);

  const outgoing = useMemo(() => {
    const set = new Set<NodeId>();
    for (const edge of edges) {
      set.add(edge.from);
    }
    return set;
  }, [edges]);

  const clearDrag = useCallback(() => {
    setDragOffsets(new Map());
  }, []);

  const handleSelect = useCallback(
    (nodeId: NodeId, additive: boolean) => {
      if (!editable) {
        return;
      }
      if (additive) {
        const next = new Set(selection);
        if (next.has(nodeId)) {
          next.delete(nodeId);
        } else {
          next.add(nodeId);
        }
        session.setSelection([...next]);
        return;
      }
      session.setSelection([nodeId]);
    },
    [editable, selection, session],
  );

  const handleMoveDelta = useCallback(
    (nodeId: NodeId, dx: number, dy: number) => {
      if (!editable) {
        return;
      }
      setDragOffsets(prev => {
        const next = new Map(prev);
        const targets =
          selection.has(nodeId) && selection.size > 0
            ? [...selection]
            : [nodeId];
        for (const id of targets) {
          const cur = next.get(id) ?? { x: 0, y: 0 };
          next.set(id, { x: cur.x + dx, y: cur.y + dy });
        }
        return next;
      });
    },
    [editable, selection],
  );

  const handleMoveEnd = useCallback(() => {
    const offsets = dragOffsetsRef.current;
    if (offsets.size === 0) {
      return;
    }
    const positions = new Map<NodeId, { x: number; y: number }>();
    for (const [id, offset] of offsets) {
      const node = nodesByIdRef.current.get(id);
      if (!node) {
        continue;
      }
      positions.set(id, {
        x: Math.round(node.position.x + offset.x),
        y: Math.round(node.position.y + offset.y),
      });
    }
    clearDrag();
    if (positions.size > 0) {
      session.moveNodes(positions);
    }
  }, [clearDrag, session]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (!onViewportLayout) {
        return;
      }
      const { width, height } = event.nativeEvent.layout;
      if (width > 0 && height > 0) {
        onViewportLayout({ width, height });
      }
    },
    [onViewportLayout],
  );

  const handlePortPress = useCallback(
    (nodeId: NodeId, direction: 'input' | 'output') => {
      if (!editable) {
        return;
      }
      if (direction === 'output') {
        onConnectSourceChange(nodeId);
        return;
      }
      if (!connectSourceId || connectSourceId === nodeId) {
        onConnectSourceChange(null);
        return;
      }
      const edgeId = `e-${connectSourceId}-${nodeId}-${Date.now()}`;
      const result = session.addEdge(edgeId, connectSourceId, nodeId);
      if (!result.ok) {
        // 失敗時は下書き接続を残し、拒否理由を利用者へ伝える。
        Alert.alert(labels.connectRejectedTitle, result.message);
        return;
      }
      onConnectSourceChange(null);
    },
    [editable, connectSourceId, onConnectSourceChange, session],
  );

  const draft = useMemo(() => {
    if (!connectSourceId) {
      return null;
    }
    const from = nodesById.get(connectSourceId);
    if (!from) {
      return null;
    }
    const offset = dragOffsets.get(from.id);
    const x = from.position.x + (offset?.x ?? 0) + layout.nodeWidth;
    const y = from.position.y + (offset?.y ?? 0) + layout.nodeHeight / 2;
    return { fromX: x, fromY: y, toX: x + 80, toY: y };
  }, [connectSourceId, nodesById, dragOffsets]);

  return (
    <View
      style={styles.clip}
      accessibilityLabel={labels.canvas}
      onLayout={handleLayout}
    >
      <Pressable
        style={styles.backdrop}
        onPress={() => {
          if (!editable) {
            return;
          }
          session.setSelection([]);
          onConnectSourceChange(null);
          clearDrag();
        }}
      />
      <View
        style={[
          styles.world,
          {
            width: worldSize.width,
            height: worldSize.height,
            transform: buildWorldTransform(
              scrollX,
              scrollY,
              zoom,
              worldSize.width,
              worldSize.height,
            ),
          },
        ]}
      >
        <EdgeLayer
          edges={edges}
          nodesById={nodesById}
          dragOffsets={dragOffsets}
          width={worldSize.width}
          height={worldSize.height}
          draft={draft}
        />
        <SelectionOverlay rect={null} />
        {nodes.map(node => {
          const counts = issueCountsFor(issues, node.id);
          const isConnectSource = connectSourceId === node.id;
          return (
            <NodeView
              key={node.id}
              node={node}
              selected={selection.has(node.id) || isConnectSource}
              focused={keyboardFocusId === node.id}
              errorCount={counts.errorCount}
              warningCount={counts.warningCount}
              incomingConnected={incoming.has(node.id)}
              outgoingConnected={outgoing.has(node.id)}
              inputConnectable={
                editable &&
                node.kind !== NodeKind.Input &&
                !!connectSourceId
              }
              outputConnectable={editable && node.kind !== NodeKind.Output}
              dragOffset={dragOffsets.get(node.id)}
              zoom={zoom}
              onSelect={additive => handleSelect(node.id, additive)}
              onMoveDelta={(dx, dy) => handleMoveDelta(node.id, dx, dy)}
              onMoveEnd={handleMoveEnd}
              onPortPress={direction => handlePortPress(node.id, direction)}
            />
          );
        })}
      </View>
    </View>
  );
}

/** Escape などで一時操作を取り消す。 */
export function cancelCanvasTransient(
  clearConnect: () => void,
  clearDrag: () => void,
): void {
  clearConnect();
  clearDrag();
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  clip: {
    backgroundColor: colors.surfaceAlt,
    flex: 1,
    minWidth: layout.canvasMinWidth,
    overflow: 'hidden',
  },
  world: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});

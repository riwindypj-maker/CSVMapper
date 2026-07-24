// マッピングキャンバスのビューポートと基本操作。
// 選択・移動・端子接続・ズーム・スクロール表示を UI から扱うために存在する。
// RELEVANT FILES: NodeView.tsx, EdgeLayer.tsx, CanvasScrollbars.tsx, canvasScroll.ts

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import type { MappingSession } from '@csvmapper/application';
import {
  EdgeId,
  GraphIssue,
  GraphNode,
  IssueSeverity,
  NodeId,
  NodeKind,
} from '@csvmapper/contracts';

import { labels } from '../accessibility/labels';
import { colors, layout } from '../theme/tokens';
import { CanvasScrollbars } from './CanvasScrollbars';
import {
  computeCanvasScrollMetrics,
  scrollDeltaFromPan,
  scrollFromOffsets,
} from './canvasScroll';
import { EdgeLayer } from './EdgeLayer';
import { NodeView } from './NodeView';
import { SelectionOverlay } from './SelectionOverlay';

/** 仕様: ノード外接矩形へ足す作業余白（logical pixel）。 */
export const WORLD_CONTENT_PAD = 400;

/** ノード未配置時の最小ワールド。 */
const MIN_WORLD_WIDTH = 800;
const MIN_WORLD_HEIGHT = 600;

/** onLayout 前のフォールバック表示サイズ。 */
const DEFAULT_VIEWPORT = { width: 800, height: 500 } as const;

/** 背景パン開始とみなす最小移動（画面ピクセル）。 */
const PAN_THRESHOLD = 3;

/** ドロップ判定を端子見た目より少し広げた半径（model 座標）。 */
export const PORT_HIT_RADIUS = layout.portSize;

export interface CanvasViewportProps {
  session: MappingSession;
  nodes: readonly GraphNode[];
  edges: ReturnType<MappingSession['getEdges']>;
  issues: readonly GraphIssue[];
  selection: ReadonlySet<NodeId>;
  edgeSelection: ReadonlySet<EdgeId>;
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

export interface WorldBounds {
  /** ワールド View 左上に対応するモデル座標。 */
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/**
 * 配置ノードの外接矩形 + 余白から描画ワールドを決める。
 * 固定サイズだと境界外でノードと線が消えるため、コンテンツに追従する。
 */
export function computeWorldBounds(
  nodes: readonly GraphNode[],
  dragOffsets: ReadonlyMap<NodeId, { x: number; y: number }>,
): WorldBounds {
  if (nodes.length === 0) {
    return {
      originX: 0,
      originY: 0,
      width: MIN_WORLD_WIDTH,
      height: MIN_WORLD_HEIGHT,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const offset = dragOffsets.get(node.id);
    const x = node.position.x + (offset?.x ?? 0);
    const y = node.position.y + (offset?.y ?? 0);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + layout.nodeWidth);
    maxY = Math.max(maxY, y + layout.nodeHeight);
  }

  const originX = Math.floor(minX - WORLD_CONTENT_PAD);
  const originY = Math.floor(minY - WORLD_CONTENT_PAD);
  return {
    originX,
    originY,
    width: Math.max(
      MIN_WORLD_WIDTH,
      Math.ceil(maxX + WORLD_CONTENT_PAD - originX),
    ),
    height: Math.max(
      MIN_WORLD_HEIGHT,
      Math.ceil(maxY + WORLD_CONTENT_PAD - originY),
    ),
  };
}

/**
 * screen = (world + scroll) * zoom を左上原点の scale で実現する。
 * 呼び出し側は寸法 0 の親に載せて中心原点補正を無効化する。
 */
export function buildWorldTransform(
  scrollX: number,
  scrollY: number,
  zoom: number,
): [{ scale: number }, { translateX: number }, { translateY: number }] {
  return [
    { scale: zoom },
    { translateX: zoom * scrollX },
    { translateY: zoom * scrollY },
  ];
}

/**
 * ビューポート左上基準の page 座標をモデル座標へ変換する。
 * buildWorldTransform の逆変換（screenOffset = zoom * (model + scroll)）。
 */
export function pageToModel(
  pageX: number,
  pageY: number,
  viewportPageX: number,
  viewportPageY: number,
  scrollX: number,
  scrollY: number,
  zoom: number,
): { x: number; y: number } {
  const scale = zoom || 1;
  return {
    x: (pageX - viewportPageX) / scale - scrollX,
    y: (pageY - viewportPageY) / scale - scrollY,
  };
}

type MeasureInWindowFn = (callback: (x: number, y: number) => void) => void;

/**
 * ビューポートの window 原点を測ってから onReady する。
 * measure 不能時のみ fallback（レイアウトで得た最後の既知原点）を使う。
 */
export function resolveViewportPageOrigin(
  measureInWindow: MeasureInWindowFn | null | undefined,
  fallback: { x: number; y: number },
  onReady: (origin: { x: number; y: number }) => void,
): void {
  if (!measureInWindow) {
    onReady(fallback);
    return;
  }
  measureInWindow((x, y) => {
    onReady({ x, y });
  });
}

/**
 * モデル座標が入力端子のヒット領域に入るノードを返す。
 * 複数該当時は中心に最も近いものを選ぶ。
 */
export function hitTestInputPort(
  modelX: number,
  modelY: number,
  nodes: readonly GraphNode[],
  dragOffsets: ReadonlyMap<NodeId, { x: number; y: number }>,
  connectSourceId: NodeId | null,
  hitRadius: number = PORT_HIT_RADIUS,
): NodeId | null {
  if (!connectSourceId) {
    return null;
  }
  let bestId: NodeId | null = null;
  let bestDist = Infinity;
  const radiusSq = hitRadius * hitRadius;
  for (const node of nodes) {
    if (node.kind === NodeKind.Input || node.id === connectSourceId) {
      continue;
    }
    const offset = dragOffsets.get(node.id);
    const cx = node.position.x + (offset?.x ?? 0);
    const cy = node.position.y + (offset?.y ?? 0) + layout.nodeHeight / 2;
    const dx = modelX - cx;
    const dy = modelY - cy;
    const distSq = dx * dx + dy * dy;
    if (distSq <= radiusSq && distSq < bestDist) {
      bestDist = distSq;
      bestId = node.id;
    }
  }
  return bestId;
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
  edgeSelection,
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
  const [viewportSize, setViewportSize] = useState<{
    width: number;
    height: number;
  }>(DEFAULT_VIEWPORT);
  // 接続ドラッグ中の仮線先端（モデル座標）。null のときは接続元だけ確定した段階。
  const [draftPointer, setDraftPointer] = useState<{
    x: number;
    y: number;
  } | null>(null);
  // Release は最終 setState と同ターンのため、クロージャの state は古くなり得る。
  const dragOffsetsRef = useRef(dragOffsets);
  dragOffsetsRef.current = dragOffsets;

  const clipRef = useRef<View>(null);
  const viewportPageRef = useRef({ x: 0, y: 0 });
  const connectSourceIdRef = useRef(connectSourceId);
  connectSourceIdRef.current = connectSourceId;
  const scrollZoomRef = useRef({ scrollX, scrollY, zoom });
  scrollZoomRef.current = { scrollX, scrollY, zoom };

  // Escape など親側で接続元が消えたときは仮線先端も捨てる。
  useEffect(() => {
    if (!connectSourceId) {
      setDraftPointer(null);
    }
  }, [connectSourceId]);

  const worldBounds = useMemo(
    () => computeWorldBounds(nodes, dragOffsets),
    [nodes, dragOffsets],
  );

  const scrollMetrics = useMemo(
    () =>
      computeCanvasScrollMetrics(
        worldBounds,
        zoom,
        viewportSize.width,
        viewportSize.height,
        scrollX,
        scrollY,
      ),
    [worldBounds, zoom, viewportSize.width, viewportSize.height, scrollX, scrollY],
  );

  const nodesById = useMemo(() => {
    const map = new Map<NodeId, GraphNode>();
    for (const node of nodes) {
      map.set(node.id, node);
    }
    return map;
  }, [nodes]);
  const nodesByIdRef = useRef(nodesById);
  nodesByIdRef.current = nodesById;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

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

  const clearConnectDraft = useCallback(() => {
    setDraftPointer(null);
    onConnectSourceChange(null);
  }, [onConnectSourceChange]);

  const refreshViewportPage = useCallback((onReady?: () => void) => {
    resolveViewportPageOrigin(
      clipRef.current?.measureInWindow?.bind(clipRef.current),
      viewportPageRef.current,
      origin => {
        viewportPageRef.current = origin;
        onReady?.();
      },
    );
  }, []);

  const pointerToModel = useCallback((pageX: number, pageY: number) => {
    const { scrollX: sx, scrollY: sy, zoom: z } = scrollZoomRef.current;
    const vp = viewportPageRef.current;
    return pageToModel(pageX, pageY, vp.x, vp.y, sx, sy, z);
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

  const handleEdgeSelect = useCallback(
    (edgeId: EdgeId, additive: boolean) => {
      if (!editable) {
        return;
      }
      if (additive) {
        const next = new Set(edgeSelection);
        if (next.has(edgeId)) {
          next.delete(edgeId);
        } else {
          next.add(edgeId);
        }
        session.setEdgeSelection([...next]);
        return;
      }
      session.setEdgeSelection([edgeId]);
      clearConnectDraft();
    },
    [editable, edgeSelection, clearConnectDraft, session],
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
      const { width, height } = event.nativeEvent.layout;
      if (width <= 0 || height <= 0) {
        return;
      }
      setViewportSize({ width, height });
      onViewportLayout?.({ width, height });
      refreshViewportPage();
    },
    [onViewportLayout, refreshViewportPage],
  );

  const handleScrollOffsets = useCallback(
    (offsetX: number, offsetY: number) => {
      const next = scrollFromOffsets(worldBounds, zoom, offsetX, offsetY);
      session.setScroll(next.scrollX, next.scrollY);
    },
    [session, worldBounds, zoom],
  );

  const tryAddEdge = useCallback(
    (fromId: NodeId, toId: NodeId, clearOnFailure: boolean): boolean => {
      const edgeId = `e-${fromId}-${toId}-${Date.now()}`;
      const result = session.addEdge(edgeId, fromId, toId);
      if (!result.ok) {
        Alert.alert(labels.connectRejectedTitle, result.message);
        if (clearOnFailure) {
          clearConnectDraft();
        }
        return false;
      }
      clearConnectDraft();
      return true;
    },
    [session, clearConnectDraft],
  );

  const handlePortPress = useCallback(
    (nodeId: NodeId, direction: 'input' | 'output') => {
      if (!editable) {
        return;
      }
      if (direction === 'output') {
        setDraftPointer(null);
        onConnectSourceChange(nodeId);
        return;
      }
      if (!connectSourceId || connectSourceId === nodeId) {
        clearConnectDraft();
        return;
      }
      // キーボード経路は別端子を選び直せるよう、失敗時は下書きを残す。
      tryAddEdge(connectSourceId, nodeId, false);
    },
    [editable, connectSourceId, onConnectSourceChange, clearConnectDraft, tryAddEdge],
  );

  const handlePortDragStart = useCallback(
    (nodeId: NodeId, direction: 'input' | 'output') => {
      if (!editable || direction !== 'output') {
        return;
      }
      // ドラッグ中の page→model 用に原点を先に確定する。
      refreshViewportPage();
      onConnectSourceChange(nodeId);
    },
    [editable, onConnectSourceChange, refreshViewportPage],
  );

  const handlePortDragMove = useCallback(
    (pageX: number, pageY: number) => {
      // move は高頻度のためキャッシュ原点を使う（start/layout/end で更新）。
      setDraftPointer(pointerToModel(pageX, pageY));
    },
    [pointerToModel],
  );

  const handlePortDragEnd = useCallback(
    (pageX: number, pageY: number) => {
      if (!editable) {
        clearConnectDraft();
        return;
      }
      // ドロップ判定は最新の viewport 原点で行う（start の非同期 measure 完了前でも落とさない）。
      resolveViewportPageOrigin(
        clipRef.current?.measureInWindow?.bind(clipRef.current),
        viewportPageRef.current,
        origin => {
          viewportPageRef.current = origin;
          const fromId = connectSourceIdRef.current;
          const { scrollX: sx, scrollY: sy, zoom: z } = scrollZoomRef.current;
          const model = pageToModel(pageX, pageY, origin.x, origin.y, sx, sy, z);
          const targetId = hitTestInputPort(
            model.x,
            model.y,
            nodesRef.current,
            dragOffsetsRef.current,
            fromId,
          );
          if (!fromId || !targetId) {
            clearConnectDraft();
            return;
          }
          // ドラッグはジェスチャ完了済みのため、失敗しても下書きを残さない。
          tryAddEdge(fromId, targetId, true);
        },
      );
    },
    [editable, clearConnectDraft, tryAddEdge],
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
    if (draftPointer) {
      return { fromX: x, fromY: y, toX: draftPointer.x, toY: draftPointer.y };
    }
    // キーボードで接続元だけ確定したときは短いガイドを出す。
    return { fromX: x, fromY: y, toX: x + 80, toY: y };
  }, [connectSourceId, nodesById, dragOffsets, draftPointer]);

  // 背景ドラッグでパン。クリックのみなら選択解除。
  const panStateRef = useRef({
    lastX: 0,
    lastY: 0,
    moved: false,
    scrollX,
    scrollY,
    zoom,
    editable,
  });
  panStateRef.current.scrollX = scrollX;
  panStateRef.current.scrollY = scrollY;
  panStateRef.current.zoom = zoom;
  panStateRef.current.editable = editable;

  const backdropPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, gesture) =>
          Math.abs(gesture.dx) + Math.abs(gesture.dy) > PAN_THRESHOLD,
        onPanResponderGrant: (event: GestureResponderEvent) => {
          panStateRef.current.moved = false;
          panStateRef.current.lastX = event.nativeEvent.pageX;
          panStateRef.current.lastY = event.nativeEvent.pageY;
        },
        onPanResponderMove: (event: GestureResponderEvent) => {
          const state = panStateRef.current;
          const pageX = event.nativeEvent.pageX;
          const pageY = event.nativeEvent.pageY;
          const dx = pageX - state.lastX;
          const dy = pageY - state.lastY;
          if (Math.abs(dx) + Math.abs(dy) <= 0) {
            return;
          }
          state.moved = true;
          state.lastX = pageX;
          state.lastY = pageY;
          const delta = scrollDeltaFromPan(dx, dy, state.zoom);
          const nextX = state.scrollX + delta.dScrollX;
          const nextY = state.scrollY + delta.dScrollY;
          state.scrollX = nextX;
          state.scrollY = nextY;
          session.setScroll(nextX, nextY);
        },
        onPanResponderRelease: () => {
          const state = panStateRef.current;
          if (state.moved || !state.editable) {
            return;
          }
          session.setSelection([]);
          clearConnectDraft();
          clearDrag();
        },
      }),
    [session, clearConnectDraft, clearDrag],
  );

  // モデル座標 → ワールド View 内ローカル座標。負座標も描画できるようにする。
  const originX = worldBounds.originX;
  const originY = worldBounds.originY;

  return (
    <View
      ref={clipRef}
      style={styles.clip}
      accessibilityLabel={labels.canvas}
      onLayout={handleLayout}
    >
      <View style={styles.backdrop} {...backdropPan.panHandlers} />
      {/*
        幅高 0 の親に transform を載せると、中心原点でも原点が (0,0) になり
        transformOrigin 非対応環境でも左上基準の scale と同じになる。
      */}
      <View
        style={[
          styles.worldTransform,
          {
            transform: buildWorldTransform(
              scrollX + originX,
              scrollY + originY,
              zoom,
            ),
          },
        ]}
        pointerEvents="box-none"
      >
        <View
          style={[
            styles.world,
            {
              width: worldBounds.width,
              height: worldBounds.height,
            },
          ]}
          pointerEvents="box-none"
        >
          <EdgeLayer
            edges={edges}
            nodesById={nodesById}
            dragOffsets={dragOffsets}
            originX={originX}
            originY={originY}
            width={worldBounds.width}
            height={worldBounds.height}
            draft={draft}
            selectedEdgeIds={edgeSelection}
            editable={editable}
            onEdgePress={handleEdgeSelect}
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
                originX={originX}
                originY={originY}
                zoom={zoom}
                onSelect={additive => handleSelect(node.id, additive)}
                onMoveDelta={(dx, dy) => handleMoveDelta(node.id, dx, dy)}
                onMoveEnd={handleMoveEnd}
                onPortPress={direction => handlePortPress(node.id, direction)}
                onPortDragStart={direction =>
                  handlePortDragStart(node.id, direction)
                }
                onPortDragMove={handlePortDragMove}
                onPortDragEnd={handlePortDragEnd}
              />
            );
          })}
        </View>
      </View>
      <CanvasScrollbars
        metrics={scrollMetrics}
        onOffsetChange={handleScrollOffsets}
      />
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
    left: 0,
    position: 'absolute',
    top: 0,
  },
  worldTransform: {
    height: 0,
    left: 0,
    // 子のワールドを 0x0 親の外へ描く。hidden だと全部消える。
    overflow: 'visible',
    position: 'absolute',
    top: 0,
    width: 0,
  },
});

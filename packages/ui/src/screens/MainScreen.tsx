// SCR-001 メイン画面シェル。
// ツールバー・左右ペイン・キャンバス・プレビューを接続するために存在する。
// RELEVANT FILES: ../components/Toolbar.tsx, ../canvas/CanvasViewport.tsx, ../hooks/useMappingSession.ts

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  MappingSession,
  MAX_ZOOM,
  MIN_ZOOM,
} from '@csvmapper/application';
import {
  BlockInfo,
  GraphNode,
  InputColumn,
  NodeId,
  NodeKind,
} from '@csvmapper/contracts';

import { labels } from '../accessibility/labels';
import { CanvasViewport } from '../canvas/CanvasViewport';
import { BlockToolbox } from '../components/BlockToolbox';
import { InputColumnList } from '../components/InputColumnList';
import { OutputColumnList } from '../components/OutputColumnList';
import { PreviewShell } from '../components/PreviewShell';
import { PropertyPanel } from '../components/PropertyPanel';
import { Toolbar } from '../components/Toolbar';
import { useMappingSession } from '../hooks/useMappingSession';
import {
  FocusRegion,
  FocusRegionProvider,
  useFocusRegions,
} from '../keyboard/FocusRegions';
import {
  resolveShortcut,
  type ShortcutEvent,
} from '../keyboard/shortcuts';
import { colors, layout, spacing, typography } from '../theme/tokens';

/** テスト用にキーハンドラをセッションへ紐付ける。 */
const keyHandlers = new WeakMap<
  MappingSession,
  (event: ShortcutEvent) => void
>();

/** デモ用のモック入力列（TurboModule 前の代替）。 */
const MOCK_INPUT_COLUMNS: readonly InputColumn[] = [
  { id: 'col-name', displayName: '名前' },
  { id: 'col-email', displayName: 'メール' },
  { id: 'col-city', displayName: '市区町村' },
  { id: 'col-note', displayName: '備考' },
];

const MOCK_SAMPLES = new Map<string, string>([
  ['col-name', '山田太郎'],
  ['col-email', 'yamada@example.com'],
  ['col-city', '横浜市'],
  ['col-note', '  メモ  '],
]);

/** onLayout 前のフォールバック表示サイズ。 */
const DEFAULT_VIEWPORT = { width: 800, height: 500 } as const;

/** 全体表示時に外接矩形へ足す画面余白（logical pixel）。 */
const FIT_PAD_SCREEN = 40;

export interface MainScreenProps {
  session: MappingSession;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

/**
 * CanvasViewport の world 変換（screen = (world + scroll) * zoom）に合わせた全体表示。
 * ノード外接矩形の中心をビューポート中央へ置く。
 */
export function computeFitAllView(
  nodes: readonly { position: { x: number; y: number } }[],
  viewW: number,
  viewH: number,
): { zoom: number; scrollX: number; scrollY: number } {
  if (nodes.length === 0) {
    return { zoom: 1, scrollX: 0, scrollY: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + layout.nodeWidth);
    maxY = Math.max(maxY, node.position.y + layout.nodeHeight);
  }
  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);
  const availableW = Math.max(1, viewW - FIT_PAD_SCREEN * 2);
  const availableH = Math.max(1, viewH - FIT_PAD_SCREEN * 2);
  const zoom = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, Math.min(availableW / contentW, availableH / contentH)),
  );
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    zoom,
    scrollX: Math.round(viewW / (2 * zoom) - cx),
    scrollY: Math.round(viewH / (2 * zoom) - cy),
  };
}

function MainScreenBody({ session }: MainScreenProps) {
  const snapshot = useMappingSession(session);
  const editable = snapshot.phase === 'editable';
  const { activeRegion, setActiveRegion, focusNextRegion, focusPreviousRegion } =
    useFocusRegions();

  const [previewRowCount, setPreviewRowCount] = useState(100);
  const [previewStale, setPreviewStale] = useState(true);
  const [keyboardFocusId, setKeyboardFocusId] = useState<NodeId | null>(null);
  const [connectSourceId, setConnectSourceId] = useState<NodeId | null>(null);
  const [viewportSize, setViewportSize] = useState<{
    width: number;
    height: number;
  }>(DEFAULT_VIEWPORT);

  useEffect(() => {
    const requested = session.consumeFocusRequest();
    if (requested) {
      setKeyboardFocusId(requested);
      setActiveRegion('canvas');
    }
  }, [session, snapshot.revision, setActiveRegion]);

  useEffect(() => {
    if (snapshot.revision > 1 && editable) {
      setPreviewStale(true);
    }
  }, [snapshot.revision, editable]);

  const placedColumnIds = useMemo(() => {
    const set = new Set<string>();
    for (const node of snapshot.nodes) {
      if (node.kind === NodeKind.Input && node.inputColumnId) {
        set.add(node.inputColumnId);
      }
    }
    return set;
  }, [snapshot.nodes]);

  const outputNodes = useMemo(() => {
    const byId = new Map(snapshot.nodes.map(n => [n.id, n]));
    return snapshot.outputOrder
      .map(id => byId.get(id))
      .filter((n): n is GraphNode => !!n);
  }, [snapshot.nodes, snapshot.outputOrder]);

  const selectedNodes = useMemo(
    () => snapshot.nodes.filter(n => snapshot.ui.selection.has(n.id)),
    [snapshot.nodes, snapshot.ui.selection],
  );

  const applyCsvReload = useCallback(() => {
    session.replaceInputColumns(MOCK_INPUT_COLUMNS);
    setPreviewStale(true);
    setConnectSourceId(null);
    setKeyboardFocusId(null);
  }, [session]);

  const handleSelectCsv = useCallback(() => {
    // 編集可能中の再読込はマッピングと履歴を破棄するため確認する。
    if (editable) {
      Alert.alert(
        labels.reloadCsvConfirmTitle,
        labels.reloadCsvConfirmMessage,
        [
          { text: labels.cancel, style: 'cancel' },
          {
            text: labels.confirmReload,
            style: 'destructive',
            onPress: applyCsvReload,
          },
        ],
      );
      return;
    }
    applyCsvReload();
  }, [editable, applyCsvReload]);

  const applyReset = useCallback(() => {
    session.resetSession();
    setPreviewStale(true);
    setConnectSourceId(null);
    setKeyboardFocusId(null);
  }, [session]);

  const handleReset = useCallback(() => {
    if (!editable) {
      return;
    }
    // 初期化は入力 CSV を含むセッション全体を破棄するため確認する。
    Alert.alert(labels.resetConfirmTitle, labels.resetConfirmMessage, [
      { text: labels.cancel, style: 'cancel' },
      {
        text: labels.confirmReset,
        style: 'destructive',
        onPress: applyReset,
      },
    ]);
  }, [editable, applyReset]);

  const handlePlaceColumn = useCallback(
    (column: InputColumn) => {
      if (!editable) {
        return;
      }
      const id = nextId('in');
      const result = session.addInputNode(id, column.id, {
        x: 40 + snapshot.nodes.length * 24,
        y: 40 + snapshot.nodes.length * 16,
      });
      if (result.ok) {
        session.setSelection([id]);
        setKeyboardFocusId(id);
      }
    },
    [editable, session, snapshot.nodes.length],
  );

  const handleAddBlock = useCallback(
    (label: string, block: BlockInfo) => {
      if (!editable) {
        return;
      }
      const id = nextId('blk');
      const result = session.addBlockNode(
        id,
        label,
        {
          x: 220 + snapshot.nodes.length * 20,
          y: 80 + snapshot.nodes.length * 18,
        },
        block,
      );
      if (result.ok) {
        session.setSelection([id]);
        setKeyboardFocusId(id);
      }
    },
    [editable, session, snapshot.nodes.length],
  );

  const handleAddOutput = useCallback(() => {
    if (!editable) {
      return;
    }
    const id = nextId('out');
    const result = session.addOutputNode(id, `出力${outputNodes.length + 1}`, {
      x: 480,
      y: 60 + outputNodes.length * 72,
    });
    if (result.ok) {
      session.setSelection([id]);
      setKeyboardFocusId(id);
    }
  }, [editable, session, outputNodes.length]);

  const reorderOutput = useCallback(
    (id: NodeId, direction: -1 | 1) => {
      const order = [...snapshot.outputOrder];
      const index = order.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= order.length) {
        return;
      }
      const swap = order[index];
      order[index] = order[target];
      order[target] = swap;
      session.setOutputOrder(order);
    },
    [session, snapshot.outputOrder],
  );

  const fitAll = useCallback(() => {
    const next = computeFitAllView(
      snapshot.nodes,
      viewportSize.width,
      viewportSize.height,
    );
    session.setZoom(next.zoom);
    session.setScroll(next.scrollX, next.scrollY);
  }, [session, snapshot.nodes, viewportSize.height, viewportSize.width]);

  const deleteSelection = useCallback(() => {
    if (!editable) {
      return;
    }
    const ids = [...snapshot.ui.selection];
    if (ids.length === 0) {
      return;
    }
    session.removeNodes(ids);
    setConnectSourceId(null);
  }, [editable, session, snapshot.ui.selection]);

  const moveKeyboardFocus = useCallback(
    (dx: number, dy: number) => {
      if (snapshot.nodes.length === 0) {
        return;
      }
      const current =
        snapshot.nodes.find(n => n.id === keyboardFocusId) ?? snapshot.nodes[0];
      let best: GraphNode | null = null;
      let bestScore = Infinity;
      for (const node of snapshot.nodes) {
        if (node.id === current.id) {
          continue;
        }
        const ox = node.position.x - current.position.x;
        const oy = node.position.y - current.position.y;
        if (dx !== 0 && Math.sign(ox) !== dx) {
          continue;
        }
        if (dy !== 0 && Math.sign(oy) !== dy) {
          continue;
        }
        const score = Math.abs(ox) + Math.abs(oy);
        if (score < bestScore) {
          bestScore = score;
          best = node;
        }
      }
      if (best) {
        setKeyboardFocusId(best.id);
        session.setSelection([best.id]);
      }
    },
    [snapshot.nodes, keyboardFocusId, session],
  );

  const applyShortcut = useCallback(
    (action: ReturnType<typeof resolveShortcut>) => {
      if (!action) {
        return;
      }
      switch (action) {
        case 'undo':
          if (editable) {
            session.undo();
          }
          break;
        case 'redo':
          if (editable) {
            session.redo();
          }
          break;
        case 'selectAll':
          if (editable) {
            session.setSelection(snapshot.nodes.map(n => n.id));
          }
          break;
        case 'focusSearch':
          setActiveRegion('left');
          break;
        case 'delete':
          deleteSelection();
          break;
        case 'zoomIn':
          if (editable) {
            session.setZoom(snapshot.ui.zoom * 1.1);
          }
          break;
        case 'zoomOut':
          if (editable) {
            session.setZoom(snapshot.ui.zoom / 1.1);
          }
          break;
        case 'fitAll':
          if (editable) {
            fitAll();
          }
          break;
        case 'escape':
          setConnectSourceId(null);
          session.setSelection([]);
          break;
        default:
          break;
      }
    },
    [
      editable,
      session,
      snapshot.nodes,
      snapshot.ui.zoom,
      deleteSelection,
      fitAll,
      setActiveRegion,
    ],
  );

  const onKeyCommand = useCallback(
    (event: ShortcutEvent & { key: string }) => {
      if (event.key === 'Tab') {
        if (event.shiftKey) {
          focusPreviousRegion();
        } else {
          focusNextRegion();
        }
        return;
      }
      if (activeRegion === 'canvas') {
        if (event.key === 'ArrowLeft') {
          moveKeyboardFocus(-1, 0);
          return;
        }
        if (event.key === 'ArrowRight') {
          moveKeyboardFocus(1, 0);
          return;
        }
        if (event.key === 'ArrowUp') {
          moveKeyboardFocus(0, -1);
          return;
        }
        if (event.key === 'ArrowDown') {
          moveKeyboardFocus(0, 1);
          return;
        }
        if (event.key === 'Enter' && keyboardFocusId) {
          session.setSelection([keyboardFocusId]);
          return;
        }
      }
      applyShortcut(resolveShortcut(event));
    },
    [
      activeRegion,
      focusNextRegion,
      focusPreviousRegion,
      moveKeyboardFocus,
      keyboardFocusId,
      session,
      applyShortcut,
    ],
  );

  useEffect(() => {
    keyHandlers.set(session, onKeyCommand);
    return () => {
      keyHandlers.delete(session);
    };
  }, [session, onKeyCommand]);

  const rootProps = {
    style: styles.root,
    accessibilityLabel: labels.mainScreen,
    // react-native-macos はフォーカス可能な View にだけキーイベントを渡す。
    focusable: true,
    onKeyDown: (event: {
      nativeEvent: {
        key: string;
        metaKey?: boolean;
        ctrlKey?: boolean;
        shiftKey?: boolean;
      };
    }) => {
      onKeyCommand({
        key: event.nativeEvent.key,
        metaKey: !!event.nativeEvent.metaKey,
        ctrlKey: !!event.nativeEvent.ctrlKey,
        shiftKey: !!event.nativeEvent.shiftKey,
      });
    },
  };

  return (
    <View {...(rootProps as React.ComponentProps<typeof View>)}>
      <FocusRegion id="toolbar" accessibilityLabel={labels.toolbar} style={styles.toolbar}>
        <Toolbar
          editable={editable}
          canUndo={snapshot.canUndo}
          canRedo={snapshot.canRedo}
          errorCount={snapshot.errorCount}
          onSelectCsv={handleSelectCsv}
          onReset={handleReset}
          onUndo={() => session.undo()}
          onRedo={() => session.redo()}
          onAutoLayout={() => session.autoLayout()}
          onZoomIn={() => session.setZoom(snapshot.ui.zoom * 1.1)}
          onZoomOut={() => session.setZoom(snapshot.ui.zoom / 1.1)}
          onFitAll={fitAll}
        />
      </FocusRegion>

      <View style={styles.middle}>
        <FocusRegion id="left" accessibilityLabel={labels.leftPane} style={styles.left}>
          {!editable ? (
            <Text style={styles.hint}>{labels.unloadedHint}</Text>
          ) : null}
          <InputColumnList
            columns={snapshot.inputColumns}
            searchQuery={snapshot.ui.searchQuery}
            editable={editable}
            placedColumnIds={placedColumnIds}
            onSearchChange={query => session.setSearchQuery(query)}
            onPlaceColumn={handlePlaceColumn}
          />
          <View style={styles.leftDivider} />
          <BlockToolbox editable={editable} onAddBlock={handleAddBlock} />
        </FocusRegion>

        <FocusRegion id="canvas" accessibilityLabel={labels.canvas} style={styles.center}>
          <CanvasViewport
            session={session}
            nodes={snapshot.nodes}
            edges={snapshot.edges}
            issues={snapshot.issues}
            selection={snapshot.ui.selection}
            zoom={snapshot.ui.zoom}
            scrollX={snapshot.ui.scrollX}
            scrollY={snapshot.ui.scrollY}
            editable={editable}
            keyboardFocusId={keyboardFocusId}
            connectSourceId={connectSourceId}
            onConnectSourceChange={setConnectSourceId}
            onViewportLayout={setViewportSize}
          />
        </FocusRegion>

        <FocusRegion id="right" accessibilityLabel={labels.rightPane} style={styles.right}>
          <OutputColumnList
            outputs={outputNodes}
            selectedIds={snapshot.ui.selection}
            editable={editable}
            onAddOutput={handleAddOutput}
            onSelect={id => session.setSelection([id])}
            onMoveUp={id => reorderOutput(id, -1)}
            onMoveDown={id => reorderOutput(id, 1)}
          />
          <PropertyPanel
            selectedNodes={selectedNodes}
            editable={editable}
            inputSamples={MOCK_SAMPLES}
            onChangeOutputName={(id, name) => session.setOutputName(id, name)}
            onChangeBlockConfig={(id, block) => session.setBlockConfig(id, block)}
          />
        </FocusRegion>
      </View>

      <FocusRegion id="preview" accessibilityLabel={labels.preview} style={styles.preview}>
        <PreviewShell
          editable={editable}
          rowCount={previewRowCount}
          stale={previewStale}
          onChangeRowCount={setPreviewRowCount}
        />
      </FocusRegion>
    </View>
  );
}

export function MainScreen({ session }: MainScreenProps) {
  return (
    <FocusRegionProvider>
      <MainScreenBody session={session} />
    </FocusRegionProvider>
  );
}

/** 単体テストからショートカット適用を検証するためのヘルパー。 */
export function dispatchUiShortcut(
  session: MappingSession,
  event: ShortcutEvent,
): void {
  keyHandlers.get(session)?.(event);
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    minWidth: layout.canvasMinWidth,
  },
  hint: {
    color: colors.textMuted,
    fontSize: typography.small,
    marginBottom: spacing.sm,
  },
  left: {
    backgroundColor: colors.surface,
    borderRightColor: colors.border,
    borderRightWidth: 1,
    padding: spacing.sm,
    width: layout.leftPaneWidth,
  },
  leftDivider: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.sm,
  },
  middle: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 320,
  },
  preview: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: layout.previewHeight,
    padding: spacing.sm,
  },
  right: {
    backgroundColor: colors.surface,
    borderLeftColor: colors.border,
    borderLeftWidth: 1,
    padding: spacing.sm,
    width: layout.rightPaneWidth,
  },
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  toolbar: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    minHeight: layout.toolbarHeight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});

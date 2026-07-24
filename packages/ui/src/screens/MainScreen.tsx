// SCR-001 メイン画面シェル。
// ツールバー・左右ペイン・キャンバス・プレビューを接続するために存在する。
// RELEVANT FILES: ../components/Toolbar.tsx, ../canvas/CanvasViewport.tsx, ../hooks/useMappingSession.ts

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  JobMediator,
  MappingSession,
  MAX_ZOOM,
  MIN_ZOOM,
  type ProcessingGateway,
} from '@csvmapper/application';
import {
  BlockInfo,
  CellPathResult,
  GraphIssue,
  GraphNode,
  InputColumn,
  NodeId,
  NodeKind,
} from '@csvmapper/contracts';

import { labels } from '../accessibility/labels';
import { CanvasViewport } from '../canvas/CanvasViewport';
import { BlockToolbox } from '../components/BlockToolbox';
import { InputColumnList } from '../components/InputColumnList';
import { IssueListDialog } from '../components/IssueListDialog';
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

/** onLayout 前のフォールバック表示サイズ。 */
const DEFAULT_VIEWPORT = { width: 800, height: 500 } as const;

/** 全体表示時に外接矩形へ足す画面余白（logical pixel）。 */
const FIT_PAD_SCREEN = 40;

export interface MainScreenProps {
  session: MappingSession;
  /** 省略時は CSV 選択・プレビューが無効（テスト用の列投入は session API 直呼び）。 */
  gateway?: ProcessingGateway;
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

/**
 * ズーム変更後もビューポート中心のワールド座標を保つ。
 * scroll を据え置くと左上原点基準で拡大縮小して見えるため、差分を scroll へ返す。
 */
export function computeZoomAroundViewCenter(
  currentZoom: number,
  nextZoom: number,
  scrollX: number,
  scrollY: number,
  viewW: number,
  viewH: number,
): { zoom: number; scrollX: number; scrollY: number } {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  if (zoom === currentZoom || currentZoom <= 0) {
    return { zoom: currentZoom, scrollX, scrollY };
  }
  return {
    zoom,
    scrollX: scrollX + (viewW / 2) * (1 / zoom - 1 / currentZoom),
    scrollY: scrollY + (viewH / 2) * (1 / zoom - 1 / currentZoom),
  };
}

function MainScreenBody({ session, gateway }: MainScreenProps) {
  const snapshot = useMappingSession(session);
  const editable = snapshot.phase === 'editable';
  const previewing = snapshot.phase === 'previewing';
  const loading = snapshot.phase === 'loading';
  const { activeRegion, setActiveRegion, focusNextRegion, focusPreviousRegion } =
    useFocusRegions();

  const mediator = useMemo(() => {
    if (!gateway) {
      return null;
    }
    return new JobMediator(session, gateway);
  }, [session, gateway]);

  useEffect(() => {
    return () => {
      mediator?.dispose();
    };
  }, [mediator]);

  const [keyboardFocusId, setKeyboardFocusId] = useState<NodeId | null>(null);
  const [connectSourceId, setConnectSourceId] = useState<NodeId | null>(null);
  const [viewportSize, setViewportSize] = useState<{
    width: number;
    height: number;
  }>(DEFAULT_VIEWPORT);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    rowNumber: number;
    outputItemId: string;
  } | null>(null);
  const [cellPath, setCellPath] = useState<CellPathResult | null>(null);
  // 連続選択で古い inspectCellPath 応答が上書きしないよう世代を持つ。
  const cellPathRequestId = useRef(0);

  useEffect(() => {
    const requested = session.consumeFocusRequest();
    if (requested) {
      setKeyboardFocusId(requested);
      setActiveRegion('canvas');
    }
  }, [session, snapshot.revision, setActiveRegion]);

  useEffect(() => {
    // snapshot 差し替え時は、進行中の cell path 応答も無効化する。
    cellPathRequestId.current += 1;
    setSelectedCell(null);
    setCellPath(null);
  }, [snapshot.previewResult?.snapshotId]);

  useEffect(() => {
    if (!snapshot.previewStale) {
      return;
    }
    // 再プレビュー中は snapshotId が変わらないため、stale 化でも進行中要求を無効化する。
    cellPathRequestId.current += 1;
    setCellPath(null);
  }, [snapshot.previewStale]);

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

  const handleSelectCsv = useCallback(() => {
    if (!mediator) {
      Alert.alert('CSV選択', 'Processing Gateway が未接続です');
      return;
    }
    const run = async () => {
      try {
        const outcome = await mediator.selectAndLoadCsv();
        // 取消・busy では現在の接続操作/フォーカスを維持する。
        if (outcome !== 'started') {
          return;
        }
        setConnectSourceId(null);
        setKeyboardFocusId(null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'CSVの読込に失敗しました';
        Alert.alert('CSV読込エラー', message);
      }
    };
    if (editable) {
      Alert.alert(
        labels.reloadCsvConfirmTitle,
        labels.reloadCsvConfirmMessage,
        [
          { text: labels.cancel, style: 'cancel' },
          {
            text: labels.confirmReload,
            style: 'destructive',
            onPress: () => {
              void run();
            },
          },
        ],
      );
      return;
    }
    void run();
  }, [editable, mediator]);

  const applyReset = useCallback(() => {
    session.resetSession();
    setConnectSourceId(null);
    setKeyboardFocusId(null);
    setSelectedCell(null);
    setCellPath(null);
  }, [session]);

  const handleReset = useCallback(() => {
    if (!editable) {
      return;
    }
    Alert.alert(labels.resetConfirmTitle, labels.resetConfirmMessage, [
      { text: labels.cancel, style: 'cancel' },
      {
        text: labels.confirmReset,
        style: 'destructive',
        onPress: applyReset,
      },
    ]);
  }, [editable, applyReset]);

  const handlePreview = useCallback(() => {
    if (!mediator || !editable) {
      return;
    }
    void (async () => {
      try {
        await mediator.startPreview(snapshot.previewRowCount);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'プレビューに失敗しました';
        Alert.alert('プレビューエラー', message);
      }
    })();
  }, [mediator, editable, snapshot.previewRowCount]);

  const handleCancelPreview = useCallback(() => {
    void (async () => {
      try {
        await mediator?.cancelActive();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'プレビューの中止に失敗しました';
        Alert.alert('プレビュー中止エラー', message);
      }
    })();
  }, [mediator]);

  const handleSelectCell = useCallback(
    async (rowNumber: number, outputItemId: string) => {
      const requestId = ++cellPathRequestId.current;
      setSelectedCell({ rowNumber, outputItemId });
      // 新選択の応答が来るまで、前セルの経路を残さない。
      setCellPath(null);
      if (!mediator || snapshot.previewStale) {
        return;
      }
      try {
        const path = await mediator.inspectCellPath(rowNumber, outputItemId);
        // より新しい選択が始まっていれば、この応答は捨てる。
        if (requestId !== cellPathRequestId.current) {
          return;
        }
        setCellPath(path);
      } catch {
        if (requestId !== cellPathRequestId.current) {
          return;
        }
        setCellPath(null);
      }
    },
    [mediator, snapshot.previewStale],
  );

  const handleFocusIssue = useCallback(
    (issue: GraphIssue) => {
      if (issue.nodeId) {
        session.requestFocus(issue.nodeId);
        session.setSelection([issue.nodeId]);
      }
      setIssuesOpen(false);
    },
    [session],
  );

  const handleExportCsv = useCallback(() => {
    Alert.alert(labels.exportCsv, labels.exportComingSoon);
  }, []);

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
    session.setViewTransform(next.zoom, next.scrollX, next.scrollY);
  }, [session, snapshot.nodes, viewportSize.height, viewportSize.width]);

  const applyZoomFactor = useCallback(
    (factor: number) => {
      const next = computeZoomAroundViewCenter(
        snapshot.ui.zoom,
        snapshot.ui.zoom * factor,
        snapshot.ui.scrollX,
        snapshot.ui.scrollY,
        viewportSize.width,
        viewportSize.height,
      );
      session.setViewTransform(next.zoom, next.scrollX, next.scrollY);
    },
    [
      session,
      snapshot.ui.scrollX,
      snapshot.ui.scrollY,
      snapshot.ui.zoom,
      viewportSize.height,
      viewportSize.width,
    ],
  );

  const handleAutoLayout = useCallback(() => {
    const result = session.autoLayout();
    if (!result.ok) {
      Alert.alert(labels.autoLayoutFailedTitle, result.message);
    }
  }, [session]);

  const deleteSelection = useCallback(() => {
    if (!editable) {
      return;
    }
    const nodeIds = [...snapshot.ui.selection];
    if (nodeIds.length > 0) {
      const result = session.removeNodes(nodeIds);
      if (result.ok) {
        session.setSelection([]);
        setConnectSourceId(null);
        setKeyboardFocusId(null);
      }
      return;
    }
    const edgeIds = [...snapshot.ui.edgeSelection];
    if (edgeIds.length === 0) {
      return;
    }
    const result = session.removeEdges(edgeIds);
    if (result.ok) {
      session.setEdgeSelection([]);
      setConnectSourceId(null);
    }
  }, [editable, session, snapshot.ui.edgeSelection, snapshot.ui.selection]);

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
            applyZoomFactor(1.1);
          }
          break;
        case 'zoomOut':
          if (editable) {
            applyZoomFactor(1 / 1.1);
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
      deleteSelection,
      applyZoomFactor,
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

  const progressLabel = snapshot.jobProgress
    ? `${labels.previewRunning}（${snapshot.jobProgress.recordsProcessed} 件）`
    : labels.previewRunning;

  const fileSummary =
    snapshot.inputFile && editable
      ? `${labels.fileSummary}: ${snapshot.columnCount} 列 / ${snapshot.dataRowCount} 行` +
        (snapshot.detectedEncoding ? ` / ${snapshot.detectedEncoding}` : '')
      : null;

  const rootProps = {
    style: styles.root,
    accessibilityLabel: labels.mainScreen,
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
          previewing={previewing || loading}
          canUndo={snapshot.canUndo}
          canRedo={snapshot.canRedo}
          canDelete={
            snapshot.ui.selection.size > 0 || snapshot.ui.edgeSelection.size > 0
          }
          errorCount={snapshot.errorCount}
          warningCount={snapshot.warningCount}
          canExport={snapshot.canExport}
          onSelectCsv={handleSelectCsv}
          onReset={handleReset}
          onUndo={() => session.undo()}
          onRedo={() => session.redo()}
          onDelete={deleteSelection}
          onAutoLayout={handleAutoLayout}
          onZoomIn={() => applyZoomFactor(1.1)}
          onZoomOut={() => applyZoomFactor(1 / 1.1)}
          onFitAll={fitAll}
          onOpenIssues={() => setIssuesOpen(true)}
          onExportCsv={handleExportCsv}
        />
      </FocusRegion>

      <View style={styles.middle}>
        <FocusRegion id="left" accessibilityLabel={labels.leftPane} style={styles.left}>
          {!editable && !loading ? (
            <Text style={styles.hint}>{labels.unloadedHint}</Text>
          ) : null}
          {fileSummary ? <Text style={styles.hint}>{fileSummary}</Text> : null}
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
            edgeSelection={snapshot.ui.edgeSelection}
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
            inputSamples={snapshot.inputSamples}
            onChangeOutputName={(id, name) => session.setOutputName(id, name)}
            onChangeBlockConfig={(id, block) => session.setBlockConfig(id, block)}
          />
        </FocusRegion>
      </View>

      <FocusRegion id="preview" accessibilityLabel={labels.preview} style={styles.preview}>
        <PreviewShell
          editable={editable}
          previewing={previewing}
          canPreview={!!mediator && editable}
          rowCount={snapshot.previewRowCount}
          stale={snapshot.previewStale}
          result={snapshot.previewResult}
          progressLabel={progressLabel}
          cellPath={cellPath}
          selectedCell={selectedCell}
          onChangeRowCount={count => session.setPreviewRowCount(count)}
          onSelectCell={(row, col) => {
            void handleSelectCell(row, col);
          }}
          onPreview={handlePreview}
          onCancel={handleCancelPreview}
        />
      </FocusRegion>

      <IssueListDialog
        visible={issuesOpen}
        issues={snapshot.issues}
        onClose={() => setIssuesOpen(false)}
        onFocusIssue={handleFocusIssue}
      />
    </View>
  );
}

export function MainScreen({ session, gateway }: MainScreenProps) {
  return (
    <FocusRegionProvider>
      <MainScreenBody session={session} gateway={gateway} />
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
    // IssueListDialog の absoluteFill オーバーレイを画面全体に載せる基準にする。
    position: 'relative',
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

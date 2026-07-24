// キャンバス上の単一ノード表示。
// 種別・選択・フォーカス・問題を併記するために存在する。
// RELEVANT FILES: PortView.tsx, CanvasViewport.tsx

import React, { useRef } from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { GraphNode, NodeKind } from '@csvmapper/contracts';

import {
  nodeAccessibilityLabel,
  nodeKindLabel,
} from '../accessibility/labels';
import { colors, layout, spacing, typography } from '../theme/tokens';
import { PortView } from './PortView';

export interface NodeViewProps {
  node: GraphNode;
  selected: boolean;
  focused: boolean;
  errorCount: number;
  warningCount: number;
  incomingConnected: boolean;
  outgoingConnected: boolean;
  inputConnectable: boolean;
  outputConnectable: boolean;
  dragOffset?: { x: number; y: number };
  zoom: number;
  onSelect: (additive: boolean) => void;
  onMoveDelta: (dx: number, dy: number) => void;
  onMoveEnd: () => void;
  onPortPress: (direction: 'input' | 'output') => void;
}

function kindStyle(kind: NodeKind) {
  switch (kind) {
    case NodeKind.Input:
      return styles.kindInput;
    case NodeKind.Block:
      return styles.kindBlock;
    case NodeKind.Output:
      return styles.kindOutput;
    default:
      return styles.kindBlock;
  }
}

function shapeLabel(kind: NodeKind): string {
  switch (kind) {
    case NodeKind.Input:
      return '■入力';
    case NodeKind.Block:
      return '◆編集';
    case NodeKind.Output:
      return '●出力';
    default:
      return nodeKindLabel(kind);
  }
}

export function NodeView({
  node,
  selected,
  focused,
  errorCount,
  warningCount,
  incomingConnected,
  outgoingConnected,
  inputConnectable,
  outputConnectable,
  dragOffset,
  zoom,
  onSelect,
  onMoveDelta,
  onMoveEnd,
  onPortPress,
}: NodeViewProps) {
  const x = node.position.x + (dragOffset?.x ?? 0);
  const y = node.position.y + (dragOffset?.y ?? 0);
  const connectionCount =
    (incomingConnected ? 1 : 0) + (outgoingConnected ? 1 : 0);

  let statusText = '正常';
  if (errorCount > 0) {
    statusText = `エラー${errorCount}`;
  } else if (warningCount > 0) {
    statusText = `警告${warningCount}`;
  }

  const callbacksRef = useRef({
    onSelect,
    onMoveDelta,
    onMoveEnd,
    zoom,
  });
  callbacksRef.current = { onSelect, onMoveDelta, onMoveEnd, zoom };

  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, gesture) =>
        Math.abs(gesture.dx) + Math.abs(gesture.dy) > 3,
      onPanResponderGrant: (event: GestureResponderEvent) => {
        moved.current = false;
        lastPoint.current = {
          x: event.nativeEvent.pageX,
          y: event.nativeEvent.pageY,
        };
        const native = event.nativeEvent as GestureResponderEvent['nativeEvent'] & {
          metaKey?: boolean;
          ctrlKey?: boolean;
        };
        const additive = !!(native.metaKey || native.ctrlKey);
        callbacksRef.current.onSelect(additive);
      },
      onPanResponderMove: (event: GestureResponderEvent) => {
        const prev = lastPoint.current;
        if (!prev) {
          return;
        }
        const pageX = event.nativeEvent.pageX;
        const pageY = event.nativeEvent.pageY;
        const scale = callbacksRef.current.zoom || 1;
        const dx = (pageX - prev.x) / scale;
        const dy = (pageY - prev.y) / scale;
        if (Math.abs(dx) + Math.abs(dy) > 0) {
          moved.current = true;
          callbacksRef.current.onMoveDelta(dx, dy);
          lastPoint.current = { x: pageX, y: pageY };
        }
      },
      onPanResponderRelease: () => {
        lastPoint.current = null;
        if (moved.current) {
          callbacksRef.current.onMoveEnd();
        }
      },
      onPanResponderTerminate: () => {
        lastPoint.current = null;
        if (moved.current) {
          callbacksRef.current.onMoveEnd();
        }
      },
    }),
  ).current;

  return (
    <View
      style={[
        styles.wrap,
        {
          left: x,
          top: y,
          width: layout.nodeWidth,
          height: layout.nodeHeight,
        },
      ]}
    >
      <View
        accessibilityRole="button"
        accessibilityLabel={nodeAccessibilityLabel({
          kind: node.kind,
          displayName: node.displayName,
          selected,
          focused,
          errorCount,
          warningCount,
          connectionCount,
        })}
        accessibilityState={{ selected }}
        style={[
          styles.node,
          kindStyle(node.kind),
          selected ? styles.selected : null,
          focused ? styles.focused : null,
          errorCount > 0 ? styles.error : null,
        ]}
        {...panResponder.panHandlers}
      >
        <Text style={styles.kind}>{shapeLabel(node.kind)}</Text>
        <Text numberOfLines={1} style={styles.name}>
          {node.displayName || '(未命名)'}
        </Text>
        <Text style={styles.status}>{statusText}</Text>
      </View>
      {node.kind !== NodeKind.Input ? (
        <PortView
          direction="input"
          nodeName={node.displayName}
          connected={incomingConnected}
          connectable={inputConnectable}
          onPress={() => onPortPress('input')}
        />
      ) : null}
      {node.kind !== NodeKind.Output ? (
        <PortView
          direction="output"
          nodeName={node.displayName}
          connected={outgoingConnected}
          connectable={outputConnectable}
          onPress={() => onPortPress('output')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  error: {
    borderColor: colors.danger,
  },
  focused: {
    borderColor: colors.focusRing,
    borderWidth: 2,
  },
  kind: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  kindBlock: {
    backgroundColor: colors.nodeBlock,
    borderRadius: 10,
  },
  kindInput: {
    backgroundColor: colors.nodeInput,
    borderRadius: 2,
  },
  kindOutput: {
    backgroundColor: colors.nodeOutput,
    borderRadius: 20,
  },
  name: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '600',
  },
  node: {
    borderColor: colors.borderStrong,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  selected: {
    borderColor: colors.selection,
    borderWidth: 2,
  },
  status: {
    color: colors.textMuted,
    fontSize: 10,
  },
  wrap: {
    position: 'absolute',
  },
});

// ノード上の入出力端子表示と接続操作。
// 左＝入力・右＝出力の配置と接続可否を伝えるために存在する。
// RELEVANT FILES: NodeView.tsx, EdgeLayer.tsx, CanvasViewport.tsx

import React, { useRef } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';

import { portAccessibilityLabel } from '../accessibility/labels';
import { colors, layout } from '../theme/tokens';

/** 接続ドラッグ開始とみなす最小移動（画面ピクセル）。 */
const DRAG_THRESHOLD = 3;

export interface PortViewProps {
  direction: 'input' | 'output';
  nodeName: string;
  connected: boolean;
  connectable: boolean;
  /** キーボード／短いタップ用。出力は接続元確定、入力は接続完了。 */
  onPress: () => void;
  /** 出力端子のドラッグ接続開始。 */
  onDragStart?: () => void;
  /** 出力端子ドラッグ中のポインタ位置（page 座標）。 */
  onDragMove?: (pageX: number, pageY: number) => void;
  /** 出力端子ドラッグ終了（page 座標）。 */
  onDragEnd?: (pageX: number, pageY: number) => void;
}

export function PortView({
  direction,
  nodeName,
  connected,
  connectable,
  onPress,
  onDragStart,
  onDragMove,
  onDragEnd,
}: PortViewProps) {
  // 空の displayName だと複数端子のアクセシブル名が区別できない。
  const accessibleNodeName = nodeName || '(未命名)';
  const blocked = !connectable;

  const callbacksRef = useRef({
    onPress,
    onDragStart,
    onDragMove,
    onDragEnd,
    blocked,
  });
  callbacksRef.current = {
    onPress,
    onDragStart,
    onDragMove,
    onDragEnd,
    blocked,
  };

  const lastPage = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !callbacksRef.current.blocked,
      onMoveShouldSetPanResponder: (_e, gesture) =>
        !callbacksRef.current.blocked &&
        Math.abs(gesture.dx) + Math.abs(gesture.dy) > DRAG_THRESHOLD,
      onPanResponderGrant: (event: GestureResponderEvent) => {
        if (callbacksRef.current.blocked) {
          return;
        }
        dragged.current = false;
        lastPage.current = {
          x: event.nativeEvent.pageX,
          y: event.nativeEvent.pageY,
        };
        callbacksRef.current.onDragStart?.();
        callbacksRef.current.onDragMove?.(
          event.nativeEvent.pageX,
          event.nativeEvent.pageY,
        );
      },
      onPanResponderMove: (event: GestureResponderEvent) => {
        const pageX = event.nativeEvent.pageX;
        const pageY = event.nativeEvent.pageY;
        const prev = lastPage.current;
        if (prev) {
          if (
            Math.abs(pageX - prev.x) + Math.abs(pageY - prev.y) >
            DRAG_THRESHOLD
          ) {
            dragged.current = true;
          }
        }
        lastPage.current = { x: pageX, y: pageY };
        callbacksRef.current.onDragMove?.(pageX, pageY);
      },
      onPanResponderRelease: (event: GestureResponderEvent) => {
        const pageX = event.nativeEvent.pageX;
        const pageY = event.nativeEvent.pageY;
        lastPage.current = null;
        if (dragged.current) {
          callbacksRef.current.onDragEnd?.(pageX, pageY);
        } else {
          // ほぼ移動なしの短いタップはキーボード経路と同じ接続元確定。
          callbacksRef.current.onPress();
        }
        dragged.current = false;
      },
      onPanResponderTerminate: (event: GestureResponderEvent) => {
        const pageX = event.nativeEvent.pageX;
        const pageY = event.nativeEvent.pageY;
        lastPage.current = null;
        // ジェスチャ奪取時はドラッグ有無に関わらず onDragEnd でキャンセル/確定を委譲する。
        callbacksRef.current.onDragEnd?.(pageX, pageY);
        dragged.current = false;
      },
    }),
  ).current;

  const accessibilityProps = {
    accessibilityRole: 'button' as const,
    accessibilityLabel: portAccessibilityLabel({
      direction,
      nodeName: accessibleNodeName,
      connected,
      connectable,
    }),
    accessibilityState: { disabled: blocked },
  };

  const portStyle = [
    styles.port,
    direction === 'input' ? styles.input : styles.output,
    blocked ? styles.blocked : styles.ready,
    connected ? styles.connected : null,
  ];

  // 出力はドラッグ接続、入力は押下で接続完了（キーボード経路）。
  if (direction === 'output') {
    return (
      <View
        {...accessibilityProps}
        accessible
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={event => {
          if (event.nativeEvent.actionName === 'activate' && !blocked) {
            onPress();
          }
        }}
        // disabled 時はパンを開始しないが、見た目は blocked スタイルで伝える。
        {...(blocked ? {} : panResponder.panHandlers)}
        style={portStyle}
      >
        <View style={styles.dot} />
      </View>
    );
  }

  return (
    <Pressable
      {...accessibilityProps}
      disabled={blocked}
      onPress={onPress}
      style={portStyle}
    >
      <View style={styles.dot} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  blocked: {
    borderColor: colors.portBlocked,
    opacity: 0.55,
  },
  connected: {
    backgroundColor: colors.overlay,
  },
  dot: {
    backgroundColor: colors.text,
    borderRadius: layout.portSize / 2,
    height: 6,
    width: 6,
  },
  input: {
    left: -layout.portSize / 2,
  },
  output: {
    right: -layout.portSize / 2,
  },
  port: {
    alignItems: 'center',
    borderRadius: layout.portSize / 2,
    borderWidth: 1,
    height: layout.portSize,
    justifyContent: 'center',
    position: 'absolute',
    top: layout.nodeHeight / 2 - layout.portSize / 2,
    width: layout.portSize,
  },
  ready: {
    borderColor: colors.portReady,
  },
});

// ノード上の入出力端子表示と接続操作。
// 端子の方向・接続可否を色以外でも伝えるために存在する。
// RELEVANT FILES: NodeView.tsx, EdgeLayer.tsx

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { portAccessibilityLabel } from '../accessibility/labels';
import { colors, layout } from '../theme/tokens';

export interface PortViewProps {
  direction: 'input' | 'output';
  nodeName: string;
  connected: boolean;
  connectable: boolean;
  onPress: () => void;
}

export function PortView({
  direction,
  nodeName,
  connected,
  connectable,
  onPress,
}: PortViewProps) {
  // 空の displayName だと複数端子のアクセシブル名が区別できない。
  const accessibleNodeName = nodeName || '(未命名)';
  const blocked = !connectable;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={portAccessibilityLabel({
        direction,
        nodeName: accessibleNodeName,
        connected,
        connectable,
      })}
      accessibilityState={{ disabled: blocked }}
      disabled={blocked}
      onPress={onPress}
      style={[
        styles.port,
        direction === 'input' ? styles.input : styles.output,
        blocked ? styles.blocked : styles.ready,
        connected ? styles.connected : null,
      ]}
    >
      <View style={styles.dot} />
      <Text style={styles.badge}>{direction === 'input' ? '入' : '出'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    color: colors.text,
    fontSize: 9,
    fontWeight: '700',
    marginLeft: 2,
  },
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
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'row',
    height: layout.portSize + 4,
    justifyContent: 'center',
    minWidth: layout.portSize + 10,
    paddingHorizontal: 2,
    position: 'absolute',
    top: layout.nodeHeight / 2 - (layout.portSize + 4) / 2,
  },
  ready: {
    borderColor: colors.portReady,
  },
});

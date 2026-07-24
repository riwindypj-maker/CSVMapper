// 右側の出力項目一覧と並び替え操作。
// 出力ノードの追加・選択・順序変更の入口として存在する。
// RELEVANT FILES: PropertyPanel.tsx, ../screens/MainScreen.tsx

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GraphNode, NodeId } from '@csvmapper/contracts';

import { labels } from '../accessibility/labels';
import { colors, spacing, typography } from '../theme/tokens';

export interface OutputColumnListProps {
  outputs: readonly GraphNode[];
  selectedIds: ReadonlySet<NodeId>;
  editable: boolean;
  onAddOutput: () => void;
  onSelect: (id: NodeId) => void;
  onMoveUp: (id: NodeId) => void;
  onMoveDown: (id: NodeId) => void;
}

export function OutputColumnList({
  outputs,
  selectedIds,
  editable,
  onAddOutput,
  onSelect,
  onMoveUp,
  onMoveDown,
}: OutputColumnListProps) {
  return (
    <View style={styles.container} accessibilityLabel={labels.outputList}>
      <View style={styles.header}>
        <Text style={styles.heading}>出力項目</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={labels.addOutput}
          accessibilityState={{ disabled: !editable }}
          disabled={!editable}
          onPress={onAddOutput}
          style={[styles.addButton, !editable ? styles.disabled : null]}
        >
          <Text style={styles.addText}>追加</Text>
        </Pressable>
      </View>
      {outputs.length === 0 ? (
        <Text style={styles.empty}>
          {editable ? '出力項目がありません' : labels.unloadedHint}
        </Text>
      ) : (
        outputs.map((node, index) => {
          const selected = selectedIds.has(node.id);
          const displayName = node.displayName || '(未命名)';
          return (
            <View
              key={node.id}
              style={[styles.row, selected ? styles.selected : null]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`出力項目 ${displayName}`}
                accessibilityState={{ selected }}
                onPress={() => onSelect(node.id)}
                style={styles.nameButton}
              >
                <Text style={styles.name}>{displayName}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${displayName}を上へ`}
                disabled={!editable || index === 0}
                onPress={() => onMoveUp(node.id)}
                style={styles.orderButton}
              >
                <Text style={styles.orderText}>上</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${displayName}を下へ`}
                disabled={!editable || index === outputs.length - 1}
                onPress={() => onMoveDown(node.id)}
                style={styles.orderButton}
              >
                <Text style={styles.orderText}>下</Text>
              </Pressable>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  addButton: {
    borderColor: colors.accent,
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  addText: {
    color: colors.accent,
    fontSize: typography.small,
  },
  container: {
    marginBottom: spacing.md,
  },
  disabled: {
    opacity: 0.5,
  },
  empty: {
    color: colors.textMuted,
    fontSize: typography.small,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  heading: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '600',
  },
  name: {
    color: colors.text,
    fontSize: typography.body,
  },
  nameButton: {
    flex: 1,
  },
  orderButton: {
    marginLeft: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  orderText: {
    color: colors.accent,
    fontSize: typography.small,
  },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingVertical: spacing.xs,
  },
  selected: {
    backgroundColor: colors.overlay,
  },
});

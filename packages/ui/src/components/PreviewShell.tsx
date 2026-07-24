// 下部プレビュー枠と件数選択のシェル。
// 実評価は順序6のため、枠と状態表示だけを担うために存在する。
// RELEVANT FILES: ../screens/MainScreen.tsx, ../accessibility/labels.ts

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { labels } from '../accessibility/labels';
import { colors, spacing, typography } from '../theme/tokens';

export const PREVIEW_ROW_OPTIONS = [100, 500, 1000] as const;

export interface PreviewShellProps {
  editable: boolean;
  rowCount: number;
  stale: boolean;
  onChangeRowCount: (count: number) => void;
}

export function PreviewShell({
  editable,
  rowCount,
  stale,
  onChangeRowCount,
}: PreviewShellProps) {
  return (
    <View style={styles.container} accessibilityLabel={labels.preview}>
      <View style={styles.header}>
        <Text style={styles.heading}>プレビュー</Text>
        <Text
          accessibilityLabel={
            stale ? labels.previewStale : labels.previewCurrent
          }
          style={[styles.status, stale ? styles.statusStale : styles.statusCurrent]}
        >
          {stale ? '未更新' : '最新'}
        </Text>
      </View>
      <View style={styles.rowCountRow} accessibilityLabel={labels.previewRowCount}>
        <Text style={styles.label}>件数</Text>
        {PREVIEW_ROW_OPTIONS.map(option => {
          const selected = rowCount === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityLabel={`プレビュー件数 ${option}`}
              accessibilityState={{ selected, disabled: !editable }}
              disabled={!editable}
              onPress={() => onChangeRowCount(option)}
              style={[
                styles.chip,
                selected ? styles.chipSelected : null,
                !editable ? styles.disabled : null,
              ]}
            >
              <Text style={styles.chipText}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.body}>
        <Text style={styles.empty}>{labels.previewEmpty}</Text>
        <Text style={styles.hint}>
          プレビュー評価と経路表示は後続工程で接続します。
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 4,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
  },
  chip: {
    borderColor: colors.border,
    borderRadius: 4,
    borderWidth: 1,
    marginLeft: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.overlay,
  },
  chipText: {
    color: colors.text,
    fontSize: typography.small,
  },
  container: {
    flex: 1,
  },
  disabled: {
    opacity: 0.5,
  },
  empty: {
    color: colors.text,
    fontSize: typography.body,
    marginBottom: spacing.xs,
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
  hint: {
    color: colors.textMuted,
    fontSize: typography.small,
  },
  label: {
    color: colors.textMuted,
    fontSize: typography.small,
  },
  rowCountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  status: {
    fontSize: typography.small,
    fontWeight: '600',
  },
  statusCurrent: {
    color: colors.textMuted,
  },
  statusStale: {
    color: colors.warning,
  },
});

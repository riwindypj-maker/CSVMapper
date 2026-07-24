// 下部プレビュー枠と件数選択・表・経路のシェル。
// 手動プレビュー結果と処理中表示をまとめるために存在する。
// RELEVANT FILES: PreviewTable.tsx, CellPathPanel.tsx, ../screens/MainScreen.tsx

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CellPathResult, PreviewResult } from '@csvmapper/contracts';
import { PREVIEW_ROW_OPTIONS } from '@csvmapper/contracts';

import { labels } from '../accessibility/labels';
import { colors, spacing, typography } from '../theme/tokens';
import { CellPathPanel } from './CellPathPanel';
import { PreviewTable } from './PreviewTable';

export { PREVIEW_ROW_OPTIONS };

export interface PreviewShellProps {
  editable: boolean;
  previewing: boolean;
  canPreview: boolean;
  rowCount: number;
  stale: boolean;
  result: PreviewResult | null;
  progressLabel?: string;
  cellPath: CellPathResult | null;
  selectedCell: { rowNumber: number; outputItemId: string } | null;
  onChangeRowCount: (count: number) => void;
  onSelectCell: (rowNumber: number, outputItemId: string) => void;
  onPreview: () => void;
  onCancel?: () => void;
}

export function PreviewShell({
  editable,
  previewing,
  canPreview,
  rowCount,
  stale,
  result,
  progressLabel,
  cellPath,
  selectedCell,
  onChangeRowCount,
  onSelectCell,
  onPreview,
  onCancel,
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
        {/* 状態表示の直後に実行ボタンを置き、見出し→最新/未更新→実行の読み順にする。 */}
        {!previewing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={labels.previewAction}
            accessibilityState={{ disabled: !canPreview }}
            disabled={!canPreview}
            onPress={onPreview}
            style={[
              styles.previewButton,
              !canPreview ? styles.disabled : null,
            ]}
          >
            <Text
              style={[
                styles.previewButtonText,
                !canPreview ? styles.previewButtonTextDisabled : null,
              ]}
            >
              {labels.previewAction}
            </Text>
          </Pressable>
        ) : null}
        {previewing ? (
          <View style={styles.progressRow}>
            <Text style={styles.progress}>{progressLabel ?? labels.previewRunning}</Text>
            {onCancel ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={labels.cancelPreview}
                onPress={onCancel}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelText}>中止</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
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
              accessibilityState={{ selected, disabled: !editable || previewing }}
              disabled={!editable || previewing}
              onPress={() => onChangeRowCount(option)}
              style={[
                styles.chip,
                selected ? styles.chipSelected : null,
                !editable || previewing ? styles.disabled : null,
              ]}
            >
              <Text style={styles.chipText}>{option}</Text>
            </Pressable>
          );
        })}
        {result ? (
          <Text style={styles.meta}>
            {result.evaluatedRowCount} 行表示
          </Text>
        ) : null}
      </View>
      <View style={styles.body}>
        <View style={styles.tablePane}>
          <PreviewTable
            result={result}
            selectedCell={selectedCell}
            onSelectCell={onSelectCell}
          />
        </View>
        <CellPathPanel path={cellPath} />
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
    flexDirection: 'row',
    padding: spacing.sm,
  },
  cancelButton: {
    borderColor: colors.border,
    borderRadius: 4,
    borderWidth: 1,
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  cancelText: {
    color: colors.text,
    fontSize: typography.small,
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
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  heading: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '600',
    marginRight: spacing.sm,
  },
  label: {
    color: colors.textMuted,
    fontSize: typography.small,
  },
  meta: {
    color: colors.textMuted,
    fontSize: typography.small,
    marginLeft: spacing.sm,
  },
  previewButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 4,
    borderWidth: 1,
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  previewButtonText: {
    color: colors.text,
    fontSize: typography.small,
  },
  previewButtonTextDisabled: {
    color: colors.textMuted,
  },
  progress: {
    color: colors.accent,
    fontSize: typography.small,
  },
  progressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginLeft: 'auto',
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
  tablePane: {
    flex: 1,
  },
});

// 上部ツールバーの操作ボタン群。
// CSV 読込・編集操作・問題一覧・出力可否の入口を提供するために存在する。
// RELEVANT FILES: ../screens/MainScreen.tsx, ../accessibility/labels.ts

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';

import { labels } from '../accessibility/labels';
import { colors, spacing, typography } from '../theme/tokens';

export interface ToolbarProps {
  editable: boolean;
  previewing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canDelete: boolean;
  errorCount: number;
  warningCount: number;
  canExport: boolean;
  onSelectCsv: () => void;
  onReset: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onAutoLayout: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitAll: () => void;
  onOpenIssues: () => void;
  onExportCsv: () => void;
}

function ToolButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: (event: GestureResponderEvent) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled ? styles.buttonDisabled : null]}
    >
      <Text style={[styles.buttonText, disabled ? styles.textDisabled : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Toolbar({
  editable,
  previewing,
  canUndo,
  canRedo,
  canDelete,
  errorCount,
  warningCount,
  canExport,
  onSelectCsv,
  onReset,
  onUndo,
  onRedo,
  onDelete,
  onAutoLayout,
  onZoomIn,
  onZoomOut,
  onFitAll,
  onOpenIssues,
  onExportCsv,
}: ToolbarProps) {
  const issueLabel =
    errorCount > 0
      ? `${labels.openIssues}（エラー${errorCount}）`
      : warningCount > 0
        ? `${labels.openIssues}（警告${warningCount}）`
        : labels.openIssues;

  return (
    <View style={styles.row} accessibilityLabel={labels.toolbar}>
      <ToolButton
        label={labels.selectCsv}
        disabled={previewing}
        onPress={onSelectCsv}
      />
      <ToolButton
        label={labels.resetSession}
        disabled={!editable || previewing}
        onPress={onReset}
      />
      <ToolButton
        label={labels.undo}
        disabled={!editable || !canUndo || previewing}
        onPress={onUndo}
      />
      <ToolButton
        label={labels.redo}
        disabled={!editable || !canRedo || previewing}
        onPress={onRedo}
      />
      <ToolButton
        label={labels.deleteSelection}
        disabled={!editable || !canDelete || previewing}
        onPress={onDelete}
      />
      <ToolButton
        label={labels.autoLayout}
        disabled={!editable || previewing}
        onPress={onAutoLayout}
      />
      <ToolButton
        label={labels.zoomIn}
        disabled={!editable}
        onPress={onZoomIn}
      />
      <ToolButton
        label={labels.zoomOut}
        disabled={!editable}
        onPress={onZoomOut}
      />
      <ToolButton
        label={labels.fitAll}
        disabled={!editable}
        onPress={onFitAll}
      />
      <ToolButton
        label={issueLabel}
        disabled={!editable && errorCount + warningCount === 0}
        onPress={onOpenIssues}
      />
      <ToolButton
        label={labels.exportCsv}
        disabled={!canExport}
        onPress={onExportCsv}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 4,
    borderWidth: 1,
    marginRight: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  buttonDisabled: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.disabled,
  },
  buttonText: {
    color: colors.text,
    fontSize: typography.small,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  textDisabled: {
    color: colors.textMuted,
  },
});

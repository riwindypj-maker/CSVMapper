// 上部ツールバーの操作ボタン群。
// CSV 読込モックと編集系コマンドの入口を提供するために存在する。
// RELEVANT FILES: ../screens/MainScreen.tsx, ../../accessibility/labels.ts

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
  canUndo: boolean;
  canRedo: boolean;
  errorCount: number;
  onSelectCsv: () => void;
  onReset: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onAutoLayout: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitAll: () => void;
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
  canUndo,
  canRedo,
  errorCount,
  onSelectCsv,
  onReset,
  onUndo,
  onRedo,
  onAutoLayout,
  onZoomIn,
  onZoomOut,
  onFitAll,
}: ToolbarProps) {
  return (
    <View style={styles.row} accessibilityLabel={labels.toolbar}>
      <ToolButton label={labels.selectCsv} onPress={onSelectCsv} />
      <ToolButton
        label={labels.resetSession}
        disabled={!editable}
        onPress={onReset}
      />
      <ToolButton
        label={labels.undo}
        disabled={!editable || !canUndo}
        onPress={onUndo}
      />
      <ToolButton
        label={labels.redo}
        disabled={!editable || !canRedo}
        onPress={onRedo}
      />
      <ToolButton
        label={labels.autoLayout}
        disabled={!editable}
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
      <ToolButton label={labels.previewAction} disabled onPress={() => undefined} />
      <ToolButton
        label={
          errorCount > 0
            ? `${labels.openIssues}（エラー${errorCount}）`
            : labels.openIssues
        }
        disabled
        onPress={() => undefined}
      />
      <ToolButton label={labels.exportCsv} disabled onPress={() => undefined} />
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

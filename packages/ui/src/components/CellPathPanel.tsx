// 選択セルの変換経路パネル。
// 元入力と各ブロック結果を段階表示するために存在する。
// RELEVANT FILES: PreviewShell.tsx, PreviewTable.tsx

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CellPathResult } from '@csvmapper/contracts';
import { NodeKind } from '@csvmapper/contracts';

import { labels } from '../accessibility/labels';
import { colors, spacing, typography } from '../theme/tokens';

export interface CellPathPanelProps {
  path: CellPathResult | null;
}

function kindLabel(kind: NodeKind): string {
  switch (kind) {
    case NodeKind.Input:
      return '入力';
    case NodeKind.Block:
      return 'ブロック';
    case NodeKind.Output:
      return '出力';
    default:
      return 'ノード';
  }
}

export function CellPathPanel({ path }: CellPathPanelProps) {
  if (!path || path.steps.length === 0) {
    return (
      <View style={styles.box} accessibilityLabel={labels.cellPath}>
        <Text style={styles.hint}>{labels.cellPathEmpty}</Text>
      </View>
    );
  }

  return (
    <View style={styles.box} accessibilityLabel={labels.cellPath}>
      <Text style={styles.heading}>
        変換経路（行 {path.rowNumber}）
      </Text>
      {path.steps.map((step, index) => (
        <Text key={`${step.nodeId}-${index}`} style={styles.step}>
          {index + 1}. [{kindLabel(step.kind)}] {step.displayName}:{' '}
          {step.errorMessage
            ? `エラー（${step.errorMessage}）`
            : `"${step.value ?? ''}"`}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderColor: colors.border,
    borderLeftWidth: 1,
    minWidth: 200,
    paddingLeft: spacing.sm,
  },
  heading: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  hint: {
    color: colors.textMuted,
    fontSize: typography.small,
  },
  step: {
    color: colors.text,
    fontSize: typography.small,
    marginBottom: 2,
  },
});

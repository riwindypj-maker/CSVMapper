// プレビュー結果の仮想化テーブル。
// 出力列順のセル表示と選択を担うために存在する。
// RELEVANT FILES: PreviewShell.tsx, CellPathPanel.tsx, ../../../contracts/src/preview.ts

import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { PreviewResult } from '@csvmapper/contracts';

import { labels } from '../accessibility/labels';
import { colors, spacing, typography } from '../theme/tokens';

export interface PreviewTableProps {
  result: PreviewResult | null;
  selectedCell: { rowNumber: number; outputItemId: string } | null;
  onSelectCell: (rowNumber: number, outputItemId: string) => void;
}

export function PreviewTable({
  result,
  selectedCell,
  onSelectCell,
}: PreviewTableProps) {
  const rows = useMemo(() => {
    if (!result) {
      return [];
    }
    return result.pages.flatMap(page => page.rows);
  }, [result]);

  if (!result || result.columns.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.empty}>{labels.previewEmpty}</Text>
      </View>
    );
  }

  return (
    <ScrollView horizontal style={styles.horizontal}>
      <View>
        <View style={styles.headerRow} accessibilityLabel={labels.previewTable}>
          <Text style={[styles.headerCell, styles.rowNumber]}>行</Text>
          {result.columns.map(col => (
            <Text
              key={col.outputItemId}
              style={[
                styles.headerCell,
                col.hasError ? styles.headerError : null,
              ]}
            >
              {col.displayName || col.outputItemId}
              {col.hasError ? '（エラー）' : ''}
            </Text>
          ))}
        </View>
        <ScrollView style={styles.body}>
          {rows.map(row => (
            <View key={row.rowNumber} style={styles.dataRow}>
              <Text style={[styles.cell, styles.rowNumber]}>{row.rowNumber}</Text>
              {result.columns.map((col, index) => {
                const selected =
                  selectedCell?.rowNumber === row.rowNumber &&
                  selectedCell.outputItemId === col.outputItemId;
                return (
                  <Pressable
                    key={col.outputItemId}
                    accessibilityRole="button"
                    accessibilityLabel={`行${row.rowNumber} ${col.displayName}`}
                    accessibilityState={{ selected }}
                    onPress={() => onSelectCell(row.rowNumber, col.outputItemId)}
                    style={[
                      styles.cellPressable,
                      selected ? styles.cellSelected : null,
                      col.hasError ? styles.cellError : null,
                    ]}
                  >
                    <Text style={styles.cell} numberOfLines={1}>
                      {col.hasError ? '' : row.cells[index] ?? ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: {
    maxHeight: 140,
  },
  cell: {
    color: colors.text,
    fontSize: typography.small,
    minWidth: 96,
    paddingHorizontal: spacing.xs,
  },
  cellError: {
    backgroundColor: colors.overlay,
  },
  cellPressable: {
    borderColor: colors.border,
    borderRightWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minWidth: 96,
    paddingVertical: 2,
  },
  cellSelected: {
    backgroundColor: colors.overlay,
  },
  dataRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
  },
  empty: {
    color: colors.textMuted,
    fontSize: typography.body,
  },
  emptyBox: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.sm,
  },
  headerCell: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '600',
    minWidth: 96,
    paddingHorizontal: spacing.xs,
  },
  headerError: {
    color: colors.danger,
  },
  headerRow: {
    backgroundColor: colors.surfaceAlt,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingVertical: 4,
  },
  horizontal: {
    flex: 1,
  },
  rowNumber: {
    minWidth: 40,
  },
});

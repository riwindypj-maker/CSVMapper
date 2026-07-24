// 左側の入力列検索・一覧。
// キャンバスへ入力ノードを配置する入口として存在する。
// RELEVANT FILES: BlockToolbox.tsx, ../screens/MainScreen.tsx

import React from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { InputColumn } from '@csvmapper/contracts';

import { labels } from '../accessibility/labels';
import { colors, spacing, typography } from '../theme/tokens';

export interface InputColumnListProps {
  columns: readonly InputColumn[];
  searchQuery: string;
  editable: boolean;
  placedColumnIds: ReadonlySet<string>;
  onSearchChange: (query: string) => void;
  onPlaceColumn: (column: InputColumn) => void;
}

export function InputColumnList({
  columns,
  searchQuery,
  editable,
  placedColumnIds,
  onSearchChange,
  onPlaceColumn,
}: InputColumnListProps) {
  const filtered = columns.filter(c =>
    c.displayName.toLowerCase().includes(searchQuery.trim().toLowerCase()),
  );

  return (
    <View style={styles.container} accessibilityLabel={labels.inputList}>
      <Text style={styles.heading}>入力項目</Text>
      <TextInput
        accessibilityLabel={labels.inputSearch}
        editable={editable}
        placeholder="検索"
        placeholderTextColor={colors.textMuted}
        style={[styles.search, !editable ? styles.disabled : null]}
        value={searchQuery}
        onChangeText={onSearchChange}
      />
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {editable ? '一致する入力項目がありません' : labels.unloadedHint}
          </Text>
        }
        renderItem={({ item }) => {
          const placed = placedColumnIds.has(item.id);
          const disabled = !editable || placed;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`入力項目 ${item.displayName}${placed ? '（配置済み）' : ''}`}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => onPlaceColumn(item)}
              style={[styles.item, disabled ? styles.disabled : null]}
            >
              <Text style={styles.itemText}>{item.displayName}</Text>
              <Text style={styles.meta}>{placed ? '配置済み' : '配置'}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 120,
  },
  disabled: {
    opacity: 0.5,
  },
  empty: {
    color: colors.textMuted,
    fontSize: typography.small,
    padding: spacing.sm,
  },
  heading: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  item: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  itemText: {
    color: colors.text,
    flex: 1,
    fontSize: typography.body,
  },
  meta: {
    color: colors.textMuted,
    fontSize: typography.small,
  },
  search: {
    borderColor: colors.border,
    borderRadius: 4,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.body,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});

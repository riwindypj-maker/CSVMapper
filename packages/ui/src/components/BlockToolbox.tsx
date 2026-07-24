// 編集ブロックのカテゴリ別ツールボックス。
// キャンバスへブロックノードを追加するために存在する。
// RELEVANT FILES: InputColumnList.tsx, ../screens/MainScreen.tsx

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BlockInfo, BlockType } from '@csvmapper/contracts';

import { labels } from '../accessibility/labels';
import { colors, spacing, typography } from '../theme/tokens';

export interface BlockToolboxItem {
  label: string;
  block: BlockInfo;
}

export interface BlockToolboxCategory {
  title: string;
  items: readonly BlockToolboxItem[];
}

export const BLOCK_TOOLBOX_CATEGORIES: readonly BlockToolboxCategory[] = [
  {
    title: '削除',
    items: [
      {
        label: '先頭削除',
        block: {
          type: BlockType.FrontTrim,
          config: { kind: 'positionLength', position: 1, length: 1 },
        },
      },
      {
        label: '末尾削除',
        block: {
          type: BlockType.BackTrim,
          config: { kind: 'positionLength', position: 1, length: 1 },
        },
      },
      {
        label: '位置削除',
        block: {
          type: BlockType.DeleteAt,
          config: { kind: 'positionLength', position: 1, length: 1 },
        },
      },
      {
        label: '全削除',
        block: {
          type: BlockType.DeleteAll,
          config: { kind: 'stringPair', target: '', replacement: '' },
        },
      },
    ],
  },
  {
    title: '抽出',
    items: [
      {
        label: '部分抽出',
        block: {
          type: BlockType.Substring,
          config: { kind: 'positionLength', position: 1, length: 1 },
        },
      },
    ],
  },
  {
    title: '置換',
    items: [
      {
        label: '置換',
        block: {
          type: BlockType.Replace,
          config: { kind: 'stringPair', target: '', replacement: '' },
        },
      },
    ],
  },
  {
    title: '空白',
    items: [
      {
        label: '前後空白除去',
        block: { type: BlockType.Trim, config: { kind: 'empty' } },
      },
      {
        label: '空白除去',
        block: { type: BlockType.RemoveWhitespace, config: { kind: 'empty' } },
      },
    ],
  },
  {
    title: '大小文字',
    items: [
      {
        label: '大文字',
        block: { type: BlockType.ToUpper, config: { kind: 'empty' } },
      },
      {
        label: '小文字',
        block: { type: BlockType.ToLower, config: { kind: 'empty' } },
      },
    ],
  },
  {
    title: '固定文字',
    items: [
      {
        label: '先頭追加',
        block: {
          type: BlockType.Prefix,
          config: { kind: 'constant', value: '' },
        },
      },
      {
        label: '末尾追加',
        block: {
          type: BlockType.Suffix,
          config: { kind: 'constant', value: '' },
        },
      },
      {
        label: '固定値',
        block: {
          type: BlockType.Constant,
          config: { kind: 'constant', value: '' },
        },
      },
    ],
  },
  {
    title: '空文字',
    items: [
      {
        label: '空なら置換',
        block: {
          type: BlockType.ReplaceIfEmpty,
          config: { kind: 'constant', value: '' },
        },
      },
    ],
  },
  {
    title: '結合',
    items: [
      {
        label: '結合',
        block: {
          type: BlockType.Join,
          config: { kind: 'join', separator: '', ignoreEmpty: false },
        },
      },
    ],
  },
];

export interface BlockToolboxProps {
  editable: boolean;
  onAddBlock: (label: string, block: BlockInfo) => void;
}

export function BlockToolbox({ editable, onAddBlock }: BlockToolboxProps) {
  return (
    <View style={styles.container} accessibilityLabel={labels.blockToolbox}>
      <Text style={styles.heading}>編集ブロック</Text>
      <ScrollView>
        {BLOCK_TOOLBOX_CATEGORIES.map(category => (
          <View key={category.title} style={styles.category}>
            <Text style={styles.categoryTitle}>{category.title}</Text>
            {category.items.map(item => (
              <Pressable
                key={`${category.title}-${item.label}`}
                accessibilityRole="button"
                accessibilityLabel={`ブロック ${item.label} を追加`}
                accessibilityState={{ disabled: !editable }}
                disabled={!editable}
                onPress={() => onAddBlock(item.label, item.block)}
                style={[styles.item, !editable ? styles.disabled : null]}
              >
                <Text style={styles.itemText}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  category: {
    marginBottom: spacing.md,
  },
  categoryTitle: {
    color: colors.textMuted,
    fontSize: typography.small,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  container: {
    flex: 1,
    minHeight: 160,
  },
  disabled: {
    opacity: 0.5,
  },
  heading: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  item: {
    borderColor: colors.border,
    borderRadius: 4,
    borderWidth: 1,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  itemText: {
    color: colors.text,
    fontSize: typography.small,
  },
});

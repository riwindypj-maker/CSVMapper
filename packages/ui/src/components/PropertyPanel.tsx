// 選択要素に応じたプロパティ編集領域（SCR-002）。
// ブロック設定・出力名・入力サンプル表示を担うために存在する。
// RELEVANT FILES: OutputColumnList.tsx, ../screens/MainScreen.tsx

import React, { useMemo } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import {
  BlockInfo,
  BlockType,
  GraphNode,
  NodeKind,
  type BlockConfig,
} from '@csvmapper/contracts';

import { labels } from '../accessibility/labels';
import { colors, spacing, typography } from '../theme/tokens';

export interface PropertyPanelProps {
  selectedNodes: readonly GraphNode[];
  editable: boolean;
  /** 入力ノード用のサンプル文字列（デモ用）。 */
  inputSamples: ReadonlyMap<string, string>;
  onChangeOutputName: (nodeId: string, name: string) => void;
  onChangeBlockConfig: (nodeId: string, block: BlockInfo) => void;
}

function ConfigFields({
  block,
  editable,
  onChange,
}: {
  block: BlockInfo;
  editable: boolean;
  onChange: (next: BlockInfo) => void;
}) {
  const updateConfig = (config: BlockConfig) => {
    onChange({ type: block.type, config });
  };

  switch (block.config.kind) {
    case 'positionLength':
      return (
        <View>
          <Text style={styles.label}>開始位置（1始まり）</Text>
          <TextInput
            accessibilityLabel="開始位置"
            editable={editable}
            keyboardType="number-pad"
            style={styles.input}
            value={String(block.config.position)}
            onChangeText={text => {
              const position = Number.parseInt(text, 10);
              if (!Number.isFinite(position)) {
                return;
              }
              updateConfig({
                kind: 'positionLength',
                position,
                length: block.config.kind === 'positionLength' ? block.config.length : 1,
              });
            }}
          />
          <Text style={styles.label}>文字数</Text>
          <TextInput
            accessibilityLabel="文字数"
            editable={editable}
            keyboardType="number-pad"
            style={styles.input}
            value={String(block.config.length)}
            onChangeText={text => {
              const length = Number.parseInt(text, 10);
              if (!Number.isFinite(length)) {
                return;
              }
              updateConfig({
                kind: 'positionLength',
                position:
                  block.config.kind === 'positionLength' ? block.config.position : 1,
                length,
              });
            }}
          />
        </View>
      );
    case 'stringPair':
      return (
        <View>
          <Text style={styles.label}>検索文字列</Text>
          <TextInput
            accessibilityLabel="検索文字列"
            editable={editable}
            style={styles.input}
            value={block.config.target}
            onChangeText={target =>
              updateConfig({
                kind: 'stringPair',
                target,
                replacement:
                  block.config.kind === 'stringPair'
                    ? block.config.replacement
                    : '',
              })
            }
          />
          {block.type !== BlockType.DeleteAll ? (
            <>
              <Text style={styles.label}>置換文字列</Text>
              <TextInput
                accessibilityLabel="置換文字列"
                editable={editable}
                style={styles.input}
                value={block.config.replacement}
                onChangeText={replacement =>
                  updateConfig({
                    kind: 'stringPair',
                    target:
                      block.config.kind === 'stringPair' ? block.config.target : '',
                    replacement,
                  })
                }
              />
            </>
          ) : null}
        </View>
      );
    case 'constant':
      return (
        <View>
          <Text style={styles.label}>値</Text>
          <TextInput
            accessibilityLabel="固定値"
            editable={editable}
            style={styles.input}
            value={block.config.value}
            onChangeText={value => updateConfig({ kind: 'constant', value })}
          />
        </View>
      );
    case 'join':
      return (
        <View>
          <Text style={styles.label}>区切り文字</Text>
          <TextInput
            accessibilityLabel="区切り文字"
            editable={editable}
            style={styles.input}
            value={block.config.separator}
            onChangeText={separator =>
              updateConfig({
                kind: 'join',
                separator,
                ignoreEmpty:
                  block.config.kind === 'join' ? block.config.ignoreEmpty : false,
              })
            }
          />
          <Text style={styles.hint}>
            空文字を無視:{' '}
            {block.config.ignoreEmpty ? 'はい' : 'いいえ'}（順序6以降で切替）
          </Text>
        </View>
      );
    case 'empty':
    default:
      return <Text style={styles.hint}>このブロックに追加設定はありません</Text>;
  }
}

export function PropertyPanel({
  selectedNodes,
  editable,
  inputSamples,
  onChangeOutputName,
  onChangeBlockConfig,
}: PropertyPanelProps) {
  const content = useMemo(() => {
    if (selectedNodes.length === 0) {
      return <Text style={styles.hint}>{labels.noSelection}</Text>;
    }
    if (selectedNodes.length > 1) {
      return (
        <Text style={styles.hint}>
          {selectedNodes.length} 件選択中。単一選択で詳細を編集できます。
        </Text>
      );
    }

    const node = selectedNodes[0];
    if (node.kind === NodeKind.Input) {
      const sample = inputSamples.get(node.inputColumnId ?? '') ?? '(サンプルなし)';
      return (
        <View>
          <Text style={styles.title}>入力項目</Text>
          <Text style={styles.label}>表示名</Text>
          <Text style={styles.value}>{node.displayName}</Text>
          <Text style={styles.label}>サンプル</Text>
          <Text style={styles.value}>{sample}</Text>
        </View>
      );
    }

    if (node.kind === NodeKind.Output) {
      return (
        <View>
          <Text style={styles.title}>出力項目</Text>
          <Text style={styles.label}>名称</Text>
          <TextInput
            accessibilityLabel="出力項目名"
            editable={editable}
            style={styles.input}
            value={node.displayName}
            onChangeText={text => onChangeOutputName(node.id, text)}
          />
        </View>
      );
    }

    if (node.kind === NodeKind.Block && node.block) {
      return (
        <View>
          <Text style={styles.title}>編集ブロック</Text>
          <Text style={styles.label}>種別</Text>
          <Text style={styles.value}>{node.block.type}</Text>
          <Text style={styles.label}>表示名</Text>
          <Text style={styles.value}>{node.displayName}</Text>
          <ConfigFields
            block={node.block}
            editable={editable}
            onChange={next => onChangeBlockConfig(node.id, next)}
          />
        </View>
      );
    }

    return <Text style={styles.hint}>{labels.noSelection}</Text>;
  }, [
    selectedNodes,
    editable,
    inputSamples,
    onChangeOutputName,
    onChangeBlockConfig,
  ]);

  return (
    <View style={styles.container} accessibilityLabel={labels.propertyPanel}>
      <Text style={styles.heading}>プロパティ</Text>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heading: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  hint: {
    color: colors.textMuted,
    fontSize: typography.small,
  },
  input: {
    borderColor: colors.border,
    borderRadius: 4,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.body,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  label: {
    color: colors.textMuted,
    fontSize: typography.small,
    marginBottom: 2,
  },
  title: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  value: {
    color: colors.text,
    fontSize: typography.body,
    marginBottom: spacing.sm,
  },
});

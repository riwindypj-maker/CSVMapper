// SCR-004 エラー・警告一覧ダイアログ。
// 分類・概要表示と対象ノードへの移動を提供するために存在する。
// RELEVANT FILES: Toolbar.tsx, ../screens/MainScreen.tsx

import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { GraphIssue } from '@csvmapper/contracts';
import { IssueSeverity } from '@csvmapper/contracts';

import { labels } from '../accessibility/labels';
import { colors, spacing, typography } from '../theme/tokens';

export interface IssueListDialogProps {
  visible: boolean;
  issues: readonly GraphIssue[];
  onClose: () => void;
  onFocusIssue: (issue: GraphIssue) => void;
}

export function IssueListDialog({
  visible,
  issues,
  onClose,
  onFocusIssue,
}: IssueListDialogProps) {
  if (!visible) {
    return null;
  }

  const errors = issues.filter(i => i.severity === IssueSeverity.Error);
  const warnings = issues.filter(i => i.severity === IssueSeverity.Warning);

  // react-native-macos + New Architecture では ModalHostView の Fabric 実装が
  // OSX 向けに未提供のため、Modal ではなく親画面上の絶対配置オーバーレイを使う。
  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      {/* 背面へのクリック透過を防ぎ、外側タップで閉じる。 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={labels.closeIssues}
        onPress={onClose}
        style={styles.backdrop}
      />
      <View
        style={styles.dialog}
        accessibilityLabel={labels.issueListDialog}
      >
        <Text style={styles.title}>{labels.openIssues}</Text>
        <Text style={styles.summary}>
          エラー {errors.length} / 警告 {warnings.length}
        </Text>
        <ScrollView style={styles.list}>
          {issues.length === 0 ? (
            <Text style={styles.empty}>問題はありません</Text>
          ) : (
            issues.map((issue, index) => (
              <View key={`${issue.code}-${issue.nodeId ?? ''}-${index}`} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.severity}>
                    {issue.severity === IssueSeverity.Error ? 'エラー' : '警告'}
                  </Text>
                  <Text style={styles.message}>{issue.message}</Text>
                  <Text style={styles.code}>{issue.code}</Text>
                </View>
                {issue.nodeId ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={labels.focusIssueTarget}
                    onPress={() => onFocusIssue(issue)}
                    style={styles.focusButton}
                  >
                    <Text style={styles.focusText}>対象へ移動</Text>
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={labels.closeIssues}
          onPress={onClose}
          style={styles.close}
        >
          <Text style={styles.closeText}>閉じる</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  close: {
    alignSelf: 'flex-end',
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  closeText: {
    color: colors.accent,
    fontSize: typography.body,
  },
  code: {
    color: colors.textMuted,
    fontSize: typography.small,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    maxHeight: '70%',
    padding: spacing.md,
    width: 480,
    zIndex: 1,
  },
  empty: {
    color: colors.textMuted,
    fontSize: typography.body,
  },
  focusButton: {
    borderColor: colors.border,
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  focusText: {
    color: colors.text,
    fontSize: typography.small,
  },
  list: {
    marginTop: spacing.sm,
  },
  message: {
    color: colors.text,
    fontSize: typography.body,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  rowText: {
    flex: 1,
    marginRight: spacing.sm,
  },
  severity: {
    color: colors.warning,
    fontSize: typography.small,
    fontWeight: '600',
  },
  summary: {
    color: colors.textMuted,
    fontSize: typography.small,
  },
  title: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '600',
  },
});

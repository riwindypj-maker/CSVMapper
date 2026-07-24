// ボタン・ノード・端子向けのアクセシブル名称を集約する。
// 色以外でも状態を伝え、UI-003 の検証を安定させるために存在する。
// RELEVANT FILES: ../canvas/NodeView.tsx, ../components/Toolbar.tsx

import { NodeKind } from '@csvmapper/contracts';

export const labels = {
  mainScreen: 'メイン画面',
  toolbar: 'ツールバー',
  leftPane: '素材領域',
  canvas: 'マッピングキャンバス',
  rightPane: '出力とプロパティ領域',
  preview: 'プレビュー領域',
  inputSearch: '入力項目検索',
  inputList: '入力項目一覧',
  blockToolbox: '編集ブロックツールボックス',
  outputList: '出力項目一覧',
  propertyPanel: 'プロパティ領域',
  previewRowCount: 'プレビュー件数',
  previewStale: 'プレビュー未更新',
  previewEmpty: 'プレビューはまだありません',
  selectCsv: 'CSVを選択',
  resetSession: '初期化',
  undo: '元に戻す',
  redo: 'やり直す',
  autoLayout: '自動整列',
  previewAction: 'プレビュー（準備中）',
  openIssues: 'エラー確認（準備中）',
  exportCsv: 'CSV出力（準備中）',
  addOutput: '出力項目を追加',
  zoomIn: 'ズームイン',
  zoomOut: 'ズームアウト',
  fitAll: '全体表示',
  unloadedHint: 'CSVを読み込むと編集できます',
  noSelection: 'ノードまたは出力項目を選択すると設定を表示します',
  reloadCsvConfirmTitle: 'CSVを再読込しますか？',
  reloadCsvConfirmMessage:
    '現在のマッピングと Undo / Redo 履歴がクリアされます。',
  confirmReload: '再読込',
  connectRejectedTitle: '接続できません',
  resetConfirmTitle: 'セッションを初期化しますか？',
  resetConfirmMessage:
    '入力 CSV、マッピング、出力項目、履歴、プレビューをすべて破棄します。',
  confirmReset: '初期化',
  cancel: 'キャンセル',
} as const;

export function nodeKindLabel(kind: NodeKind): string {
  switch (kind) {
    case NodeKind.Input:
      return '入力';
    case NodeKind.Block:
      return '編集ブロック';
    case NodeKind.Output:
      return '出力';
    default:
      return 'ノード';
  }
}

export function nodeAccessibilityLabel(params: {
  kind: NodeKind;
  displayName: string;
  selected: boolean;
  focused: boolean;
  errorCount: number;
  warningCount: number;
  connectionCount: number;
}): string {
  const parts = [
    nodeKindLabel(params.kind),
    params.displayName,
    `接続${params.connectionCount}件`,
  ];
  if (params.selected) {
    parts.push('選択中');
  }
  if (params.focused) {
    parts.push('キーボードフォーカス');
  }
  if (params.errorCount > 0) {
    parts.push(`エラー${params.errorCount}件`);
  } else if (params.warningCount > 0) {
    parts.push(`警告${params.warningCount}件`);
  } else {
    parts.push('正常');
  }
  return parts.join('、');
}

export function portAccessibilityLabel(params: {
  direction: 'input' | 'output';
  nodeName: string;
  connected: boolean;
  connectable: boolean;
}): string {
  const dir = params.direction === 'input' ? '入力端子' : '出力端子';
  const connected = params.connected ? '接続済み' : '未接続';
  const connectable = params.connectable ? '接続可能' : '接続不可';
  return `${params.nodeName}の${dir}、${connected}、${connectable}`;
}

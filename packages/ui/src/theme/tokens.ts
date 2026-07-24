// UI 全体で共有する色・寸法トークン。
// 画面レイアウトとキャンバス見た目を一箇所で揃えるために存在する。
// RELEVANT FILES: ../screens/MainScreen.tsx, ../canvas/NodeView.tsx

/** 紫系・クリーム系を避けた落ち着いた作業画面向けパレット。 */
export const colors = {
  background: '#E8EEF2',
  surface: '#F7FAFC',
  surfaceAlt: '#DDE5EC',
  border: '#9AA8B5',
  borderStrong: '#5B6B7A',
  text: '#1A2430',
  textMuted: '#5A6A7A',
  accent: '#1F6F8B',
  accentMuted: '#4A90A8',
  danger: '#B33A3A',
  warning: '#A67C2D',
  selection: '#2E7D9A',
  focusRing: '#0B3D4D',
  disabled: '#B7C2CC',
  canvasGrid: '#C5D0DA',
  nodeInput: '#F0F4F7',
  nodeBlock: '#E4EDF2',
  nodeOutput: '#D8E6EC',
  portReady: '#1F6F8B',
  portBlocked: '#8A969F',
  edge: '#3D5263',
  overlay: 'rgba(31, 111, 139, 0.18)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const layout = {
  toolbarHeight: 48,
  leftPaneWidth: 280,
  rightPaneWidth: 320,
  previewHeight: 240,
  canvasMinWidth: 480,
  nodeWidth: 148,
  nodeHeight: 60,
  portSize: 14,
} as const;

export const typography = {
  title: 16,
  body: 13,
  small: 11,
} as const;

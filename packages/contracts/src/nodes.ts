// キャンバス上のノード DTO を定義する。
// 入力・ブロック・出力の共通形状を契約層で固定するために存在する。
// RELEVANT FILES: blocks.ts, edges.ts, ids.ts

import type { BlockInfo } from './blocks';
import type { InputColumnId, NodeId } from './ids';

/** ノードの種別。 */
export enum NodeKind {
  Input = 'Input',
  Block = 'Block',
  Output = 'Output',
}

/** キャンバス座標（整数ピクセル）。 */
export interface CanvasPoint {
  x: number;
  y: number;
}

/** 入力 CSV 列の一覧要素（キャンバス配置の有無とは独立）。 */
export interface InputColumn {
  id: InputColumnId;
  displayName: string;
}

/** キャンバス上のノード。 */
export interface GraphNode {
  id: NodeId;
  kind: NodeKind;
  displayName: string;
  position: CanvasPoint;
  /** Input ノードが参照する入力列。同一列はキャンバスに 1 ノードだけ。 */
  inputColumnId?: InputColumnId;
  block?: BlockInfo;
}

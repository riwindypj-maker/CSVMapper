// 処理スナップショットとコマンド結果の契約を定義する。
// Application が状態を変更不能な形で受け渡すために存在する。
// RELEVANT FILES: nodes.ts, edges.ts, issues.ts

import type { GraphEdge } from './edges';
import type { GraphErrorCode } from './issues';
import type { GraphNode, InputColumn } from './nodes';
import type { NodeId } from './ids';

/** 編集中グラフの変更不能な写し。 */
export interface GraphSnapshot {
  inputColumns: readonly InputColumn[];
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  outputOrder: readonly NodeId[];
}

/** コマンド成功時。 */
export interface CommandSuccess {
  ok: true;
}

/** コマンド失敗時。状態は変更しない。 */
export interface CommandFailure {
  ok: false;
  code: GraphErrorCode;
  message: string;
}

export type CommandResult = CommandSuccess | CommandFailure;

// 接続辺の DTO を定義する。
// 端子間接続と Join のプロパティ順を契約として共有するために存在する。
// RELEVANT FILES: nodes.ts, ids.ts, ../application/src/graph/model.ts

import type { EdgeId, NodeId } from './ids';

/** ノード間の有向接続。 */
export interface GraphEdge {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  /**
   * Join ブロックへの入力辺だけが使う結合順。
   * 接続時刻ではなくプロパティ順として評価に使う。
   */
  joinOrder: number;
}

// グラフ要素を一意に識別する ID 型を定義する。
// レイヤ間で同じ識別子契約を共有するために存在する。
// RELEVANT FILES: nodes.ts, edges.ts, ../application/src/session/store.ts

/** ノードを区別する ID。 */
export type NodeId = string;

/** 接続を区別する ID。 */
export type EdgeId = string;

/** 入力 CSV 列を区別する ID（キャンバス配置前の一覧用）。 */
export type InputColumnId = string;

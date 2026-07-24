// Undo/Redo 用のスナップショット履歴を管理する。
// 履歴対象操作だけを積み、選択やズームを混ぜないために存在する。
// RELEVANT FILES: store.ts, ../graph/model.ts

import type { GraphModel } from '../graph/model';

/** 履歴に保存する文書状態（一時 UI 状態は含めない）。 */
export interface DocumentSnapshot {
  graph: GraphModel;
}

/**
 * 現在位置を基準に undo / redo スタックを保持する。
 * 新しい変更を積むと redo 側は破棄する。
 */
export class HistoryStack {
  private past: DocumentSnapshot[] = [];
  private future: DocumentSnapshot[] = [];

  clear(): void {
    this.past = [];
    this.future = [];
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** 変更前の状態を past に積み、redo を空にする。 */
  pushBeforeChange(before: DocumentSnapshot): void {
    this.past.push({ graph: before.graph.clone() });
    this.future = [];
  }

  undo(current: DocumentSnapshot): DocumentSnapshot | undefined {
    if (this.past.length === 0) {
      return undefined;
    }
    const previous = this.past.pop()!;
    this.future.push({ graph: current.graph.clone() });
    return { graph: previous.graph.clone() };
  }

  redo(current: DocumentSnapshot): DocumentSnapshot | undefined {
    if (this.future.length === 0) {
      return undefined;
    }
    const next = this.future.pop()!;
    this.past.push({ graph: current.graph.clone() });
    return { graph: next.graph.clone() };
  }
}

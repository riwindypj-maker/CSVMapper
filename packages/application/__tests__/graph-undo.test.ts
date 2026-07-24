// GRAPH-006 の Undo/Redo 統合テスト。
// 履歴対象操作と一時 UI 状態の分離を固定するために存在する。
// RELEVANT FILES: ../src/session/store.ts, ../../docs/tests/transformation-graph.md

import { BlockType } from '@csvmapper/contracts';

import { MappingSession } from '../src/session/store';

describe('GRAPH-006 Undo/Redo', () => {
  test('ノード追加・複数移動・自動整列を操作単位で復元する', () => {
    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);

    expect(session.addInputNode('in1', 'col-a', { x: 10, y: 10 }).ok).toBe(
      true,
    );
    expect(
      session.addBlockNode('b1', 'upper', { x: 100, y: 10 }, {
        type: BlockType.ToUpper,
        config: { kind: 'empty' },
      }).ok,
    ).toBe(true);
    expect(session.addOutputNode('out1', 'o1', { x: 200, y: 10 }).ok).toBe(
      true,
    );
    const afterAdd = snapshotPositions(session);

    const moves = new Map([
      ['in1', { x: 20, y: 40 }],
      ['b1', { x: 120, y: 40 }],
      ['out1', { x: 220, y: 40 }],
    ]);
    expect(session.moveNodes(moves).ok).toBe(true);
    const afterMove = snapshotPositions(session);
    expect(afterMove.in1).toEqual({ x: 20, y: 40 });

    expect(session.autoLayout().ok).toBe(true);
    const afterLayout = snapshotPositions(session);
    expect(afterLayout).not.toEqual(afterMove);

    // ズーム・選択は履歴に入れない（ズームは 25%〜200% にクランプ）。
    session.setZoom(1.5);
    session.setSelection(['b1', 'out1']);
    session.setScroll(30, 40);
    expect(session.getTransientUi().zoom).toBe(1.5);
    expect([...session.getTransientUi().selection].sort()).toEqual([
      'b1',
      'out1',
    ]);

    expect(session.undo()).toBe(true);
    expect(snapshotPositions(session)).toEqual(afterMove);
    expect(session.getTransientUi().zoom).toBe(1.5);
    expect([...session.getTransientUi().selection].sort()).toEqual([
      'b1',
      'out1',
    ]);
    expect(session.getTransientUi().scrollX).toBe(30);

    expect(session.undo()).toBe(true);
    expect(snapshotPositions(session)).toEqual(afterAdd);

    expect(session.redo()).toBe(true);
    expect(snapshotPositions(session)).toEqual(afterMove);

    expect(session.redo()).toBe(true);
    expect(snapshotPositions(session)).toEqual(afterLayout);
    expect(session.getTransientUi().zoom).toBe(1.5);
  });

  test('空の removeNodes は履歴を増やさない', () => {
    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(session.canUndo).toBe(true);
    const revision = session.getRevision();

    expect(session.removeNodes([]).ok).toBe(true);
    expect(session.getNodes()).toHaveLength(1);
    expect(session.canUndo).toBe(true);
    expect(session.getRevision()).toBe(revision);
  });

  test('複数ノード削除は 1 つの Undo ステップになる', () => {
    const session = new MappingSession();
    session.replaceInputColumns([
      { id: 'col-a', displayName: 'a' },
      { id: 'col-b', displayName: 'b' },
    ]);
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(session.addInputNode('in2', 'col-b', { x: 40, y: 0 }).ok).toBe(true);
    expect(session.addOutputNode('out1', 'o1', { x: 120, y: 0 }).ok).toBe(true);
    expect(session.getNodes()).toHaveLength(3);

    expect(session.removeNodes(['in1', 'in2', 'out1']).ok).toBe(true);
    expect(session.getNodes()).toHaveLength(0);
    expect(session.canUndo).toBe(true);

    expect(session.undo()).toBe(true);
    expect(session.getNodes().map(n => n.id).sort()).toEqual([
      'in1',
      'in2',
      'out1',
    ]);
    // 個別削除ではないため、もう 1 回の Undo で追加前まで戻らない（追加 3 件は残る）。
    expect(session.canUndo).toBe(true);
    expect(session.undo()).toBe(true);
    expect(session.getNodes()).toHaveLength(2);
  });

  test('複数接続削除は 1 つの Undo ステップになる', () => {
    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(session.addOutputNode('out1', 'o1', { x: 200, y: 0 }).ok).toBe(true);
    expect(session.addOutputNode('out2', 'o2', { x: 200, y: 80 }).ok).toBe(true);
    expect(session.addEdge('e1', 'in1', 'out1').ok).toBe(true);
    expect(session.addEdge('e2', 'in1', 'out2').ok).toBe(true);

    expect(session.removeEdges(['e1', 'e2']).ok).toBe(true);
    expect(session.getEdges()).toHaveLength(0);

    expect(session.undo()).toBe(true);
    expect(session.getEdges().map(e => e.id).sort()).toEqual(['e1', 'e2']);
  });

  test('接続線選択とノード選択は排他', () => {
    const session = new MappingSession();
    session.setSelection(['n1']);
    session.setEdgeSelection(['e1']);
    expect(session.getTransientUi().selection.size).toBe(0);
    expect([...session.getTransientUi().edgeSelection]).toEqual(['e1']);

    session.setSelection(['n2']);
    expect([...session.getTransientUi().selection]).toEqual(['n2']);
    expect(session.getTransientUi().edgeSelection.size).toBe(0);
  });
});

function snapshotPositions(
  session: MappingSession,
): Record<string, { x: number; y: number }> {
  const result: Record<string, { x: number; y: number }> = {};
  for (const node of session.getNodes()) {
    result[node.id] = { ...node.position };
  }
  return result;
}

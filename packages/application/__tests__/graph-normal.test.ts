// GRAPH-001〜005 の正常系ドメイン/統合テスト。
// 接続・分岐・Join 順・削除・出力順の期待値を固定するために存在する。
// RELEVANT FILES: ../src/session/store.ts, ../../docs/tests/transformation-graph.md

import {
  BlockType,
  GraphErrorCode,
  IssueSeverity,
} from '@csvmapper/contracts';

import { MappingSession } from '../src/session/store';

function readySession(): MappingSession {
  const session = new MappingSession();
  session.replaceInputColumns([
    { id: 'col-a', displayName: 'a' },
    { id: 'col-b', displayName: 'b' },
    { id: 'col-name', displayName: 'name' },
  ]);
  return session;
}

describe('GRAPH-001 許可接続とトポロジカル評価', () => {
  test('入力→出力が非巡回で通過する', () => {
    const session = readySession();
    expect(
      session.addInputNode('in1', 'col-name', { x: 0, y: 0 }).ok,
    ).toBe(true);
    expect(session.addOutputNode('out1', 'output', { x: 200, y: 0 }).ok).toBe(
      true,
    );
    expect(session.addEdge('e1', 'in1', 'out1').ok).toBe(true);
    expect(session.isAcyclic()).toBe(true);
    const values = session.evaluate({ in1: 'Alice' });
    expect(values.get('out1')).toBe('Alice');
  });

  test('入力→ブロック→出力をトポロジカル順で評価する', () => {
    const session = readySession();
    expect(session.addInputNode('in1', 'col-name', { x: 0, y: 0 }).ok).toBe(
      true,
    );
    expect(
      session.addBlockNode('b1', 'upper', { x: 100, y: 0 }, {
        type: BlockType.ToUpper,
        config: { kind: 'empty' },
      }).ok,
    ).toBe(true);
    expect(session.addOutputNode('out1', 'output', { x: 200, y: 0 }).ok).toBe(
      true,
    );
    expect(session.addEdge('e1', 'in1', 'b1').ok).toBe(true);
    expect(session.addEdge('e2', 'b1', 'out1').ok).toBe(true);
    expect(session.isAcyclic()).toBe(true);
    const values = session.evaluate({ in1: 'Alice' });
    // Application の軽量評価は単入力を通過させ、順序整合を確認する。
    expect(values.get('out1')).toBe('Alice');
    expect(values.get('b1')).toBe('Alice');
  });

  test('ブロック→ブロック接続も非巡回を保つ', () => {
    const session = readySession();
    expect(session.addInputNode('in1', 'col-name', { x: 0, y: 0 }).ok).toBe(
      true,
    );
    expect(
      session.addBlockNode('b1', 'trim', { x: 80, y: 0 }, {
        type: BlockType.Trim,
        config: { kind: 'empty' },
      }).ok,
    ).toBe(true);
    expect(
      session.addBlockNode('b2', 'upper', { x: 160, y: 0 }, {
        type: BlockType.ToUpper,
        config: { kind: 'empty' },
      }).ok,
    ).toBe(true);
    expect(session.addOutputNode('out1', 'output', { x: 240, y: 0 }).ok).toBe(
      true,
    );
    expect(session.addEdge('e1', 'in1', 'b1').ok).toBe(true);
    expect(session.addEdge('e2', 'b1', 'b2').ok).toBe(true);
    expect(session.addEdge('e3', 'b2', 'out1').ok).toBe(true);
    expect(session.isAcyclic()).toBe(true);
  });
});

describe('GRAPH-002 分岐評価', () => {
  test('1 入力を 2 出力へ独立に分岐する', () => {
    const session = readySession();
    expect(session.addInputNode('in1', 'col-name', { x: 0, y: 0 }).ok).toBe(
      true,
    );
    expect(session.addOutputNode('out1', 'o1', { x: 200, y: 0 }).ok).toBe(true);
    expect(session.addOutputNode('out2', 'o2', { x: 200, y: 80 }).ok).toBe(
      true,
    );
    expect(session.addEdge('e1', 'in1', 'out1').ok).toBe(true);
    expect(session.addEdge('e2', 'in1', 'out2').ok).toBe(true);
    const values = session.evaluate({ in1: 'X' });
    expect(values.get('out1')).toBe('X');
    expect(values.get('out2')).toBe('X');
  });
});

describe('GRAPH-003 Join のプロパティ順', () => {
  test('接続時刻ではなくプロパティ順で結合する', () => {
    const session = readySession();
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(session.addInputNode('in2', 'col-b', { x: 0, y: 80 }).ok).toBe(true);
    expect(
      session.addBlockNode('b1', 'join', { x: 120, y: 40 }, {
        type: BlockType.Join,
        config: { kind: 'join', separator: ',', ignoreEmpty: true },
      }).ok,
    ).toBe(true);
    expect(session.addOutputNode('out1', 'output', { x: 280, y: 40 }).ok).toBe(
      true,
    );
    expect(session.addEdge('e1', 'in1', 'b1').ok).toBe(true);
    expect(session.addEdge('e2', 'in2', 'b1').ok).toBe(true);
    expect(session.addEdge('e3', 'b1', 'out1').ok).toBe(true);
    expect(session.setJoinInputOrder('b1', ['e2', 'e1']).ok).toBe(true);
    const values = session.evaluate({ in1: 'A', in2: 'B' });
    expect(values.get('out1')).toBe('B,A');
  });

  test('同じ接続元を含む 100 入力を結合できる', () => {
    const session = readySession();
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(
      session.addBlockNode('b1', 'join', { x: 120, y: 0 }, {
        type: BlockType.Join,
        config: { kind: 'join', separator: '', ignoreEmpty: false },
      }).ok,
    ).toBe(true);
    expect(session.addOutputNode('out1', 'output', { x: 280, y: 0 }).ok).toBe(
      true,
    );
    for (let i = 0; i < 100; i++) {
      expect(session.addEdge(`e${i}`, 'in1', 'b1').ok).toBe(true);
    }
    expect(session.addEdge('e-out', 'b1', 'out1').ok).toBe(true);
    const reversed = Array.from({ length: 100 }, (_, i) => `e${99 - i}`);
    expect(session.setJoinInputOrder('b1', reversed).ok).toBe(true);
    const values = session.evaluate({ in1: 'Z' });
    expect(values.get('out1')).toBe('Z'.repeat(100));
  });

  test('Join 入力辺削除後も結合順が連番のまま評価できる', () => {
    const session = readySession();
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(session.addInputNode('in2', 'col-b', { x: 0, y: 80 }).ok).toBe(true);
    expect(session.addInputNode('in3', 'col-name', { x: 0, y: 160 }).ok).toBe(
      true,
    );
    expect(
      session.addBlockNode('b1', 'join', { x: 120, y: 40 }, {
        type: BlockType.Join,
        config: { kind: 'join', separator: '-', ignoreEmpty: false },
      }).ok,
    ).toBe(true);
    expect(session.addOutputNode('out1', 'output', { x: 280, y: 40 }).ok).toBe(
      true,
    );
    expect(session.addEdge('e1', 'in1', 'b1').ok).toBe(true);
    expect(session.addEdge('e2', 'in2', 'b1').ok).toBe(true);
    expect(session.addEdge('e3', 'in3', 'b1').ok).toBe(true);
    expect(session.addEdge('e-out', 'b1', 'out1').ok).toBe(true);
    expect(session.setJoinInputOrder('b1', ['e2', 'e1', 'e3']).ok).toBe(true);

    expect(session.removeEdge('e1').ok).toBe(true);
    expect(
      session.getIssues().some(i => i.code === GraphErrorCode.InvalidJoinOrder),
    ).toBe(false);
    const edges = new Map(session.getEdges().map(e => [e.id, e]));
    expect(edges.get('e2')?.joinOrder).toBe(0);
    expect(edges.get('e3')?.joinOrder).toBe(1);

    const values = session.evaluate({ in2: 'B', in3: 'C' });
    expect(values.get('out1')).toBe('B-C');
  });

  test('Join へ接続する入力ノード削除後も結合順が連番のまま残る', () => {
    const session = readySession();
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(session.addInputNode('in2', 'col-b', { x: 0, y: 80 }).ok).toBe(true);
    expect(session.addInputNode('in3', 'col-name', { x: 0, y: 160 }).ok).toBe(
      true,
    );
    expect(
      session.addBlockNode('b1', 'join', { x: 120, y: 40 }, {
        type: BlockType.Join,
        config: { kind: 'join', separator: ',', ignoreEmpty: false },
      }).ok,
    ).toBe(true);
    expect(session.addOutputNode('out1', 'output', { x: 280, y: 40 }).ok).toBe(
      true,
    );
    expect(session.addEdge('e1', 'in1', 'b1').ok).toBe(true);
    expect(session.addEdge('e2', 'in2', 'b1').ok).toBe(true);
    expect(session.addEdge('e3', 'in3', 'b1').ok).toBe(true);
    expect(session.addEdge('e-out', 'b1', 'out1').ok).toBe(true);

    expect(session.removeNode('in2').ok).toBe(true);
    expect(
      session.getIssues().some(i => i.code === GraphErrorCode.InvalidJoinOrder),
    ).toBe(false);
    const edges = new Map(session.getEdges().map(e => [e.id, e]));
    expect(edges.get('e1')?.joinOrder).toBe(0);
    expect(edges.get('e3')?.joinOrder).toBe(1);
  });
});

describe('GRAPH-004 ノード削除', () => {
  test('関連辺だけを削除し入力項目一覧は維持する', () => {
    const session = readySession();
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(session.addOutputNode('out1', 'o1', { x: 200, y: 0 }).ok).toBe(true);
    expect(session.addEdge('e1', 'in1', 'out1').ok).toBe(true);
    expect(session.removeNode('out1').ok).toBe(true);
    expect(session.getEdges()).toHaveLength(0);
    expect(session.getInputColumns().map(c => c.id)).toEqual([
      'col-a',
      'col-b',
      'col-name',
    ]);
    expect(session.getNodes().some(n => n.id === 'in1')).toBe(true);
  });
});

describe('GRAPH-005 出力順', () => {
  test('一覧順が出力列順になる', () => {
    const session = readySession();
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(session.addOutputNode('out1', 'o1', { x: 200, y: 0 }).ok).toBe(true);
    expect(session.addOutputNode('out2', 'o2', { x: 200, y: 80 }).ok).toBe(
      true,
    );
    expect(session.addEdge('e1', 'in1', 'out1').ok).toBe(true);
    expect(session.addEdge('e2', 'in1', 'out2').ok).toBe(true);
    expect(session.setOutputOrder(['out2', 'out1']).ok).toBe(true);
    expect([...session.getOutputOrder()]).toEqual(['out2', 'out1']);
  });
});

describe('補助: 問題一覧の重大度', () => {
  test('未接続出力は警告として識別する', () => {
    const session = readySession();
    expect(session.addOutputNode('out1', 'o1', { x: 0, y: 0 }).ok).toBe(true);
    const warning = session
      .getIssues()
      .find(i => i.code === GraphErrorCode.UnconnectedOutput);
    expect(warning?.severity).toBe(IssueSeverity.Warning);
  });
});

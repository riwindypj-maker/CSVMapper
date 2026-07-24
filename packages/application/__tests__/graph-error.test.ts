// GRAPH-E001〜E005 の異常系ドメイン/統合テスト。
// 禁止接続・Join 境界・必須不足・エラー優先・履歴破棄を固定するために存在する。
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
    { id: 'col-c', displayName: 'c' },
  ]);
  return session;
}

describe('GRAPH-E001 禁止接続', () => {
  test('出力を接続元にできない', () => {
    const session = readySession();
    expect(session.addOutputNode('out1', 'o1', { x: 0, y: 0 }).ok).toBe(true);
    expect(session.addOutputNode('out2', 'o2', { x: 100, y: 0 }).ok).toBe(true);
    const result = session.addEdge('e1', 'out1', 'out2');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(GraphErrorCode.OutputAsSource);
    }
    expect(session.getEdges()).toHaveLength(0);
  });

  test('入力を接続先にできない', () => {
    const session = readySession();
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(session.addInputNode('in2', 'col-b', { x: 100, y: 0 }).ok).toBe(
      true,
    );
    const result = session.addEdge('e1', 'in1', 'in2');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(GraphErrorCode.InputAsTarget);
    }
  });

  test('自己接続を拒否する', () => {
    const session = readySession();
    expect(
      session.addBlockNode('b1', 'upper', { x: 0, y: 0 }, {
        type: BlockType.ToUpper,
        config: { kind: 'empty' },
      }).ok,
    ).toBe(true);
    const result = session.addEdge('e1', 'b1', 'b1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(GraphErrorCode.SelfLoop);
    }
  });

  test('循環を生む接続を拒否する', () => {
    const session = readySession();
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(
      session.addBlockNode('b1', 'b1', { x: 80, y: 0 }, {
        type: BlockType.ToUpper,
        config: { kind: 'empty' },
      }).ok,
    ).toBe(true);
    expect(
      session.addBlockNode('b2', 'b2', { x: 160, y: 0 }, {
        type: BlockType.ToUpper,
        config: { kind: 'empty' },
      }).ok,
    ).toBe(true);
    expect(session.addEdge('e1', 'in1', 'b1').ok).toBe(true);
    expect(session.addEdge('e2', 'b1', 'b2').ok).toBe(true);
    const result = session.addEdge('e3', 'b2', 'b1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(GraphErrorCode.WouldCreateCycle);
    }
    expect(session.getEdges()).toHaveLength(2);
  });

  test('1 入力ブロックへの複数入力を拒否する', () => {
    const session = readySession();
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(session.addInputNode('in2', 'col-b', { x: 0, y: 80 }).ok).toBe(true);
    expect(
      session.addBlockNode('b1', 'upper', { x: 100, y: 40 }, {
        type: BlockType.ToUpper,
        config: { kind: 'empty' },
      }).ok,
    ).toBe(true);
    expect(session.addEdge('e1', 'in1', 'b1').ok).toBe(true);
    const result = session.addEdge('e2', 'in2', 'b1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(GraphErrorCode.TooManyInputs);
    }
  });
});

describe('GRAPH-E002 Join 入力境界', () => {
  test('0 件はエラー、1 件は警告、101 件目は接続拒否', () => {
    const session = readySession();
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(
      session.addBlockNode('b1', 'join', { x: 100, y: 0 }, {
        type: BlockType.Join,
        config: { kind: 'join', separator: ',', ignoreEmpty: true },
      }).ok,
    ).toBe(true);
    expect(session.addOutputNode('out1', 'o1', { x: 220, y: 0 }).ok).toBe(true);
    expect(session.addEdge('e-out', 'b1', 'out1').ok).toBe(true);

    expect(
      session
        .getIssues()
        .some(
          i =>
            i.nodeId === 'b1' &&
            i.code === GraphErrorCode.MissingInput &&
            i.severity === IssueSeverity.Error,
        ),
    ).toBe(true);

    expect(session.addEdge('e0', 'in1', 'b1').ok).toBe(true);
    expect(
      session
        .getIssues()
        .some(
          i =>
            i.nodeId === 'b1' &&
            i.code === GraphErrorCode.JoinSingleInput &&
            i.severity === IssueSeverity.Warning,
        ),
    ).toBe(true);

    for (let i = 1; i < 100; i++) {
      expect(session.addEdge(`e${i}`, 'in1', 'b1').ok).toBe(true);
    }
    const overflow = session.addEdge('e100', 'in1', 'b1');
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) {
      expect(overflow.code).toBe(GraphErrorCode.TooManyInputs);
    }
    expect(session.getEdges().filter(e => e.to === 'b1')).toHaveLength(100);
  });
});

describe('GRAPH-E003 必須不足', () => {
  test('出力 0 件をエラーにする', () => {
    const session = readySession();
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(
      session
        .getIssues()
        .some(
          i =>
            i.code === GraphErrorCode.NoOutputs &&
            i.severity === IssueSeverity.Error,
        ),
    ).toBe(true);
  });

  test('名称未入力の出力をエラーにする', () => {
    const session = readySession();
    expect(session.addOutputNode('out1', '', { x: 0, y: 0 }).ok).toBe(true);
    expect(
      session
        .getIssues()
        .some(
          i =>
            i.nodeId === 'out1' &&
            i.code === GraphErrorCode.NoOutputName &&
            i.severity === IssueSeverity.Error,
        ),
    ).toBe(true);
  });

  test('必須設定不足をエラーにする', () => {
    const session = readySession();
    expect(
      session.addBlockNode('b1', 'replace', { x: 0, y: 0 }, {
        type: BlockType.Replace,
        config: { kind: 'stringPair', target: '', replacement: 'x' },
      }).ok,
    ).toBe(true);
    expect(session.addOutputNode('out1', 'o1', { x: 100, y: 0 }).ok).toBe(true);
    expect(
      session
        .getIssues()
        .some(
          i =>
            i.nodeId === 'b1' &&
            i.code === GraphErrorCode.MissingRequiredConfig &&
            i.severity === IssueSeverity.Error,
        ),
    ).toBe(true);
  });
});

describe('GRAPH-E004 エラー優先', () => {
  test('入力不足かつ未使用のブロックはエラーだけを表示する', () => {
    const session = readySession();
    expect(
      session.addBlockNode('b1', 'upper', { x: 0, y: 0 }, {
        type: BlockType.ToUpper,
        config: { kind: 'empty' },
      }).ok,
    ).toBe(true);
    expect(session.addOutputNode('out1', 'o1', { x: 100, y: 0 }).ok).toBe(true);

    const nodeIssues = session.getIssues().filter(i => i.nodeId === 'b1');
    expect(nodeIssues.some(i => i.code === GraphErrorCode.MissingInput)).toBe(
      true,
    );
    expect(nodeIssues.every(i => i.severity === IssueSeverity.Error)).toBe(
      true,
    );
    expect(
      nodeIssues.some(i => i.code === GraphErrorCode.UnusedBlock),
    ).toBe(false);
  });

  test('出力へ到達しない中間ブロックにも未使用警告を付ける', () => {
    const session = readySession();
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(
      session.addBlockNode('b1', 'a', { x: 80, y: 0 }, {
        type: BlockType.ToUpper,
        config: { kind: 'empty' },
      }).ok,
    ).toBe(true);
    expect(
      session.addBlockNode('b2', 'b', { x: 160, y: 0 }, {
        type: BlockType.ToUpper,
        config: { kind: 'empty' },
      }).ok,
    ).toBe(true);
    expect(session.addOutputNode('out1', 'o1', { x: 300, y: 0 }).ok).toBe(true);
    expect(session.addEdge('e1', 'in1', 'b1').ok).toBe(true);
    expect(session.addEdge('e2', 'b1', 'b2').ok).toBe(true);

    const issues = session.getIssues();
    expect(
      issues.some(
        i =>
          i.nodeId === 'b1' &&
          i.code === GraphErrorCode.UnusedBlock &&
          i.severity === IssueSeverity.Warning,
      ),
    ).toBe(true);
    expect(
      issues.some(
        i =>
          i.nodeId === 'b2' &&
          i.code === GraphErrorCode.UnusedBlock &&
          i.severity === IssueSeverity.Warning,
      ),
    ).toBe(true);
  });
});

describe('GRAPH-E005 履歴破棄', () => {
  test('入力 CSV 変更後は変更前の Undo/Redo を実行できない', () => {
    const session = readySession();
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(session.addOutputNode('out1', 'o1', { x: 100, y: 0 }).ok).toBe(true);
    expect(session.canUndo).toBe(true);

    session.replaceInputColumns([{ id: 'col-z', displayName: 'z' }]);
    expect(session.canUndo).toBe(false);
    expect(session.canRedo).toBe(false);
    expect(session.undo()).toBe(false);
    expect(session.redo()).toBe(false);
    expect(session.getNodes()).toHaveLength(0);
    expect(session.getInputColumns()).toEqual([
      { id: 'col-z', displayName: 'z' },
    ]);
  });
});

// 自動整列（dagre）の座標計算テスト。
// Hermes 互換と UI ノード寸法との一致を固定するために存在する。
// RELEVANT FILES: ../src/layout/autoLayout.ts, ../src/session/store.ts

import { BlockType } from '@csvmapper/contracts';

import { GraphModel } from '../src/graph/model';
import { computeAutoLayout } from '../src/layout/autoLayout';
import { MappingSession } from '../src/session/store';

describe('computeAutoLayout', () => {
  test('空グラフは空の座標マップを返す', () => {
    expect(computeAutoLayout(new GraphModel()).size).toBe(0);
  });

  test('ノード無しの autoLayout は成功する', () => {
    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    expect(session.getNodes()).toHaveLength(0);
    expect(session.autoLayout().ok).toBe(true);
  });

  test('structuredClone が無くても整列できる（Hermes 相当）', () => {
    const original = globalThis.structuredClone;
    // @ts-expect-error Hermes と同様に未定義へ落とす
    delete globalThis.structuredClone;

    try {
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
      expect(session.addEdge('e1', 'in1', 'b1').ok).toBe(true);
      expect(session.addEdge('e2', 'b1', 'out1').ok).toBe(true);

      const before = session.getNodes().map(n => ({ ...n.position }));
      expect(session.autoLayout().ok).toBe(true);
      const after = session.getNodes().map(n => ({ ...n.position }));
      expect(after).not.toEqual(before);

      // LR 整列なので入力より出力の x が大きい。
      const byId = new Map(session.getNodes().map(n => [n.id, n.position]));
      expect(byId.get('out1')!.x).toBeGreaterThan(byId.get('in1')!.x);
    } finally {
      globalThis.structuredClone = original;
    }
  });
});

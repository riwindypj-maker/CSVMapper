// MappingSession の購読・フォーカス消費・簡易 phase を検証する。
// UI の useSyncExternalStore 前提が壊れていないことを保証するために存在する。
// RELEVANT FILES: ../src/session/store.ts, graph-normal.test.ts

import { MappingSession } from '../src/session/store';

describe('MappingSession subscribe / phase', () => {
  test('未読込は unloaded、列投入後は editable', () => {
    const session = new MappingSession();
    expect(session.getPhase()).toBe('unloaded');
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    expect(session.getPhase()).toBe('editable');
    session.resetSession();
    expect(session.getPhase()).toBe('unloaded');
  });

  test('変更時に subscribe リスナーが呼ばれる', () => {
    const session = new MappingSession();
    const listener = jest.fn();
    const unsubscribe = session.subscribe(listener);

    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    expect(listener).toHaveBeenCalledTimes(1);

    session.setSelection(['n1']);
    expect(listener).toHaveBeenCalledTimes(2);

    const before = session.getRevision();
    session.setZoom(1);
    expect(session.getRevision()).toBe(before);

    session.setZoom(1.5);
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    session.setSearchQuery('x');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  test('consumeFocusRequest は一度だけ値を返しクリアする', () => {
    const session = new MappingSession();
    const listener = jest.fn();
    session.subscribe(listener);

    session.requestFocus('node-1');
    expect(session.getTransientUi().focusRequest).toBe('node-1');
    expect(listener).toHaveBeenCalledTimes(1);

    expect(session.consumeFocusRequest()).toBe('node-1');
    expect(session.getTransientUi().focusRequest).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(session.consumeFocusRequest()).toBeNull();
  });

  test('ズームは 25%〜200% にクランプする', () => {
    const session = new MappingSession();
    session.setZoom(0.1);
    expect(session.getTransientUi().zoom).toBe(0.25);
    session.setZoom(5);
    expect(session.getTransientUi().zoom).toBe(2);
  });

  test('replaceInputColumns はズームとスクロールを初期化する', () => {
    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    session.setZoom(1.5);
    session.setScroll(40, 60);
    session.replaceInputColumns([{ id: 'col-b', displayName: 'b' }]);
    const ui = session.getTransientUi();
    expect(ui.zoom).toBe(1);
    expect(ui.scrollX).toBe(0);
    expect(ui.scrollY).toBe(0);
  });
});

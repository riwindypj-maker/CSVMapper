// メイン画面シェルとアクセシビリティ・ショートカットのコンポーネントテスト。
// UI-003 / UI-004 / UI-E001 のコアを Node 上で固定するために存在する。
// RELEVANT FILES: ../src/screens/MainScreen.tsx, ../src/keyboard/shortcuts.ts

import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { MappingSession } from '@csvmapper/application';

import { labels } from '../src/accessibility/labels';
import { resolveShortcut } from '../src/keyboard/shortcuts';
import { layout } from '../src/theme/tokens';
import {
  computeFitAllView,
  dispatchUiShortcut,
  MainScreen,
} from '../src/screens/MainScreen';

describe('MainScreen shell', () => {
  test('主要領域が描画される', async () => {
    const session = new MappingSession();
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<MainScreen session={session} />);
    });

    const root = renderer!.root;
    expect(
      root.findAll(node => node.props.accessibilityLabel === labels.mainScreen)
        .length,
    ).toBeGreaterThan(0);
    expect(
      root.findAll(node => node.props.accessibilityLabel === labels.toolbar)
        .length,
    ).toBeGreaterThan(0);
    expect(
      root.findAll(node => node.props.accessibilityLabel === labels.leftPane)
        .length,
    ).toBeGreaterThan(0);
    expect(
      root.findAll(node => node.props.accessibilityLabel === labels.canvas)
        .length,
    ).toBeGreaterThan(0);
    expect(
      root.findAll(node => node.props.accessibilityLabel === labels.rightPane)
        .length,
    ).toBeGreaterThan(0);
    expect(
      root.findAll(node => node.props.accessibilityLabel === labels.preview)
        .length,
    ).toBeGreaterThan(0);
  });

  test('UI-E001 未読込時は編集系が無効', async () => {
    const session = new MappingSession();
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<MainScreen session={session} />);
    });

    const undo = renderer!.root.findByProps({
      accessibilityLabel: labels.undo,
    });
    const autoLayout = renderer!.root.findByProps({
      accessibilityLabel: labels.autoLayout,
    });
    const preview = renderer!.root.findByProps({
      accessibilityLabel: labels.previewAction,
    });
    const exportCsv = renderer!.root.findByProps({
      accessibilityLabel: labels.exportCsv,
    });

    expect(undo.props.accessibilityState?.disabled).toBe(true);
    expect(autoLayout.props.accessibilityState?.disabled).toBe(true);
    expect(preview.props.accessibilityState?.disabled).toBe(true);
    expect(exportCsv.props.accessibilityState?.disabled).toBe(true);
  });

  test('CSV モック読込後は編集可能になる', async () => {
    const session = new MappingSession();
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<MainScreen session={session} />);
    });

    const selectCsv = renderer!.root.findByProps({
      accessibilityLabel: labels.selectCsv,
    });
    await ReactTestRenderer.act(() => {
      selectCsv.props.onPress();
    });

    expect(session.getPhase()).toBe('editable');
    expect(session.getInputColumns()).toHaveLength(4);

    const autoLayout = renderer!.root.findByProps({
      accessibilityLabel: labels.autoLayout,
    });
    expect(autoLayout.props.accessibilityState?.disabled).toBe(false);
  });
});

describe('UI-003 accessibility labels', () => {
  test('ツールバーボタンにアクセシブル名称がある', async () => {
    const session = new MappingSession();
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<MainScreen session={session} />);
    });
    for (const label of [
      labels.selectCsv,
      labels.resetSession,
      labels.undo,
      labels.redo,
      labels.autoLayout,
    ]) {
      expect(
        renderer!.root.findByProps({ accessibilityLabel: label }),
      ).toBeTruthy();
    }
  });
});

describe('UI-004 shortcuts', () => {
  test('resolveShortcut が主要操作を解決する', () => {
    expect(
      resolveShortcut({ key: 'z', metaKey: true, ctrlKey: false, shiftKey: false }),
    ).toBe('undo');
    expect(
      resolveShortcut({ key: 'z', metaKey: true, ctrlKey: false, shiftKey: true }),
    ).toBe('redo');
    expect(
      resolveShortcut({ key: 'a', metaKey: true, ctrlKey: false, shiftKey: false }),
    ).toBe('selectAll');
    expect(
      resolveShortcut({ key: 'f', metaKey: true, ctrlKey: false, shiftKey: false }),
    ).toBe('focusSearch');
    expect(
      resolveShortcut({
        key: 'Delete',
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
      }),
    ).toBe('delete');
    expect(
      resolveShortcut({ key: '0', metaKey: true, ctrlKey: false, shiftKey: false }),
    ).toBe('fitAll');
  });

  test('ショートカット経由で Undo が動く', async () => {
    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    await ReactTestRenderer.act(() => {
      ReactTestRenderer.create(<MainScreen session={session} />);
    });

    await ReactTestRenderer.act(() => {
      expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(
        true,
      );
    });
    expect(session.getNodes()).toHaveLength(1);

    await ReactTestRenderer.act(() => {
      dispatchUiShortcut(session, {
        key: 'z',
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
      });
    });
    expect(session.getNodes()).toHaveLength(0);
  });

  test('複数選択削除は 1 回の Undo でまとめて戻る', async () => {
    const session = new MappingSession();
    session.replaceInputColumns([
      { id: 'col-a', displayName: 'a' },
      { id: 'col-b', displayName: 'b' },
    ]);
    await ReactTestRenderer.act(() => {
      ReactTestRenderer.create(<MainScreen session={session} />);
    });

    await ReactTestRenderer.act(() => {
      expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(
        true,
      );
      expect(session.addInputNode('in2', 'col-b', { x: 40, y: 0 }).ok).toBe(
        true,
      );
      session.setSelection(['in1', 'in2']);
    });

    await ReactTestRenderer.act(() => {
      dispatchUiShortcut(session, {
        key: 'Delete',
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
      });
    });
    expect(session.getNodes()).toHaveLength(0);

    await ReactTestRenderer.act(() => {
      dispatchUiShortcut(session, {
        key: 'z',
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
      });
    });
    expect(session.getNodes().map(n => n.id).sort()).toEqual(['in1', 'in2']);
  });

  test('ルート View がフォーカス可能', async () => {
    const session = new MappingSession();
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<MainScreen session={session} />);
    });
    const root = renderer!.root.findByProps({
      accessibilityLabel: labels.mainScreen,
    });
    expect(root.props.focusable).toBe(true);
  });
});

describe('CSV 再読込の確認', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('編集可能中の再選択は確認後にだけ反映する', async () => {
    const session = new MappingSession();
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<MainScreen session={session} />);
    });

    const selectCsv = renderer!.root.findByProps({
      accessibilityLabel: labels.selectCsv,
    });
    await ReactTestRenderer.act(() => {
      selectCsv.props.onPress();
    });
    expect(session.getPhase()).toBe('editable');

    await ReactTestRenderer.act(() => {
      expect(
        session.addInputNode('in1', 'col-name', { x: 10, y: 20 }).ok,
      ).toBe(true);
    });
    expect(session.getNodes()).toHaveLength(1);
    await ReactTestRenderer.act(() => {
      session.setZoom(1.5);
      session.setScroll(25, 35);
    });

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    await ReactTestRenderer.act(() => {
      selectCsv.props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe(labels.reloadCsvConfirmTitle);
    expect(session.getNodes()).toHaveLength(1);

    const buttons = alertSpy.mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    const confirm = buttons.find(b => b.text === labels.confirmReload);
    expect(confirm?.onPress).toBeTruthy();

    await ReactTestRenderer.act(() => {
      confirm!.onPress!();
    });
    expect(session.getNodes()).toHaveLength(0);
    expect(session.getInputColumns()).toHaveLength(4);
    expect(session.getTransientUi().zoom).toBe(1);
    expect(session.getTransientUi().scrollX).toBe(0);
    expect(session.getTransientUi().scrollY).toBe(0);
  });

  test('確認を取り消すと作業状態を維持する', async () => {
    const session = new MappingSession();
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<MainScreen session={session} />);
    });
    const selectCsv = renderer!.root.findByProps({
      accessibilityLabel: labels.selectCsv,
    });
    await ReactTestRenderer.act(() => {
      selectCsv.props.onPress();
    });
    await ReactTestRenderer.act(() => {
      expect(
        session.addInputNode('in1', 'col-name', { x: 0, y: 0 }).ok,
      ).toBe(true);
    });

    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await ReactTestRenderer.act(() => {
      selectCsv.props.onPress();
    });
    // 取消相当: onPress を呼ばない
    expect(session.getNodes()).toHaveLength(1);
  });
});

describe('初期化の確認', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('確認後にだけ未読込へ戻る', async () => {
    const session = new MappingSession();
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<MainScreen session={session} />);
    });

    await ReactTestRenderer.act(() => {
      renderer!.root
        .findByProps({ accessibilityLabel: labels.selectCsv })
        .props.onPress();
    });
    await ReactTestRenderer.act(() => {
      expect(
        session.addInputNode('in1', 'col-name', { x: 0, y: 0 }).ok,
      ).toBe(true);
    });
    expect(session.getPhase()).toBe('editable');

    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    const reset = renderer!.root.findByProps({
      accessibilityLabel: labels.resetSession,
    });
    await ReactTestRenderer.act(() => {
      reset.props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe(labels.resetConfirmTitle);
    expect(session.getPhase()).toBe('editable');
    expect(session.getNodes()).toHaveLength(1);

    const buttons = alertSpy.mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    const confirm = buttons.find(b => b.text === labels.confirmReset);
    expect(confirm?.onPress).toBeTruthy();

    await ReactTestRenderer.act(() => {
      confirm!.onPress!();
    });
    expect(session.getPhase()).toBe('unloaded');
    expect(session.getNodes()).toHaveLength(0);
    expect(session.getInputColumns()).toHaveLength(0);
  });

  test('確認を取り消すと編集可能のまま維持する', async () => {
    const session = new MappingSession();
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<MainScreen session={session} />);
    });
    await ReactTestRenderer.act(() => {
      renderer!.root
        .findByProps({ accessibilityLabel: labels.selectCsv })
        .props.onPress();
    });
    await ReactTestRenderer.act(() => {
      expect(
        session.addInputNode('in1', 'col-name', { x: 0, y: 0 }).ok,
      ).toBe(true);
    });

    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await ReactTestRenderer.act(() => {
      renderer!.root
        .findByProps({ accessibilityLabel: labels.resetSession })
        .props.onPress();
    });
    expect(session.getPhase()).toBe('editable');
    expect(session.getNodes()).toHaveLength(1);
  });
});

describe('computeFitAllView', () => {
  test('translate→scale 相当で中心合わせする', () => {
    const nodes = [{ position: { x: 100, y: 200 } }];
    const viewW = 800;
    const viewH = 500;
    const result = computeFitAllView(nodes, viewW, viewH);
    const cx = 100 + layout.nodeWidth / 2;
    const cy = 200 + layout.nodeHeight / 2;
    // screen = (world + scroll) * zoom → 中心が viewport 中央
    expect((cx + result.scrollX) * result.zoom).toBeCloseTo(viewW / 2, 5);
    expect((cy + result.scrollY) * result.zoom).toBeCloseTo(viewH / 2, 5);
    expect(result.zoom).toBeGreaterThan(0);
    expect(result.zoom).toBeLessThanOrEqual(2);
  });

  test('ノードなしは初期ビュー', () => {
    expect(computeFitAllView([], 800, 500)).toEqual({
      zoom: 1,
      scrollX: 0,
      scrollY: 0,
    });
  });
});

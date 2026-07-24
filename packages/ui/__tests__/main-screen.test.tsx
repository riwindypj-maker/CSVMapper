// メイン画面シェルとアクセシビリティ・ショートカットのコンポーネントテスト。
// UI-003 / UI-004 / UI-E001 のコアを Node 上で固定するために存在する。
// RELEVANT FILES: ../src/screens/MainScreen.tsx, ../src/keyboard/shortcuts.ts

import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {
  InMemoryProcessingGateway,
  MappingSession,
} from '@csvmapper/application';

import { labels } from '../src/accessibility/labels';
import { resolveShortcut } from '../src/keyboard/shortcuts';
import { layout } from '../src/theme/tokens';
import {
  computeFitAllView,
  computeZoomAroundViewCenter,
  dispatchUiShortcut,
  MainScreen,
} from '../src/screens/MainScreen';

const TEST_FILE = {
  path: '/tmp/ui-test.csv',
  size: 32,
  modifiedTimeMs: 1,
};

const TEST_COLUMNS = [
  { id: 'col-0', displayName: '名前' },
  { id: 'col-1', displayName: 'メール' },
  { id: 'col-2', displayName: '市区町村' },
  { id: 'col-3', displayName: '備考' },
] as const;

function makeGateway(): InMemoryProcessingGateway {
  const gateway = new InMemoryProcessingGateway();
  gateway.setFixture({
    file: TEST_FILE,
    csvText: '名前,メール,市区町村,備考\na,b,c,d\n',
  });
  gateway.setPickResult({ cancelled: false, file: TEST_FILE });
  return gateway;
}

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
    const deleteBtn = renderer!.root.findByProps({
      accessibilityLabel: labels.deleteSelection,
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
    expect(deleteBtn.props.accessibilityState?.disabled).toBe(true);
    expect(autoLayout.props.accessibilityState?.disabled).toBe(true);
    expect(preview.props.accessibilityState?.disabled).toBe(true);
    expect(exportCsv.props.accessibilityState?.disabled).toBe(true);
  });

  test('CSV 読込後は編集可能になる', async () => {
    const session = new MappingSession();
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<MainScreen session={session} />);
    });

    await ReactTestRenderer.act(() => {
      session.replaceInputColumns([
        { id: 'col-name', displayName: '名前' },
        { id: 'col-email', displayName: 'メール' },
        { id: 'col-city', displayName: '市区町村' },
        { id: 'col-note', displayName: '備考' },
      ]);
    });

    expect(session.getPhase()).toBe('editable');
    expect(session.getInputColumns()).toHaveLength(4);

    const autoLayout = renderer!.root.findByProps({
      accessibilityLabel: labels.autoLayout,
    });
    expect(autoLayout.props.accessibilityState?.disabled).toBe(false);
  });

  test('PREVIEW-E002 エラー時は CSV 出力が無効', async () => {
    const session = new MappingSession();
    await ReactTestRenderer.act(() => {
      session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    });
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<MainScreen session={session} />);
    });
    const exportCsv = renderer!.root.findByProps({
      accessibilityLabel: labels.exportCsv,
    });
    expect(exportCsv.props.accessibilityState?.disabled).toBe(true);
  });

  test('件数 UI は 100/500/1000 のみ', async () => {
    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<MainScreen session={session} />);
    });
    for (const count of [100, 500, 1000]) {
      expect(
        renderer!.root.findByProps({
          accessibilityLabel: `プレビュー件数 ${count}`,
        }),
      ).toBeTruthy();
    }
  });

  test('問題一覧から対象へ移動できる', async () => {
    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    session.addInputNode('in-a', 'col-a', { x: 0, y: 0 });
    session.addOutputNode('out-1', 'o', { x: 80, y: 0 });
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<MainScreen session={session} />);
    });
    const openIssues = renderer!.root.findAll(
      node =>
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.includes(labels.openIssues),
    )[0];
    await ReactTestRenderer.act(() => {
      openIssues.props.onPress();
    });
    const focus = renderer!.root.findByProps({
      accessibilityLabel: labels.focusIssueTarget,
    });
    await ReactTestRenderer.act(() => {
      focus.props.onPress();
    });
    // requestFocus 後に consume 済みなら null。フォーカス要求が処理されたことを確認する。
    expect(session.getTransientUi().focusRequest).toBeNull();
  });

  test('問題一覧の背景タップで閉じられる', async () => {
    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<MainScreen session={session} />);
    });
    const openIssues = renderer!.root.findAll(
      node =>
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.includes(labels.openIssues),
    )[0];
    await ReactTestRenderer.act(() => {
      openIssues.props.onPress();
    });
    expect(
      renderer!.root.findByProps({ accessibilityLabel: labels.issueListDialog }),
    ).toBeTruthy();
    const closeButtons = renderer!.root.findAll(
      node => node.props.accessibilityLabel === labels.closeIssues,
    );
    // 背景と閉じるボタンの両方がクリックを受け取る。
    expect(closeButtons.length).toBeGreaterThanOrEqual(2);
    await ReactTestRenderer.act(() => {
      closeButtons[0].props.onPress();
    });
    expect(
      renderer!.root.findAll(
        node => node.props.accessibilityLabel === labels.issueListDialog,
      ),
    ).toHaveLength(0);
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
      labels.deleteSelection,
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

  test('削除ボタンで選択ノードを削除できる', async () => {
    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<MainScreen session={session} />);
    });

    await ReactTestRenderer.act(() => {
      expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(
        true,
      );
      session.setSelection(['in1']);
    });

    const deleteBtn = renderer!.root.findByProps({
      accessibilityLabel: labels.deleteSelection,
    });
    expect(deleteBtn.props.accessibilityState?.disabled).toBe(false);

    await ReactTestRenderer.act(() => {
      deleteBtn.props.onPress();
    });
    expect(session.getNodes()).toHaveLength(0);
    expect(session.getTransientUi().selection.size).toBe(0);
  });

  test('選択した接続線を Delete で削除できる', async () => {
    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    await ReactTestRenderer.act(() => {
      ReactTestRenderer.create(<MainScreen session={session} />);
    });

    await ReactTestRenderer.act(() => {
      expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(
        true,
      );
      expect(session.addOutputNode('out1', 'o1', { x: 200, y: 0 }).ok).toBe(
        true,
      );
      expect(session.addEdge('e1', 'in1', 'out1').ok).toBe(true);
      session.setEdgeSelection(['e1']);
    });

    await ReactTestRenderer.act(() => {
      dispatchUiShortcut(session, {
        key: 'Delete',
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
      });
    });
    expect(session.getEdges()).toHaveLength(0);
    expect(session.getNodes()).toHaveLength(2);
    expect(session.getTransientUi().edgeSelection.size).toBe(0);

    await ReactTestRenderer.act(() => {
      dispatchUiShortcut(session, {
        key: 'z',
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
      });
    });
    expect(session.getEdges().map(e => e.id)).toEqual(['e1']);
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
    const gateway = makeGateway();
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <MainScreen session={session} gateway={gateway} />,
      );
    });

    const selectCsv = renderer!.root.findByProps({
      accessibilityLabel: labels.selectCsv,
    });
    await ReactTestRenderer.act(async () => {
      selectCsv.props.onPress();
    });
    // イベント反映を待つ
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
    expect(session.getPhase()).toBe('editable');

    await ReactTestRenderer.act(() => {
      expect(session.addInputNode('in1', 'col-0', { x: 10, y: 20 }).ok).toBe(
        true,
      );
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

    await ReactTestRenderer.act(async () => {
      confirm!.onPress!();
      await Promise.resolve();
    });
    expect(session.getNodes()).toHaveLength(0);
    expect(session.getInputColumns()).toHaveLength(4);
    expect(session.getTransientUi().zoom).toBe(1);
    expect(session.getTransientUi().scrollX).toBe(0);
    expect(session.getTransientUi().scrollY).toBe(0);
  });

  test('確認を取り消すと作業状態を維持する', async () => {
    const session = new MappingSession();
    await ReactTestRenderer.act(() => {
      session.replaceInputColumns([...TEST_COLUMNS]);
    });
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<MainScreen session={session} />);
    });
    const selectCsv = renderer!.root.findByProps({
      accessibilityLabel: labels.selectCsv,
    });
    await ReactTestRenderer.act(() => {
      expect(session.addInputNode('in1', 'col-0', { x: 0, y: 0 }).ok).toBe(
        true,
      );
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
    await ReactTestRenderer.act(() => {
      session.replaceInputColumns([...TEST_COLUMNS]);
    });
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<MainScreen session={session} />);
    });
    await ReactTestRenderer.act(() => {
      expect(session.addInputNode('in1', 'col-0', { x: 0, y: 0 }).ok).toBe(
        true,
      );
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
    await ReactTestRenderer.act(() => {
      session.replaceInputColumns([...TEST_COLUMNS]);
    });
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<MainScreen session={session} />);
    });
    await ReactTestRenderer.act(() => {
      expect(session.addInputNode('in1', 'col-0', { x: 0, y: 0 }).ok).toBe(
        true,
      );
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

describe('computeZoomAroundViewCenter', () => {
  test('ズーム前後でビューポート中心のワールド座標が変わらない', () => {
    const viewW = 800;
    const viewH = 500;
    const currentZoom = 1;
    const scrollX = -40;
    const scrollY = 20;
    const worldAtCenterX = viewW / (2 * currentZoom) - scrollX;
    const worldAtCenterY = viewH / (2 * currentZoom) - scrollY;

    const next = computeZoomAroundViewCenter(
      currentZoom,
      currentZoom * 1.1,
      scrollX,
      scrollY,
      viewW,
      viewH,
    );

    expect(next.zoom).toBeCloseTo(1.1, 8);
    expect(viewW / (2 * next.zoom) - next.scrollX).toBeCloseTo(
      worldAtCenterX,
      8,
    );
    expect(viewH / (2 * next.zoom) - next.scrollY).toBeCloseTo(
      worldAtCenterY,
      8,
    );
  });

  test('上限クランプ時は scroll を変えない', () => {
    expect(
      computeZoomAroundViewCenter(2, 2 * 1.1, 10, 20, 800, 500),
    ).toEqual({ zoom: 2, scrollX: 10, scrollY: 20 });
  });
});

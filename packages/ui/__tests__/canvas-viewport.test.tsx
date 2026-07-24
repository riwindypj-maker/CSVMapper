// CanvasViewport の接続下書きと端子接続可否のコンポーネントテスト。
// 不正接続時の下書き保持と入力端子の接続可能条件を固定するために存在する。
// RELEVANT FILES: ../src/canvas/CanvasViewport.tsx, ../src/canvas/PortView.tsx

import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { MappingSession } from '@csvmapper/application';
import { BlockType, NodeKind } from '@csvmapper/contracts';
// RN Jest の measureInWindow はデフォルトでコールバックを呼ばないため同期実装に差し替える。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MockNativeMethods = require('react-native/jest/MockNativeMethods')
  .default as {
  measureInWindow: jest.Mock;
};

import {
  buildWorldTransform,
  CanvasViewport,
  computeWorldBounds,
  hitTestInputPort,
  pageToModel,
  PORT_HIT_RADIUS,
  resolveViewportPageOrigin,
  WORLD_CONTENT_PAD,
} from '../src/canvas/CanvasViewport';
import { NodeView } from '../src/canvas/NodeView';
import {
  computeCanvasScrollMetrics,
  scrollFromOffsets,
} from '../src/canvas/canvasScroll';
import { labels, portAccessibilityLabel, edgeAccessibilityLabel } from '../src/accessibility/labels';
import { layout } from '../src/theme/tokens';

beforeEach(() => {
  MockNativeMethods.measureInWindow.mockImplementation(
    (cb: (x: number, y: number) => void) => {
      cb(0, 0);
    },
  );
});

afterEach(() => {
  MockNativeMethods.measureInWindow.mockReset();
});

/** 左上原点で style.transform を左から順に適用した画面座標。 */
function mapWorldPointWithTopLeftOrigin(
  x: number,
  y: number,
  transform: ReturnType<typeof buildWorldTransform>,
): { x: number; y: number } {
  let px = x;
  let py = y;
  for (const step of transform) {
    if ('scale' in step) {
      px *= step.scale;
      py *= step.scale;
    } else if ('translateX' in step) {
      px += step.translateX;
    } else if ('translateY' in step) {
      py += step.translateY;
    }
  }
  return { x: px, y: py };
}

function mountCanvas(params: {
  session: MappingSession;
  connectSourceId: string | null;
  onConnectSourceChange: (id: string | null) => void;
}) {
  const snapshotNodes = params.session.getNodes();
  return ReactTestRenderer.create(
    <CanvasViewport
      session={params.session}
      nodes={snapshotNodes}
      edges={params.session.getEdges()}
      issues={params.session.getIssues()}
      selection={new Set()}
      edgeSelection={new Set()}
      zoom={1}
      scrollX={0}
      scrollY={0}
      editable
      keyboardFocusId={null}
      connectSourceId={params.connectSourceId}
      onConnectSourceChange={params.onConnectSourceChange}
    />,
  );
}

describe('CanvasViewport 接続', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('入力端子は接続元未選択時は接続不可', async () => {
    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(session.addOutputNode('out1', 'o1', { x: 200, y: 0 }).ok).toBe(true);

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = mountCanvas({
        session,
        connectSourceId: null,
        onConnectSourceChange: () => undefined,
      });
    });

    const inputPort = renderer!.root.findByProps({
      accessibilityLabel: portAccessibilityLabel({
        direction: 'input',
        nodeName: 'o1',
        connected: false,
        connectable: false,
      }),
    });
    expect(inputPort.props.accessibilityState?.disabled).toBe(true);
  });

  test('出力ソース選択中は入力端子が接続可能になる', async () => {
    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(session.addOutputNode('out1', 'o1', { x: 200, y: 0 }).ok).toBe(true);

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = mountCanvas({
        session,
        connectSourceId: 'in1',
        onConnectSourceChange: () => undefined,
      });
    });

    const inputPort = renderer!.root.findByProps({
      accessibilityLabel: portAccessibilityLabel({
        direction: 'input',
        nodeName: 'o1',
        connected: false,
        connectable: true,
      }),
    });
    expect(inputPort.props.accessibilityState?.disabled).toBe(false);
  });

  test('キーボード経路の不正接続では下書きを残し、Alert で理由を出す', async () => {
    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(
      session.addBlockNode('b1', 'upper', { x: 100, y: 0 }, {
        type: BlockType.ToUpper,
        config: { kind: 'empty' },
      }).ok,
    ).toBe(true);
    expect(session.addEdge('e1', 'in1', 'b1').ok).toBe(true);

    const onConnectSourceChange = jest.fn();
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = mountCanvas({
        session,
        connectSourceId: 'in1',
        onConnectSourceChange,
      });
    });

    const inputPort = renderer!.root.findByProps({
      accessibilityLabel: portAccessibilityLabel({
        direction: 'input',
        nodeName: 'upper',
        connected: true,
        connectable: true,
      }),
    });

    await ReactTestRenderer.act(() => {
      inputPort.props.onPress();
    });

    expect(session.getEdges()).toHaveLength(1);
    expect(onConnectSourceChange).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][1]).toMatch(/1 入力/);
  });

  test('出力ドラッグを入力端子で離すと辺が追加される', async () => {
    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(session.addOutputNode('out1', 'o1', { x: 200, y: 0 }).ok).toBe(true);

    let connectSourceId: string | null = null;
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = mountCanvas({
        session,
        connectSourceId,
        onConnectSourceChange: id => {
          connectSourceId = id;
        },
      });
    });

    const inputNode = session.getNodes().find(n => n.id === 'out1');
    expect(inputNode).toBeTruthy();
    const dropX = inputNode!.position.x;
    const dropY = inputNode!.position.y + layout.nodeHeight / 2;

    const sourceView = renderer!.root
      .findAllByType(NodeView)
      .find(n => n.props.node.id === 'in1');
    expect(sourceView).toBeTruthy();

    await ReactTestRenderer.act(() => {
      sourceView!.props.onPortDragStart('output');
      renderer!.update(
        <CanvasViewport
          session={session}
          nodes={session.getNodes()}
          edges={session.getEdges()}
          issues={session.getIssues()}
          selection={new Set()}
          edgeSelection={new Set()}
          zoom={1}
          scrollX={0}
          scrollY={0}
          editable
          keyboardFocusId={null}
          connectSourceId={connectSourceId}
          onConnectSourceChange={id => {
            connectSourceId = id;
          }}
        />,
      );
    });

    expect(connectSourceId).toBe('in1');

    // page = viewportPage(0) + (model + scroll) * zoom。テストは viewport 原点を 0 とみなす。
    await ReactTestRenderer.act(() => {
      const updatedSource = renderer!.root
        .findAllByType(NodeView)
        .find(n => n.props.node.id === 'in1');
      updatedSource!.props.onPortDragMove(dropX, dropY);
      updatedSource!.props.onPortDragEnd(dropX, dropY);
    });

    expect(session.getEdges()).toHaveLength(1);
    expect(session.getEdges()[0]?.from).toBe('in1');
    expect(session.getEdges()[0]?.to).toBe('out1');
    expect(connectSourceId).toBeNull();
  });

  test('出力ドラッグを空座標で離すと接続をキャンセルする', async () => {
    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(session.addOutputNode('out1', 'o1', { x: 200, y: 0 }).ok).toBe(true);

    let connectSourceId: string | null = null;
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = mountCanvas({
        session,
        connectSourceId,
        onConnectSourceChange: id => {
          connectSourceId = id;
        },
      });
    });

    const sourceView = renderer!.root
      .findAllByType(NodeView)
      .find(n => n.props.node.id === 'in1');

    await ReactTestRenderer.act(() => {
      sourceView!.props.onPortDragStart('output');
      renderer!.update(
        <CanvasViewport
          session={session}
          nodes={session.getNodes()}
          edges={session.getEdges()}
          issues={session.getIssues()}
          selection={new Set()}
          edgeSelection={new Set()}
          zoom={1}
          scrollX={0}
          scrollY={0}
          editable
          keyboardFocusId={null}
          connectSourceId={connectSourceId}
          onConnectSourceChange={id => {
            connectSourceId = id;
          }}
        />,
      );
    });

    await ReactTestRenderer.act(() => {
      const updatedSource = renderer!.root
        .findAllByType(NodeView)
        .find(n => n.props.node.id === 'in1');
      updatedSource!.props.onPortDragEnd(5000, 5000);
    });

    expect(session.getEdges()).toHaveLength(0);
    expect(connectSourceId).toBeNull();
  });

  test('ドラッグの不正接続では Alert 後に下書きをクリアする', async () => {
    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(
      session.addBlockNode('b1', 'upper', { x: 100, y: 0 }, {
        type: BlockType.ToUpper,
        config: { kind: 'empty' },
      }).ok,
    ).toBe(true);
    expect(session.addEdge('e1', 'in1', 'b1').ok).toBe(true);

    let connectSourceId: string | null = 'in1';
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = mountCanvas({
        session,
        connectSourceId,
        onConnectSourceChange: id => {
          connectSourceId = id;
        },
      });
    });

    const block = session.getNodes().find(n => n.id === 'b1')!;
    const dropX = block.position.x;
    const dropY = block.position.y + layout.nodeHeight / 2;

    await ReactTestRenderer.act(() => {
      const sourceView = renderer!.root
        .findAllByType(NodeView)
        .find(n => n.props.node.id === 'in1');
      sourceView!.props.onPortDragEnd(dropX, dropY);
    });

    expect(session.getEdges()).toHaveLength(1);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(connectSourceId).toBeNull();
  });

  test('接続線を押すと選択され、見た目ラベルが選択中になる', async () => {
    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(session.addOutputNode('out1', 'o1', { x: 200, y: 0 }).ok).toBe(true);
    expect(session.addEdge('e1', 'in1', 'out1').ok).toBe(true);

    let connectSourceId: string | null = null;
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = mountCanvas({
        session,
        connectSourceId,
        onConnectSourceChange: id => {
          connectSourceId = id;
        },
      });
    });

    const edgeHit = renderer!.root.findByProps({
      accessibilityLabel: edgeAccessibilityLabel({
        fromName: 'a',
        toName: 'o1',
        selected: false,
      }),
    });

    await ReactTestRenderer.act(() => {
      edgeHit.props.onPress({
        nativeEvent: { metaKey: false, ctrlKey: false },
      });
    });

    expect([...session.getTransientUi().edgeSelection]).toEqual(['e1']);
    expect(session.getTransientUi().selection.size).toBe(0);

    await ReactTestRenderer.act(() => {
      renderer.update(
        <CanvasViewport
          session={session}
          nodes={session.getNodes()}
          edges={session.getEdges()}
          issues={session.getIssues()}
          selection={session.getTransientUi().selection}
          edgeSelection={session.getTransientUi().edgeSelection}
          zoom={1}
          scrollX={0}
          scrollY={0}
          editable
          keyboardFocusId={null}
          connectSourceId={connectSourceId}
          onConnectSourceChange={() => undefined}
        />,
      );
    });

    expect(
      renderer!.root.findByProps({
        accessibilityLabel: edgeAccessibilityLabel({
          fromName: 'a',
          toName: 'o1',
          selected: true,
        }),
      }),
    ).toBeTruthy();
  });
});

describe('pageToModel', () => {
  test('buildWorldTransform の逆変換になる', () => {
    const cases = [
      { modelX: 0, modelY: 0, scrollX: 0, scrollY: 0, zoom: 1 },
      { modelX: 120, modelY: 80, scrollX: 40, scrollY: -20, zoom: 1.5 },
      { modelX: 400, modelY: 300, scrollX: -100, scrollY: 50, zoom: 0.5 },
    ];
    for (const c of cases) {
      const pageX = (c.modelX + c.scrollX) * c.zoom;
      const pageY = (c.modelY + c.scrollY) * c.zoom;
      const model = pageToModel(pageX, pageY, 0, 0, c.scrollX, c.scrollY, c.zoom);
      expect(model.x).toBeCloseTo(c.modelX, 8);
      expect(model.y).toBeCloseTo(c.modelY, 8);
    }
  });

  test('viewport 原点オフセットを差し引く', () => {
    const model = pageToModel(250, 180, 100, 50, 0, 0, 1);
    expect(model.x).toBeCloseTo(150);
    expect(model.y).toBeCloseTo(130);
  });
});

describe('resolveViewportPageOrigin', () => {
  test('measureInWindow の結果を優先する', () => {
    const origins: Array<{ x: number; y: number }> = [];
    resolveViewportPageOrigin(
      cb => cb(40, 60),
      { x: 0, y: 0 },
      origin => origins.push(origin),
    );
    expect(origins).toEqual([{ x: 40, y: 60 }]);
  });

  test('measure 不能時は fallback を使う', () => {
    const origins: Array<{ x: number; y: number }> = [];
    resolveViewportPageOrigin(null, { x: 12, y: 34 }, origin =>
      origins.push(origin),
    );
    expect(origins).toEqual([{ x: 12, y: 34 }]);
  });
});

describe('CanvasViewport 接続（viewport 原点）', () => {
  test('measureInWindow が非ゼロでもドロップ位置が合う', async () => {
    MockNativeMethods.measureInWindow.mockImplementation(
      (cb: (x: number, y: number) => void) => {
        cb(80, 40);
      },
    );

    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(session.addOutputNode('out1', 'o1', { x: 200, y: 0 }).ok).toBe(true);

    let connectSourceId: string | null = null;
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = mountCanvas({
        session,
        connectSourceId,
        onConnectSourceChange: id => {
          connectSourceId = id;
        },
      });
    });

    const inputNode = session.getNodes().find(n => n.id === 'out1')!;
    const modelDropX = inputNode.position.x;
    const modelDropY = inputNode.position.y + layout.nodeHeight / 2;
    // page = viewportPage + (model + scroll) * zoom
    const pageX = 80 + modelDropX;
    const pageY = 40 + modelDropY;

    const sourceView = renderer!.root
      .findAllByType(NodeView)
      .find(n => n.props.node.id === 'in1');

    await ReactTestRenderer.act(() => {
      sourceView!.props.onPortDragStart('output');
      renderer!.update(
        <CanvasViewport
          session={session}
          nodes={session.getNodes()}
          edges={session.getEdges()}
          issues={session.getIssues()}
          selection={new Set()}
          edgeSelection={new Set()}
          zoom={1}
          scrollX={0}
          scrollY={0}
          editable
          keyboardFocusId={null}
          connectSourceId={connectSourceId}
          onConnectSourceChange={id => {
            connectSourceId = id;
          }}
        />,
      );
    });

    await ReactTestRenderer.act(() => {
      const updatedSource = renderer!.root
        .findAllByType(NodeView)
        .find(n => n.props.node.id === 'in1');
      updatedSource!.props.onPortDragEnd(pageX, pageY);
    });

    expect(session.getEdges()).toHaveLength(1);
    expect(session.getEdges()[0]?.from).toBe('in1');
    expect(session.getEdges()[0]?.to).toBe('out1');
  });
});

describe('hitTestInputPort', () => {
  const nodes = [
    {
      id: 'in1',
      kind: NodeKind.Input,
      displayName: 'a',
      position: { x: 0, y: 0 },
    },
    {
      id: 'out1',
      kind: NodeKind.Output,
      displayName: 'o1',
      position: { x: 200, y: 40 },
    },
  ] as unknown as ReturnType<MappingSession['getNodes']>;

  test('入力端子中心付近でヒットする', () => {
    const hit = hitTestInputPort(
      200,
      40 + layout.nodeHeight / 2,
      nodes,
      new Map(),
      'in1',
    );
    expect(hit).toBe('out1');
  });

  test('半径外ではヒットしない', () => {
    const hit = hitTestInputPort(
      200 + PORT_HIT_RADIUS + 1,
      40 + layout.nodeHeight / 2,
      nodes,
      new Map(),
      'in1',
    );
    expect(hit).toBeNull();
  });

  test('接続元自身と Input ノードは対象外', () => {
    expect(
      hitTestInputPort(0, layout.nodeHeight / 2, nodes, new Map(), 'in1'),
    ).toBeNull();
    expect(
      hitTestInputPort(
        200,
        40 + layout.nodeHeight / 2,
        nodes,
        new Map(),
        null,
      ),
    ).toBeNull();
  });
});

describe('buildWorldTransform', () => {
  test('左上原点で screen = (world + scroll) * zoom になる', () => {
    const cases = [
      { x: 0, y: 0, scrollX: 0, scrollY: 0, zoom: 1 },
      { x: 120, y: 80, scrollX: 40, scrollY: -20, zoom: 1.5 },
      { x: 400, y: 300, scrollX: -100, scrollY: 50, zoom: 0.5 },
      { x: 2400, y: 1600, scrollX: 10, scrollY: 10, zoom: 2 },
    ];
    for (const c of cases) {
      const transform = buildWorldTransform(c.scrollX, c.scrollY, c.zoom);
      const mapped = mapWorldPointWithTopLeftOrigin(c.x, c.y, transform);
      expect(mapped.x).toBeCloseTo((c.x + c.scrollX) * c.zoom, 8);
      expect(mapped.y).toBeCloseTo((c.y + c.scrollY) * c.zoom, 8);
    }
  });
});

describe('computeWorldBounds', () => {
  test('ノード外接 + 余白でワールドが広がる', () => {
    const nodes = [
      {
        id: 'a',
        position: { x: 100, y: 50 },
      },
      {
        id: 'b',
        position: { x: 3000, y: 2000 },
      },
    ] as const;
    const bounds = computeWorldBounds(
      nodes as unknown as ReturnType<MappingSession['getNodes']>,
      new Map(),
    );
    expect(bounds.originX).toBe(100 - WORLD_CONTENT_PAD);
    expect(bounds.originY).toBe(50 - WORLD_CONTENT_PAD);
    expect(bounds.width).toBeGreaterThanOrEqual(
      3000 + layout.nodeWidth + WORLD_CONTENT_PAD - bounds.originX,
    );
    expect(bounds.height).toBeGreaterThanOrEqual(
      2000 + layout.nodeHeight + WORLD_CONTENT_PAD - bounds.originY,
    );
  });

  test('ドラッグ中の一時座標も外接に含める', () => {
    const nodes = [
      {
        id: 'a',
        position: { x: 0, y: 0 },
      },
    ] as unknown as ReturnType<MappingSession['getNodes']>;
    const bounds = computeWorldBounds(
      nodes,
      new Map([['a', { x: 5000, y: 0 }]]),
    );
    expect(bounds.originX).toBeLessThanOrEqual(5000 - WORLD_CONTENT_PAD);
    expect(bounds.originX + bounds.width).toBeGreaterThanOrEqual(
      5000 + layout.nodeWidth + WORLD_CONTENT_PAD,
    );
  });
});

describe('computeCanvasScrollMetrics', () => {
  const world = {
    originX: -400,
    originY: -400,
    width: 2000,
    height: 1500,
  };

  test('ワールド左上表示時は offset が 0', () => {
    const metrics = computeCanvasScrollMetrics(world, 1, 800, 500, 400, 400);
    expect(metrics.offsetX).toBeCloseTo(0);
    expect(metrics.offsetY).toBeCloseTo(0);
    expect(metrics.canScrollX).toBe(true);
    expect(metrics.canScrollY).toBe(true);
  });

  test('offset と scroll は往復できる', () => {
    const offsetX = 320;
    const offsetY = 180;
    const scroll = scrollFromOffsets(world, 1.25, offsetX, offsetY);
    const metrics = computeCanvasScrollMetrics(
      world,
      1.25,
      800,
      500,
      scroll.scrollX,
      scroll.scrollY,
    );
    expect(metrics.offsetX).toBeCloseTo(offsetX, 5);
    expect(metrics.offsetY).toBeCloseTo(offsetY, 5);
  });

  test('コンテンツが収まるときはスクロール不可', () => {
    const small = { originX: 0, originY: 0, width: 400, height: 300 };
    const metrics = computeCanvasScrollMetrics(small, 1, 800, 500, 0, 0);
    expect(metrics.canScrollX).toBe(false);
    expect(metrics.canScrollY).toBe(false);
    expect(metrics.maxOffsetX).toBe(0);
    expect(metrics.maxOffsetY).toBe(0);
  });
});

describe('CanvasViewport スクロールバー', () => {
  test('作業範囲がビューポートより大きいと縦横バーが出る', async () => {
    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-a', displayName: 'a' }]);
    expect(session.addInputNode('in1', 'col-a', { x: 0, y: 0 }).ok).toBe(true);
    expect(
      session.addOutputNode('out1', 'o1', { x: 2400, y: 1800 }).ok,
    ).toBe(true);

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <CanvasViewport
          session={session}
          nodes={session.getNodes()}
          edges={session.getEdges()}
          issues={session.getIssues()}
          selection={new Set()}
          edgeSelection={new Set()}
          zoom={1}
          scrollX={0}
          scrollY={0}
          editable
          keyboardFocusId={null}
          connectSourceId={null}
          onConnectSourceChange={() => undefined}
        />,
      );
    });

    // onLayout 前は DEFAULT_VIEWPORT(800x500)。ワールドはノード外接+余白で大きい。
    expect(
      renderer!.root.findByProps({
        accessibilityLabel: labels.canvasScrollHorizontal,
      }),
    ).toBeTruthy();
    expect(
      renderer!.root.findByProps({
        accessibilityLabel: labels.canvasScrollVertical,
      }),
    ).toBeTruthy();
  });
});

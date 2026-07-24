// CanvasViewport の接続下書きと端子接続可否のコンポーネントテスト。
// 不正接続時の下書き保持と入力端子の接続可能条件を固定するために存在する。
// RELEVANT FILES: ../src/canvas/CanvasViewport.tsx, ../src/canvas/PortView.tsx

import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { MappingSession } from '@csvmapper/application';
import { BlockType } from '@csvmapper/contracts';

import {
  buildWorldTransform,
  CanvasViewport,
} from '../src/canvas/CanvasViewport';
import { portAccessibilityLabel } from '../src/accessibility/labels';

/** RN 既定どおり中心原点で、style.transform を左から順に適用した画面座標。 */
function mapWorldPointWithCenterOrigin(
  x: number,
  y: number,
  worldWidth: number,
  worldHeight: number,
  transform: ReturnType<typeof buildWorldTransform>,
): { x: number; y: number } {
  const cx = worldWidth / 2;
  const cy = worldHeight / 2;
  let px = x - cx;
  let py = y - cy;
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
  return { x: px + cx, y: py + cy };
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

  test('不正接続では下書きを残し、Alert で理由を出す', async () => {
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
});

describe('buildWorldTransform', () => {
  test('中心原点でも screen = (world + scroll) * zoom になる', () => {
    const worldWidth = 2400;
    const worldHeight = 1600;
    const cases = [
      { x: 0, y: 0, scrollX: 0, scrollY: 0, zoom: 1 },
      { x: 120, y: 80, scrollX: 40, scrollY: -20, zoom: 1.5 },
      { x: 400, y: 300, scrollX: -100, scrollY: 50, zoom: 0.5 },
      { x: worldWidth, y: worldHeight, scrollX: 10, scrollY: 10, zoom: 2 },
    ];
    for (const c of cases) {
      const transform = buildWorldTransform(
        c.scrollX,
        c.scrollY,
        c.zoom,
        worldWidth,
        worldHeight,
      );
      const mapped = mapWorldPointWithCenterOrigin(
        c.x,
        c.y,
        worldWidth,
        worldHeight,
        transform,
      );
      expect(mapped.x).toBeCloseTo((c.x + c.scrollX) * c.zoom, 8);
      expect(mapped.y).toBeCloseTo((c.y + c.scrollY) * c.zoom, 8);
    }
  });
});

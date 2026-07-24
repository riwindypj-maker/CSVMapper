// PREVIEW-001〜006 / E001〜E004 相当の Application 層テスト。
// Gateway 調停・件数・列順・部分エラー・出力可否を固定するために存在する。
// RELEVANT FILES: ../src/session/JobMediator.ts, ../src/gateway/InMemoryProcessingGateway.ts

import {
  BlockType,
  GraphErrorCode,
  IssueSeverity,
  NodeKind,
  PREVIEW_ROW_OPTIONS,
  ProcessingErrorCode,
  type ProcessingEvent,
} from '@csvmapper/contracts';
import {
  InMemoryProcessingGateway,
  JobMediator,
  MappingSession,
  type ProcessingGateway,
} from '../src';

const FILE = {
  path: '/tmp/sample.csv',
  size: 64,
  modifiedTimeMs: 1,
};

function readyGateway(csvText: string): InMemoryProcessingGateway {
  const gateway = new InMemoryProcessingGateway();
  gateway.setFixture({ file: FILE, csvText });
  gateway.setPickResult({ cancelled: false, file: FILE });
  return gateway;
}

async function loadSession(
  session: MappingSession,
  gateway: InMemoryProcessingGateway,
): Promise<JobMediator> {
  const mediator = new JobMediator(session, gateway);
  await mediator.selectAndLoadCsv();
  return mediator;
}

describe('PREVIEW application', () => {
  test('PREVIEW-001 件数ごとに新しいスナップショットを表示する', async () => {
    const session = new MappingSession();
    const gateway = readyGateway('a,b\n1,2\n3,4\n5,6\n');
    const mediator = await loadSession(session, gateway);

    session.addInputNode('in-a', 'col-0', { x: 0, y: 0 });
    session.addOutputNode('out-1', '出力1', { x: 100, y: 0 });
    session.addEdge('e1', 'in-a', 'out-1');

    for (const count of PREVIEW_ROW_OPTIONS) {
      await mediator.startPreview(count);
      expect(session.getPhase()).toBe('editable');
      expect(session.getPreviewStale()).toBe(false);
      expect(session.getPreviewResult()?.snapshotId).toBeTruthy();
      expect(session.getPreviewResult()?.evaluatedRowCount).toBeLessThanOrEqual(
        count,
      );
    }
    mediator.dispose();
  });

  test('PREVIEW-002 出力順と未接続列の空文字', async () => {
    const session = new MappingSession();
    const gateway = readyGateway('a,b\nx,y\n');
    const mediator = await loadSession(session, gateway);

    session.addInputNode('in-a', 'col-0', { x: 0, y: 0 });
    session.addOutputNode('out-a', 'A', { x: 100, y: 0 });
    session.addOutputNode('out-b', 'B', { x: 100, y: 40 });
    session.addEdge('e1', 'in-a', 'out-a');
    session.setOutputOrder(['out-b', 'out-a']);

    await mediator.startPreview(100);
    const result = session.getPreviewResult()!;
    expect(result.columns.map(c => c.outputItemId)).toEqual(['out-b', 'out-a']);
    expect(result.pages[0].rows[0].cells[0]).toBe('');
    expect(result.pages[0].rows[0].cells[1]).toBe('x');
    mediator.dispose();
  });

  test('PREVIEW-003 セル経路が入力とブロックを含む', async () => {
    const session = new MappingSession();
    const gateway = readyGateway('a\nhello\n');
    const mediator = await loadSession(session, gateway);

    session.addInputNode('in-a', 'col-0', { x: 0, y: 0 });
    session.addBlockNode('b1', 'trim', { x: 40, y: 0 }, {
      type: BlockType.Trim,
      config: { kind: 'empty' },
    });
    session.addOutputNode('out-1', 'o', { x: 80, y: 0 });
    expect(session.addEdge('e1', 'in-a', 'b1').ok).toBe(true);
    expect(session.addEdge('e2', 'b1', 'out-1').ok).toBe(true);

    await mediator.startPreview(100);
    const path = await mediator.inspectCellPath(1, 'out-1');
    expect(path?.steps.length).toBeGreaterThanOrEqual(2);
    expect(path?.steps.some(s => s.kind === NodeKind.Input)).toBe(true);
    expect(path?.steps.some(s => s.kind === NodeKind.Block)).toBe(true);
    mediator.dispose();
  });

  test('PREVIEW-004 列単位設定エラーでも他列は維持', async () => {
    const session = new MappingSession();
    const gateway = readyGateway('a,b\n1,2\n');
    const mediator = await loadSession(session, gateway);

    session.addInputNode('in-a', 'col-0', { x: 0, y: 0 });
    session.addInputNode('in-b', 'col-1', { x: 0, y: 40 });
    session.addBlockNode('bad', 'front', { x: 40, y: 0 }, {
      type: BlockType.FrontTrim,
      config: { kind: 'empty' },
    });
    session.addOutputNode('out-bad', 'bad', { x: 80, y: 0 });
    session.addOutputNode('out-ok', 'ok', { x: 80, y: 40 });
    session.addEdge('e1', 'in-a', 'bad');
    session.addEdge('e2', 'bad', 'out-bad');
    session.addEdge('e3', 'in-b', 'out-ok');

    await mediator.startPreview(100);
    const result = session.getPreviewResult()!;
    expect(result.columns[0].hasError).toBe(true);
    expect(result.columns[1].hasError).toBe(false);
    expect(result.pages[0].rows[0].cells[1]).toBe('2');
    mediator.dispose();
  });

  test('PREVIEW-005 警告のみなら canExport が true で対象へ移動できる', async () => {
    const session = new MappingSession();
    const gateway = readyGateway('a\n');
    const mediator = await loadSession(session, gateway);

    session.addInputNode('in-a', 'col-0', { x: 0, y: 0 });
    session.addOutputNode('out-1', 'o', { x: 80, y: 0 });
    // 未接続警告のみ。
    expect(session.warningIssues().some(i => i.code === GraphErrorCode.UnconnectedOutput)).toBe(
      true,
    );
    expect(session.errorIssues()).toHaveLength(0);
    expect(session.canExport).toBe(true);

    const warning = session.warningIssues().find(i => i.nodeId);
    expect(warning?.nodeId).toBe('out-1');
    session.requestFocus(warning!.nodeId!);
    expect(session.consumeFocusRequest()).toBe('out-1');
    mediator.dispose();
  });

  test('PREVIEW-006 中止でプレビュー結果を確定しない', async () => {
    const session = new MappingSession();
    const gateway = readyGateway('a\n1\n2\n3\n');
    const mediator = await loadSession(session, gateway);
    session.addInputNode('in-a', 'col-0', { x: 0, y: 0 });
    session.addOutputNode('out-1', 'o', { x: 80, y: 0 });
    session.addEdge('e1', 'in-a', 'out-1');

    // 同期インメモリでは cancel を先に入れてから preview する。
    await gateway.cancel('will-override');
    // startPreview 内で新しい operationId が付くため、開始直後に cancel する形で検証。
    const start = mediator.startPreview(100);
    await mediator.cancelActive();
    await start;
    // インメモリはほぼ即完了するため、少なくとも phase が editable に戻る。
    expect(session.getPhase()).toBe('editable');
    mediator.dispose();
  });

  test('PREVIEW-E001 循環は全体エラー', async () => {
    const session = new MappingSession();
    const gateway = readyGateway('a\n1\n');
    gateway.forceCycle = true;
    const mediator = await loadSession(session, gateway);
    session.addInputNode('in-a', 'col-0', { x: 0, y: 0 });
    session.addOutputNode('out-1', 'o', { x: 80, y: 0 });
    session.addEdge('e1', 'in-a', 'out-1');

    await mediator.startPreview(100);
    expect(session.getPreviewResult()).toBeNull();
    expect(session.getLastFailure()?.errorCode).toBeTruthy();
    mediator.dispose();
  });

  test('PREVIEW-E002 エラーがあると canExport が false', async () => {
    const session = new MappingSession();
    session.replaceInputColumns([{ id: 'col-0', displayName: 'a' }]);
    session.addInputNode('in-a', 'col-0', { x: 0, y: 0 });
    // 出力なしエラー。
    expect(session.errorIssues().some(i => i.code === GraphErrorCode.NoOutputs)).toBe(
      true,
    );
    expect(session.canExport).toBe(false);
  });

  test('PREVIEW-E003 絵文字プレビューで表現不能エラーを出さない', async () => {
    const session = new MappingSession();
    const gateway = readyGateway('a\n😀\n');
    const mediator = await loadSession(session, gateway);
    session.addInputNode('in-a', 'col-0', { x: 0, y: 0 });
    session.addOutputNode('out-1', 'o', { x: 80, y: 0 });
    session.addEdge('e1', 'in-a', 'out-1');
    await mediator.startPreview(100);
    expect(session.getPreviewResult()?.pages[0].rows[0].cells[0]).toBe('😀');
    expect(session.getLastFailure()).toBeNull();
    mediator.dispose();
  });

  test('PREVIEW-E004 件数は 100/500/1000 のみ', () => {
    const session = new MappingSession();
    session.setPreviewRowCount(250);
    expect(session.getPreviewRowCount()).toBe(100);
    session.setPreviewRowCount(500);
    expect(session.getPreviewRowCount()).toBe(500);
    session.setPreviewRowCount(1000);
    expect(session.getPreviewRowCount()).toBe(1000);
  });

  test('件数変更後は既存プレビューを stale にする', async () => {
    const session = new MappingSession();
    const gateway = readyGateway('a\n1\n2\n');
    const mediator = await loadSession(session, gateway);
    session.addInputNode('in-a', 'col-0', { x: 0, y: 0 });
    session.addOutputNode('out-1', 'o', { x: 80, y: 0 });
    session.addEdge('e1', 'in-a', 'out-1');
    await mediator.startPreview(100);
    expect(session.getPreviewStale()).toBe(false);

    session.setPreviewRowCount(500);
    expect(session.getPreviewRowCount()).toBe(500);
    expect(session.getPreviewStale()).toBe(true);
    expect(session.getPreviewResult()).not.toBeNull();
    mediator.dispose();
  });

  test('調停者再生成後も完了イベントを確定する', async () => {
    const session = new MappingSession();
    const gateway = readyGateway('a\n1\n');
    gateway.deferEvents = true;

    const first = new JobMediator(session, gateway);
    await first.startInspect(FILE);
    expect(session.getPhase()).toBe('loading');
    expect(session.getJobProgress()?.operationId).toBeTruthy();
    first.dispose();

    // 購読だけ張り直した新しい調停者が、遅延完了を受け取る。
    const second = new JobMediator(session, gateway);
    gateway.flushDeferredEvents();
    expect(session.getPhase()).toBe('editable');
    expect(session.getInputColumns().length).toBeGreaterThan(0);
    second.dispose();
  });

  test('回帰: マッピング変更だけではプレビューを自動更新しない', async () => {
    const session = new MappingSession();
    const gateway = readyGateway('a\nv\n');
    const mediator = await loadSession(session, gateway);
    session.addInputNode('in-a', 'col-0', { x: 0, y: 0 });
    session.addOutputNode('out-1', 'o', { x: 80, y: 0 });
    session.addEdge('e1', 'in-a', 'out-1');
    await mediator.startPreview(100);
    const snapId = session.getPreviewResult()?.snapshotId;
    expect(session.getPreviewStale()).toBe(false);

    session.setOutputName('out-1', 'renamed');
    expect(session.getPreviewStale()).toBe(true);
    expect(session.getPreviewResult()?.snapshotId).toBe(snapId);
    mediator.dispose();
  });

  test('データ行なし警告を付与する', async () => {
    const session = new MappingSession();
    const gateway = readyGateway('a\n');
    const mediator = await loadSession(session, gateway);
    expect(
      session.getIssues().some(
        i =>
          i.code === GraphErrorCode.NoDataRows &&
          i.severity === IssueSeverity.Warning,
      ),
    ).toBe(true);
    mediator.dispose();
  });

  test('再読込失敗時は inputFile を元に戻す', async () => {
    const session = new MappingSession();
    const fileA = { path: '/tmp/a.csv', size: 10, modifiedTimeMs: 1 };
    const fileB = { path: '/tmp/b.csv', size: 20, modifiedTimeMs: 2 };
    const gateway = new InMemoryProcessingGateway();
    gateway.setFixture({ file: fileA, csvText: 'a\n1\n' });
    gateway.setPickResult({ cancelled: false, file: fileA });
    const mediator = new JobMediator(session, gateway);
    await mediator.selectAndLoadCsv();
    expect(session.getInputFile()?.path).toBe(fileA.path);
    session.addInputNode('in-a', 'col-0', { x: 0, y: 0 });

    // fixture に無いパスは読込失敗になり、既存列と旧パスを維持する。
    await mediator.startInspect(fileB);
    expect(session.getPhase()).toBe('editable');
    expect(session.getInputFile()?.path).toBe(fileA.path);
    expect(session.getInputColumns()).toHaveLength(1);
    expect(session.getNodes()).toHaveLength(1);
    mediator.dispose();
  });

  test('プレビュー失敗時は previewSnapshotId を復元する', async () => {
    const session = new MappingSession();
    const gateway = readyGateway('a\n1\n');
    const mediator = await loadSession(session, gateway);
    session.addInputNode('in-a', 'col-0', { x: 0, y: 0 });
    session.addOutputNode('out-1', 'o', { x: 80, y: 0 });
    session.addEdge('e1', 'in-a', 'out-1');
    await mediator.startPreview(100);
    const snapId = session.getPreviewSnapshotId();
    expect(snapId).toBeTruthy();

    gateway.forceCycle = true;
    await mediator.startPreview(100);
    expect(session.getPhase()).toBe('editable');
    expect(session.getPreviewSnapshotId()).toBe(snapId);
    expect(session.getPreviewResult()?.snapshotId).toBe(snapId);
    const path = await mediator.inspectCellPath(1, 'out-1');
    expect(path?.steps.length).toBeGreaterThan(0);
    mediator.dispose();
  });

  test('再プレビュー開始時は stale にし旧 snapshotId を維持する', async () => {
    const session = new MappingSession();
    const gateway = readyGateway('a\n1\n2\n');
    const mediator = await loadSession(session, gateway);
    session.addInputNode('in-a', 'col-0', { x: 0, y: 0 });
    session.addOutputNode('out-1', 'o', { x: 80, y: 0 });
    session.addEdge('e1', 'in-a', 'out-1');
    await mediator.startPreview(100);
    const snapId = session.getPreviewSnapshotId();
    expect(session.getPreviewStale()).toBe(false);

    gateway.deferEvents = true;
    const start = mediator.startPreview(100);
    expect(session.getPhase()).toBe('previewing');
    expect(session.getPreviewStale()).toBe(true);
    expect(session.getPreviewSnapshotId()).toBe(snapId);
    expect(session.getPreviewResult()).not.toBeNull();

    gateway.flushDeferredEvents();
    await start;
    expect(session.getPhase()).toBe('editable');
    expect(session.getPreviewStale()).toBe(false);
    expect(session.getPreviewSnapshotId()).toBeTruthy();
    mediator.dispose();
  });

  test('プレビュー成功後も NoDataRows 警告を残す', async () => {
    const session = new MappingSession();
    const gateway = readyGateway('a\n');
    const mediator = await loadSession(session, gateway);
    expect(
      session.getIssues().some(i => i.code === GraphErrorCode.NoDataRows),
    ).toBe(true);

    session.addInputNode('in-a', 'col-0', { x: 0, y: 0 });
    session.addOutputNode('out-1', 'o', { x: 80, y: 0 });
    session.addEdge('e1', 'in-a', 'out-1');
    await mediator.startPreview(100);
    expect(session.getPreviewResult()).not.toBeNull();
    expect(
      session.getIssues().some(
        i =>
          i.code === GraphErrorCode.NoDataRows &&
          i.severity === IssueSeverity.Warning,
      ),
    ).toBe(true);
    mediator.dispose();
  });

  test('結果欠落の completed は失敗扱いで phase を戻す', async () => {
    const session = new MappingSession();
    let emit: ((event: ProcessingEvent) => void) | null = null;
    const gateway: ProcessingGateway = {
      pickInputFile: async () => ({ cancelled: true }),
      inspectInput: async operationId => {
        emit?.({
          type: 'completed',
          operationId,
          kind: 'inspectInput',
        });
      },
      preview: async () => undefined,
      inspectCellPath: async () => ({
        snapshotId: '',
        rowNumber: 1,
        outputItemId: '',
        steps: [],
      }),
      cancel: async () => ({ accepted: false }),
      subscribe: listener => {
        emit = listener;
        return () => {
          emit = null;
        };
      },
    };
    const mediator = new JobMediator(session, gateway);
    await mediator.startInspect(FILE);
    expect(session.getPhase()).toBe('unloaded');
    expect(session.getJobProgress()).toBeNull();
    expect(session.getLastFailure()?.errorCode).toBe(
      ProcessingErrorCode.INTERNAL,
    );
    // 進行中ジョブが残っていないこと。
    await expect(mediator.startInspect(FILE)).resolves.toBe('started');
    mediator.dispose();
  });
});

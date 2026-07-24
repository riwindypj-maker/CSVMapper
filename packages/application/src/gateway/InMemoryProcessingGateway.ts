// テスト用のインメモリ Processing Gateway。
// Jest で PREVIEW / 読込調停を Core 無しで再現するために存在する。
// RELEVANT FILES: ProcessingGateway.ts, ../session/JobMediator.ts

import {
  BlockType,
  CellPathResult,
  FileRef,
  GraphErrorCode,
  InspectInputResultDto,
  IssueSeverity,
  NodeKind,
  PickInputFileResult,
  PREVIEW_PAGE_ROW_COUNT,
  PreviewResult,
  ProcessingErrorCode,
  ProcessingEvent,
  ProcessingSnapshot,
} from '@csvmapper/contracts';

import { evaluateGraph } from '../graph/evaluate';
import { GraphModel } from '../graph/model';
import type {
  ProcessingEventListener,
  ProcessingGateway,
} from './ProcessingGateway';

export interface InMemoryCsvFixture {
  file: FileRef;
  /** ヘッダー行を含む CSV テキスト（UTF-8）。 */
  csvText: string;
}

/**
 * 同期的に完了イベントを返すインメモリ実装。
 * ブロック変換は Application の軽量 evaluateGraph に委譲する。
 */
export class InMemoryProcessingGateway implements ProcessingGateway {
  private readonly listeners = new Set<ProcessingEventListener>();
  private fixture: InMemoryCsvFixture | null = null;
  private pickResult: PickInputFileResult = { cancelled: true };
  private busyOperationId: string | null = null;
  private cancelRequested = new Set<string>();
  private lastPreview:
    | {
        snapshot: ProcessingSnapshot;
        rowInputs: Array<Map<string, string>>;
      }
    | null = null;
  /** テストから循環などを注入する。 */
  forceCycle = false;
  forceCsvError = false;
  /**
   * true の間は完了系イベントを溜め、flushDeferredEvents() まで送らない。
   * 調停者の再生成後に完了を届ける回帰テスト用。
   */
  deferEvents = false;
  private deferredEvents: ProcessingEvent[] = [];

  setFixture(fixture: InMemoryCsvFixture): void {
    this.fixture = fixture;
  }

  setPickResult(result: PickInputFileResult): void {
    this.pickResult = result;
  }

  subscribe(listener: ProcessingEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async pickInputFile(): Promise<PickInputFileResult> {
    return this.pickResult;
  }

  async inspectInput(operationId: string, file: FileRef): Promise<void> {
    if (this.busyOperationId) {
      this.emit({
        type: 'failed',
        operationId,
        errorCode: ProcessingErrorCode.BUSY,
        message: '別の処理が実行中です',
      });
      return;
    }
    this.busyOperationId = operationId;
    try {
      if (this.cancelRequested.has(operationId)) {
        this.emit({ type: 'cancelled', operationId });
        return;
      }
      if (this.forceCsvError) {
        this.emit({
          type: 'failed',
          operationId,
          errorCode: ProcessingErrorCode.CSV_MALFORMED,
          message: 'malformed CSV',
        });
        return;
      }
      const parsed = this.parseFixture(file);
      if (!parsed) {
        this.emit({
          type: 'failed',
          operationId,
          errorCode: ProcessingErrorCode.INPUT_UNREADABLE,
          message: 'input unreadable',
        });
        return;
      }
      this.emit({
        type: 'progress',
        operationId,
        bytesRead: file.size,
        byteSize: file.size,
        recordsProcessed: parsed.dataRowCount + 1,
      });
      if (this.cancelRequested.has(operationId)) {
        this.emit({ type: 'cancelled', operationId });
        return;
      }
      this.emit({
        type: 'completed',
        operationId,
        kind: 'inspectInput',
        inspectResult: parsed,
      });
    } finally {
      this.busyOperationId = null;
      this.cancelRequested.delete(operationId);
    }
  }

  async preview(
    operationId: string,
    file: FileRef,
    snapshot: ProcessingSnapshot,
    rowCount: number,
  ): Promise<void> {
    if (this.busyOperationId) {
      this.emit({
        type: 'failed',
        operationId,
        errorCode: ProcessingErrorCode.BUSY,
        message: '別の処理が実行中です',
      });
      return;
    }
    this.busyOperationId = operationId;
    try {
      if (this.forceCycle) {
        this.emit({
          type: 'failed',
          operationId,
          errorCode: ProcessingErrorCode.GRAPH_CYCLE,
          message: 'graph contains a cycle',
        });
        return;
      }
      if (this.forceCsvError) {
        this.emit({
          type: 'failed',
          operationId,
          errorCode: ProcessingErrorCode.CSV_MALFORMED,
          message: 'malformed CSV',
        });
        return;
      }
      const parsed = this.parseFixture(file);
      if (!parsed) {
        this.emit({
          type: 'failed',
          operationId,
          errorCode: ProcessingErrorCode.INPUT_UNREADABLE,
          message: 'input unreadable',
        });
        return;
      }
      if (this.cancelRequested.has(operationId)) {
        this.emit({ type: 'cancelled', operationId });
        return;
      }

      const graph = graphFromSnapshot(snapshot);
      const limit = Math.min(Math.max(1, rowCount), 1000);
      const rows = parsed._dataRows.slice(0, limit);
      const columnToNode = new Map<string, string>();
      for (const node of snapshot.nodes) {
        if (node.kind === NodeKind.Input && node.inputColumnId) {
          columnToNode.set(node.inputColumnId, node.id);
        }
      }

      const columns = snapshot.outputOrder.map(outputItemId => {
        const node = snapshot.nodes.find(n => n.id === outputItemId);
        const pathError = findColumnConfigError(snapshot, outputItemId);
        return {
          outputItemId,
          displayName: node?.displayName ?? '',
          hasError: !!pathError,
          issueCode: pathError?.code,
          issueMessage: pathError?.message,
        };
      });

      const rowInputs: Array<Map<string, string>> = [];
      const previewRows = rows.map((fields, index) => {
        const inputValues = new Map<string, string>();
        snapshot.inputColumns.forEach((col, colIndex) => {
          const nodeId = columnToNode.get(col.id);
          if (nodeId) {
            inputValues.set(nodeId, fields[colIndex] ?? '');
          }
        });
        for (const node of snapshot.nodes) {
          if (node.kind === NodeKind.Input && !inputValues.has(node.id)) {
            inputValues.set(node.id, '');
          }
        }
        rowInputs.push(new Map(inputValues));
        const values = evaluateGraph(graph, inputValues);
        const cells = columns.map(col => {
          if (col.hasError) {
            return '';
          }
          return values.get(col.outputItemId) ?? '';
        });
        return { rowNumber: index + 1, cells };
      });

      const pages = [];
      for (let i = 0; i < previewRows.length; i += PREVIEW_PAGE_ROW_COUNT) {
        pages.push({
          pageIndex: pages.length,
          rows: previewRows.slice(i, i + PREVIEW_PAGE_ROW_COUNT),
        });
      }
      if (pages.length === 0) {
        pages.push({ pageIndex: 0, rows: [] });
      }

      const previewResult: PreviewResult = {
        operationId,
        snapshotId: snapshot.snapshotId,
        columns,
        pages,
        evaluatedRowCount: previewRows.length,
        columnIssues: columns
          .filter(c => c.hasError)
          .map(c => ({
            code: (c.issueCode as GraphErrorCode) ?? GraphErrorCode.MissingRequiredConfig,
            severity: IssueSeverity.Error,
            nodeId: c.outputItemId,
            message: c.issueMessage ?? '列の設定エラー',
          })),
      };

      this.lastPreview = { snapshot, rowInputs };
      this.emit({
        type: 'progress',
        operationId,
        bytesRead: file.size,
        byteSize: file.size,
        recordsProcessed: previewRows.length + 1,
      });
      if (this.cancelRequested.has(operationId)) {
        this.lastPreview = null;
        this.emit({ type: 'cancelled', operationId });
        return;
      }
      this.emit({
        type: 'completed',
        operationId,
        kind: 'preview',
        previewResult,
      });
    } finally {
      this.busyOperationId = null;
      this.cancelRequested.delete(operationId);
    }
  }

  async inspectCellPath(
    snapshotId: string,
    rowNumber: number,
    outputItemId: string,
  ): Promise<CellPathResult> {
    if (!this.lastPreview || this.lastPreview.snapshot.snapshotId !== snapshotId) {
      return {
        snapshotId,
        rowNumber,
        outputItemId,
        steps: [],
      };
    }
    const { snapshot, rowInputs } = this.lastPreview;
    if (rowNumber < 1 || rowNumber > rowInputs.length) {
      return { snapshotId, rowNumber, outputItemId, steps: [] };
    }
    const graph = graphFromSnapshot(snapshot);
    const values = evaluateGraph(graph, rowInputs[rowNumber - 1]);
    const path = collectPath(snapshot, outputItemId);
    return {
      snapshotId,
      rowNumber,
      outputItemId,
      steps: path.map(nodeId => {
        const node = snapshot.nodes.find(n => n.id === nodeId)!;
        return {
          nodeId,
          kind: node.kind,
          displayName: node.displayName,
          value: values.get(nodeId) ?? '',
        };
      }),
    };
  }

  async cancel(operationId: string): Promise<{ accepted: boolean }> {
    this.cancelRequested.add(operationId);
    if (this.busyOperationId === operationId) {
      return { accepted: true };
    }
    return { accepted: false };
  }

  /** deferEvents で溜めた完了系イベントを購読者へ送る。 */
  flushDeferredEvents(): void {
    const queued = this.deferredEvents;
    this.deferredEvents = [];
    for (const event of queued) {
      this.dispatch(event);
    }
  }

  private emit(event: ProcessingEvent): void {
    if (this.deferEvents && event.type !== 'progress') {
      this.deferredEvents.push(event);
      return;
    }
    this.dispatch(event);
  }

  private dispatch(event: ProcessingEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private parseFixture(
    file: FileRef,
  ): (InspectInputResultDto & { _dataRows: string[][] }) | null {
    if (!this.fixture || this.fixture.file.path !== file.path) {
      return null;
    }
    const lines = this.fixture.csvText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter((line, index, arr) => !(index === arr.length - 1 && line === ''));
    if (lines.length === 0) {
      return null;
    }
    const headers = splitCsvLine(lines[0]);
    const dataRows = lines.slice(1).map(splitCsvLine);
    const items = headers.map((header, index) => ({
      header,
      displayName: header,
      sample: dataRows[0]?.[index] ?? '',
    }));
    return {
      operationId: '',
      byteSize: file.size,
      detectedEncoding: 'Utf8',
      items,
      dataRowCount: dataRows.length,
      columnCount: headers.length,
      issues:
        dataRows.length === 0
          ? [
              {
                severity: IssueSeverity.Warning,
                code: ProcessingErrorCode.None,
                message: 'header only',
              },
            ]
          : [],
      _dataRows: dataRows,
    };
  }
}

function splitCsvLine(line: string): string[] {
  return line.split(',');
}

function graphFromSnapshot(snapshot: ProcessingSnapshot): GraphModel {
  const graph = new GraphModel();
  for (const node of snapshot.nodes) {
    if (node.kind === NodeKind.Input) {
      graph.addInputNode(
        node.id,
        node.displayName,
        node.position,
        node.inputColumnId ?? node.id,
      );
    } else if (node.kind === NodeKind.Block && node.block) {
      graph.addBlockNode(node.id, node.displayName, node.position, node.block);
    } else if (node.kind === NodeKind.Output) {
      graph.addOutputNode(node.id, node.displayName, node.position);
    }
  }
  for (const edge of snapshot.edges) {
    graph.addEdge(edge.id, edge.from, edge.to);
  }
  if (snapshot.outputOrder.length > 0) {
    graph.setOutputOrder(snapshot.outputOrder);
  }
  const joinOrders = new Map<string, string[]>();
  for (const edge of snapshot.edges) {
    const to = snapshot.nodes.find(n => n.id === edge.to);
    if (to?.kind === NodeKind.Block && to.block?.type === BlockType.Join) {
      const list = joinOrders.get(edge.to) ?? [];
      list[edge.joinOrder] = edge.id;
      joinOrders.set(edge.to, list);
    }
  }
  for (const [joinId, ordered] of joinOrders) {
    graph.setJoinInputOrder(
      joinId,
      ordered.filter(Boolean),
    );
  }
  return graph;
}

function findColumnConfigError(
  snapshot: ProcessingSnapshot,
  outputItemId: string,
): { code: GraphErrorCode; message: string } | null {
  const path = collectPath(snapshot, outputItemId);
  for (const nodeId of path) {
    const node = snapshot.nodes.find(n => n.id === nodeId);
    if (!node || node.kind !== NodeKind.Block || !node.block) {
      continue;
    }
    const { type, config } = node.block;
    const missing =
      ((type === BlockType.FrontTrim ||
        type === BlockType.BackTrim ||
        type === BlockType.DeleteAt ||
        type === BlockType.Substring) &&
        config.kind !== 'positionLength') ||
      ((type === BlockType.Replace || type === BlockType.DeleteAll) &&
        (config.kind !== 'stringPair' || config.target.length === 0));
    if (missing) {
      return {
        code: GraphErrorCode.MissingRequiredConfig,
        message: '必須設定が不足している',
      };
    }
  }
  return null;
}

function collectPath(
  snapshot: ProcessingSnapshot,
  outputItemId: string,
): string[] {
  const incoming = new Map<string, string[]>();
  for (const edge of snapshot.edges) {
    const list = incoming.get(edge.to) ?? [];
    list.push(edge.from);
    incoming.set(edge.to, list);
  }
  const path: string[] = [];
  const visit = (id: string) => {
    if (path.includes(id)) {
      return;
    }
    for (const from of incoming.get(id) ?? []) {
      visit(from);
    }
    path.push(id);
  };
  visit(outputItemId);
  return path;
}

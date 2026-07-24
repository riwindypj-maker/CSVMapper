// 読込・プレビューの長時間ジョブを 1 件に調停する。
// operationId 不一致イベントの破棄と phase 遷移を Application で確定するために存在する。
// RELEVANT FILES: ../gateway/ProcessingGateway.ts, store.ts, processingSnapshot.ts

import {
  FileRef,
  GraphErrorCode,
  GraphIssue,
  InspectInputResultDto,
  IssueSeverity,
  ProcessingEvent,
} from '@csvmapper/contracts';

import type { ProcessingGateway } from '../gateway/ProcessingGateway';
import type { MappingSession } from './store';
import {
  buildProcessingSnapshot,
  normalizePreviewRowCount,
} from './processingSnapshot';

function newOperationId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

/**
 * MappingSession と ProcessingGateway の間でジョブを調停する。
 */
export class JobMediator {
  private unsubscribe: (() => void) | null = null;
  private activeOperationId: string | null = null;

  constructor(
    private readonly session: MappingSession,
    private readonly gateway: ProcessingGateway,
  ) {
    // Strict Mode 再マウント等で調停者だけ作り直された場合、セッション側の
    // 進行中 operationId を引き継いで完了イベントを落とさない。
    this.activeOperationId = this.pendingOperationIdFromSession();
    this.unsubscribe = this.gateway.subscribe(event => this.onEvent(event));
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  async selectAndLoadCsv(): Promise<'cancelled' | 'started' | 'busy'> {
    if (this.hasInFlightJob()) {
      return 'busy';
    }
    const picked = await this.gateway.pickInputFile();
    if (picked.cancelled || !picked.file) {
      return 'cancelled';
    }
    return this.startInspect(picked.file);
  }

  async startInspect(file: FileRef): Promise<'started' | 'busy'> {
    if (this.hasInFlightJob()) {
      return 'busy';
    }
    const operationId = newOperationId('inspect');
    this.activeOperationId = operationId;
    this.session.beginLoading(file, operationId);
    await this.gateway.inspectInput(operationId, file);
    return 'started';
  }

  async startPreview(rowCount: number): Promise<'started' | 'busy' | 'blocked'> {
    if (this.hasInFlightJob()) {
      return 'busy';
    }
    if (this.session.getPhase() !== 'editable') {
      return 'blocked';
    }
    const file = this.session.getInputFile();
    if (!file) {
      return 'blocked';
    }
    const normalized = normalizePreviewRowCount(rowCount);
    const snapshot = buildProcessingSnapshot(this.session, normalized);
    const operationId = newOperationId('preview');
    this.activeOperationId = operationId;
    this.session.beginPreviewing(operationId, snapshot.snapshotId);
    await this.gateway.preview(operationId, file, snapshot, normalized);
    return 'started';
  }

  async cancelActive(): Promise<boolean> {
    const operationId = this.resolveActiveOperationId();
    if (!operationId) {
      return false;
    }
    const { accepted } = await this.gateway.cancel(operationId);
    return accepted;
  }

  async inspectCellPath(rowNumber: number, outputItemId: string) {
    const snapshotId = this.session.getPreviewSnapshotId();
    if (!snapshotId) {
      return null;
    }
    return this.gateway.inspectCellPath(snapshotId, rowNumber, outputItemId);
  }

  private onEvent(event: ProcessingEvent): void {
    const expectedId = this.resolveActiveOperationId();
    if (!expectedId || event.operationId !== expectedId) {
      return;
    }
    // 再生成直後でも以降の progress / 完了を同一 ID で扱えるよう同期する。
    this.activeOperationId = expectedId;

    if (event.type === 'progress') {
      this.session.updateJobProgress(event);
      return;
    }

    if (event.type === 'cancelled') {
      this.session.failOrCancelJob('cancelled');
      this.clearActive();
      return;
    }

    if (event.type === 'failed') {
      this.session.failOrCancelJob('failed', {
        errorCode: event.errorCode,
        message: event.message,
        issues: event.issues,
      });
      this.clearActive();
      return;
    }

    if (event.type === 'completed') {
      if (event.kind === 'inspectInput' && event.inspectResult) {
        this.applyInspectSuccess(event.inspectResult);
      } else if (event.kind === 'preview' && event.previewResult) {
        this.session.commitPreviewResult(event.previewResult);
      }
      this.clearActive();
    }
  }

  private applyInspectSuccess(result: InspectInputResultDto): void {
    const columns = result.items.map((item, index) => ({
      id: `col-${index}`,
      displayName: item.displayName,
    }));
    const samples = new Map<string, string>();
    result.items.forEach((item, index) => {
      samples.set(`col-${index}`, item.sample);
    });
    const extraIssues: GraphIssue[] = [];
    if (result.dataRowCount === 0) {
      extraIssues.push({
        code: GraphErrorCode.NoDataRows,
        severity: IssueSeverity.Warning,
        message: 'データ行がない',
      });
    }
    this.session.commitInspectResult({
      columns,
      samples,
      dataRowCount: result.dataRowCount,
      columnCount: result.columnCount,
      detectedEncoding: result.detectedEncoding,
      extraIssues,
    });
  }

  private clearActive(): void {
    this.activeOperationId = null;
  }

  /** ローカル記憶またはセッションに残る進行中ジョブ ID。 */
  private resolveActiveOperationId(): string | null {
    if (this.activeOperationId) {
      return this.activeOperationId;
    }
    return this.pendingOperationIdFromSession();
  }

  private pendingOperationIdFromSession(): string | null {
    const phase = this.session.getPhase();
    if (phase !== 'loading' && phase !== 'previewing') {
      return null;
    }
    return this.session.getJobProgress()?.operationId ?? null;
  }

  private hasInFlightJob(): boolean {
    return this.resolveActiveOperationId() !== null;
  }
}

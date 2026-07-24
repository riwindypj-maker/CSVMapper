// Processing Gateway の抽象契約。
// Application が TurboModule / インメモリ実装を差し替えられるようにするために存在する。
// RELEVANT FILES: InMemoryProcessingGateway.ts, NativeProcessingGateway.ts, ../session/store.ts

import type {
  CellPathResult,
  FileRef,
  InspectInputResultDto,
  PickInputFileResult,
  PreviewResult,
  ProcessingEvent,
  ProcessingSnapshot,
} from '@csvmapper/contracts';

export type ProcessingEventListener = (event: ProcessingEvent) => void;

/**
 * ネイティブ処理 API の TypeScript 抽象。
 * 長時間ジョブは 1 件まで。イベントは operationId 付き。
 */
export interface ProcessingGateway {
  pickInputFile(): Promise<PickInputFileResult>;
  inspectInput(operationId: string, file: FileRef): Promise<void>;
  preview(
    operationId: string,
    file: FileRef,
    snapshot: ProcessingSnapshot,
    rowCount: number,
  ): Promise<void>;
  inspectCellPath(
    snapshotId: string,
    rowNumber: number,
    outputItemId: string,
  ): Promise<CellPathResult>;
  cancel(operationId: string): Promise<{ accepted: boolean }>;
  subscribe(listener: ProcessingEventListener): () => void;
}

/** 読込成功時にセッションへ渡す確定データ。 */
export interface LoadedInputCsv {
  file: FileRef;
  columns: InspectInputResultDto['items'];
  dataRowCount: number;
  columnCount: number;
  detectedEncoding: InspectInputResultDto['detectedEncoding'];
  inspectIssues: InspectInputResultDto['issues'];
}

export type { InspectInputResultDto, PreviewResult, CellPathResult, FileRef };

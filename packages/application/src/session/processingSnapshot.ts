// 処理スナップショット生成ヘルパー。
// プレビュー開始時に変更不能な写しを作るために存在する。
// RELEVANT FILES: store.ts, JobMediator.ts, ../../../contracts/src/preview.ts

import {
  PREVIEW_ROW_OPTIONS,
  PROCESSING_SNAPSHOT_SCHEMA_VERSION,
  ProcessingSnapshot,
  type PreviewRowOption,
} from '@csvmapper/contracts';

import type { MappingSession } from './store';

export function normalizePreviewRowCount(rowCount: number): PreviewRowOption {
  if ((PREVIEW_ROW_OPTIONS as readonly number[]).includes(rowCount)) {
    return rowCount as PreviewRowOption;
  }
  return 100;
}

export function newSnapshotId(): string {
  return `snap-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function buildProcessingSnapshot(
  session: MappingSession,
  previewRowCount: number,
  snapshotId: string = newSnapshotId(),
): ProcessingSnapshot {
  const graph = session.snapshot();
  return {
    schemaVersion: PROCESSING_SNAPSHOT_SCHEMA_VERSION,
    snapshotId,
    inputColumns: graph.inputColumns,
    nodes: graph.nodes.map(n => ({
      id: n.id,
      kind: n.kind,
      displayName: n.displayName,
      position: n.position,
      inputColumnId: n.inputColumnId,
      block: n.block,
    })),
    edges: graph.edges.map(e => ({
      id: e.id,
      from: e.from,
      to: e.to,
      joinOrder: e.joinOrder,
    })),
    outputOrder: graph.outputOrder,
    previewRowCount,
  };
}

// @csvmapper/application の公開入口。
// ホストやテストがセッション API を参照するために存在する。
// RELEVANT FILES: session/store.ts, gateway/ProcessingGateway.ts, session/JobMediator.ts

export { GraphModel } from './graph/model';
export { validateGraph } from './graph/validation';
export { evaluateGraph } from './graph/evaluate';
export { computeAutoLayout } from './layout/autoLayout';
export { HistoryStack } from './session/history';
export type { DocumentSnapshot } from './session/history';
export { MappingSession, MIN_ZOOM, MAX_ZOOM } from './session/store';
export type {
  TransientUiState,
  SessionPhase,
  JobProgressView,
  SessionFailure,
} from './session/store';
export { JobMediator } from './session/JobMediator';
export {
  buildProcessingSnapshot,
  normalizePreviewRowCount,
  newSnapshotId,
} from './session/processingSnapshot';
export type { ProcessingGateway } from './gateway/ProcessingGateway';
export { InMemoryProcessingGateway } from './gateway/InMemoryProcessingGateway';

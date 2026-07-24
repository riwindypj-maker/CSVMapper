// グラフ問題コードと重大度を定義する。
// 編集時検証と問題一覧が同じコード体系を使うために存在する。
// RELEVANT FILES: nodes.ts, blocks.ts, ../application/src/graph/validation.ts

import type { EdgeId, NodeId } from './ids';

/** 接続拒否・検証で返すエラーコード。 */
export enum GraphErrorCode {
  None = 'None',
  DuplicateInput = 'DuplicateInput',
  OutputAsSource = 'OutputAsSource',
  InputAsTarget = 'InputAsTarget',
  SelfLoop = 'SelfLoop',
  WouldCreateCycle = 'WouldCreateCycle',
  TooManyInputs = 'TooManyInputs',
  TerminalMismatch = 'TerminalMismatch',
  InvalidJoinOrder = 'InvalidJoinOrder',
  MissingRequiredConfig = 'MissingRequiredConfig',
  MissingInput = 'MissingInput',
  NoOutputs = 'NoOutputs',
  NoOutputName = 'NoOutputName',
  DuplicateOutputName = 'DuplicateOutputName',
  UnusedBlock = 'UnusedBlock',
  UnconnectedOutput = 'UnconnectedOutput',
  JoinSingleInput = 'JoinSingleInput',
  UnknownNode = 'UnknownNode',
  UnknownEdge = 'UnknownEdge',
  /** ヘッダーのみでデータ行が 0 件のときの警告。 */
  NoDataRows = 'NoDataRows',
}

/** 問題の重大度。同一要素で両方に該当する場合はエラーのみ表示する。 */
export enum IssueSeverity {
  Error = 'Error',
  Warning = 'Warning',
}

/** 検証結果の 1 件。値そのものは載せない。 */
export interface GraphIssue {
  code: GraphErrorCode;
  severity: IssueSeverity;
  nodeId?: NodeId;
  edgeId?: EdgeId;
  message: string;
}

// 編集ブロック種別と設定 DTO を定義する。
// ドメインの 15 種ブロックを TypeScript 契約として共有するために存在する。
// RELEVANT FILES: nodes.ts, issues.ts, ../application/src/graph/validation.ts

/** 15 種類の文字列編集ブロック。 */
export enum BlockType {
  FrontTrim = 'FrontTrim',
  BackTrim = 'BackTrim',
  DeleteAt = 'DeleteAt',
  Substring = 'Substring',
  Replace = 'Replace',
  DeleteAll = 'DeleteAll',
  Trim = 'Trim',
  RemoveWhitespace = 'RemoveWhitespace',
  ToUpper = 'ToUpper',
  ToLower = 'ToLower',
  Prefix = 'Prefix',
  Suffix = 'Suffix',
  ReplaceIfEmpty = 'ReplaceIfEmpty',
  Join = 'Join',
  Constant = 'Constant',
}

/** 文字位置と文字数を指定する設定。位置は 1 始まり。 */
export interface PositionLengthConfig {
  kind: 'positionLength';
  position: number;
  length: number;
}

/** 置換・削除ブロックで使用する設定。 */
export interface StringPairConfig {
  kind: 'stringPair';
  target: string;
  replacement: string;
}

/** 固定文字追加・固定値・空文字置換で使用する設定。 */
export interface ConstantConfig {
  kind: 'constant';
  value: string;
}

/** 文字列結合ブロックで使用する設定。 */
export interface JoinConfig {
  kind: 'join';
  separator: string;
  ignoreEmpty: boolean;
}

/** 設定不要なブロック用の空設定。 */
export interface EmptyConfig {
  kind: 'empty';
}

export type BlockConfig =
  | PositionLengthConfig
  | StringPairConfig
  | ConstantConfig
  | JoinConfig
  | EmptyConfig;

/** ブロックの種別と設定。 */
export interface BlockInfo {
  type: BlockType;
  config: BlockConfig;
}

/** Join 以外のブロックが受け付ける入力数上限。 */
export const SINGLE_INPUT_LIMIT = 1;

/** Join ブロックが受け付ける入力数上限。 */
export const JOIN_INPUT_LIMIT = 100;

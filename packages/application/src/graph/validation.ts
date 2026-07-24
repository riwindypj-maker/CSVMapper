// 編集時グラフの問題分類を行う。
// エラー優先の表示規則を Application 内で確定するために存在する。
// RELEVANT FILES: model.ts, ../session/store.ts, ../../../contracts/src/issues.ts

import {
  BlockConfig,
  BlockType,
  GraphErrorCode,
  GraphIssue,
  IssueSeverity,
  NodeKind,
} from '@csvmapper/contracts';

import type { GraphModel } from './model';

const MSG: Record<string, string> = {
  [GraphErrorCode.NoOutputs]: '出力項目がない',
  [GraphErrorCode.NoOutputName]: '出力項目名が未入力',
  [GraphErrorCode.DuplicateOutputName]: '出力項目名が重複している',
  [GraphErrorCode.MissingInput]: '必要な入力がない',
  [GraphErrorCode.MissingRequiredConfig]: '必須設定が不足している',
  [GraphErrorCode.InvalidJoinOrder]: '結合順が不正である',
  [GraphErrorCode.UnconnectedOutput]: '出力項目が未接続',
  [GraphErrorCode.UnusedBlock]: '出力へ到達しない編集ブロック',
  [GraphErrorCode.JoinSingleInput]: '結合ブロックの入力が 1 件だけ',
  [GraphErrorCode.NoDataRows]: 'データ行がない',
};

/**
 * グラフ全体を検証し、同一要素の警告はエラーがあれば伏せる。
 */
export function validateGraph(graph: GraphModel): GraphIssue[] {
  const byNode = new Map<string, GraphIssue[]>();
  const global: GraphIssue[] = [];

  const push = (issue: GraphIssue) => {
    if (issue.nodeId) {
      const list = byNode.get(issue.nodeId) ?? [];
      list.push(issue);
      byNode.set(issue.nodeId, list);
    } else {
      global.push(issue);
    }
  };

  const nodes = graph.getNodes();
  const outputs = nodes.filter(n => n.kind === NodeKind.Output);
  if (outputs.length === 0) {
    push({
      code: GraphErrorCode.NoOutputs,
      severity: IssueSeverity.Error,
      message: MSG[GraphErrorCode.NoOutputs],
    });
  }

  // 出力辺の有無ではなく、いずれかの出力項目への到達可能性で未使用を判定する。
  const reachesOutput = collectNodesReachingOutput(graph);

  const outputNames = new Map<string, string>();
  for (const node of nodes) {
    if (node.kind === NodeKind.Output) {
      if (node.displayName.trim() === '') {
        push({
          code: GraphErrorCode.NoOutputName,
          severity: IssueSeverity.Error,
          nodeId: node.id,
          message: MSG[GraphErrorCode.NoOutputName],
        });
      } else {
        // 空文字判定と同じく trim 後の名前で重複を見る。
        const trimmedName = node.displayName.trim();
        const existing = outputNames.get(trimmedName);
        if (existing) {
          push({
            code: GraphErrorCode.DuplicateOutputName,
            severity: IssueSeverity.Warning,
            nodeId: node.id,
            message: MSG[GraphErrorCode.DuplicateOutputName],
          });
        } else {
          outputNames.set(trimmedName, node.id);
        }
      }
      if (graph.getInputEdgeIds(node.id).length === 0) {
        push({
          code: GraphErrorCode.UnconnectedOutput,
          severity: IssueSeverity.Warning,
          nodeId: node.id,
          message: MSG[GraphErrorCode.UnconnectedOutput],
        });
      }
    }

    if (node.kind === NodeKind.Block && node.block) {
      const inputCount = graph.getInputEdgeIds(node.id).length;
      const type = node.block.type;

      if (type === BlockType.Join) {
        if (inputCount === 0) {
          push({
            code: GraphErrorCode.MissingInput,
            severity: IssueSeverity.Error,
            nodeId: node.id,
            message: MSG[GraphErrorCode.MissingInput],
          });
        } else if (inputCount === 1) {
          push({
            code: GraphErrorCode.JoinSingleInput,
            severity: IssueSeverity.Warning,
            nodeId: node.id,
            message: MSG[GraphErrorCode.JoinSingleInput],
          });
        }
        if (inputCount > 0 && !isJoinOrderValid(graph, node.id)) {
          push({
            code: GraphErrorCode.InvalidJoinOrder,
            severity: IssueSeverity.Error,
            nodeId: node.id,
            message: MSG[GraphErrorCode.InvalidJoinOrder],
          });
        }
      } else if (type !== BlockType.Constant && inputCount === 0) {
        push({
          code: GraphErrorCode.MissingInput,
          severity: IssueSeverity.Error,
          nodeId: node.id,
          message: MSG[GraphErrorCode.MissingInput],
        });
      }

      if (hasMissingRequiredConfig(node.block.type, node.block.config)) {
        push({
          code: GraphErrorCode.MissingRequiredConfig,
          severity: IssueSeverity.Error,
          nodeId: node.id,
          message: MSG[GraphErrorCode.MissingRequiredConfig],
        });
      }

      // 入力要件を満たすが出力へ届かないブロックだけ警告する（入力不足はエラー優先で伏せる）。
      const unused =
        !reachesOutput.has(node.id) &&
        (type === BlockType.Constant || inputCount > 0);
      if (unused) {
        push({
          code: GraphErrorCode.UnusedBlock,
          severity: IssueSeverity.Warning,
          nodeId: node.id,
          message: MSG[GraphErrorCode.UnusedBlock],
        });
      }
    }
  }

  const issues: GraphIssue[] = [...global];
  for (const list of byNode.values()) {
    const hasError = list.some(i => i.severity === IssueSeverity.Error);
    if (hasError) {
      issues.push(...list.filter(i => i.severity === IssueSeverity.Error));
    } else {
      issues.push(...list);
    }
  }
  return issues;
}

/**
 * いずれかの出力項目へ到達できるノード ID を返す（出力から入力方向へ辿る）。
 */
function collectNodesReachingOutput(graph: GraphModel): Set<string> {
  const reaching = new Set<string>();
  const queue: string[] = [];
  for (const node of graph.getNodes()) {
    if (node.kind !== NodeKind.Output) {
      continue;
    }
    reaching.add(node.id);
    queue.push(node.id);
  }
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edgeId of graph.getInputEdgeIds(current)) {
      const edge = graph.getEdge(edgeId);
      if (!edge || reaching.has(edge.from)) {
        continue;
      }
      reaching.add(edge.from);
      queue.push(edge.from);
    }
  }
  return reaching;
}

function isJoinOrderValid(graph: GraphModel, joinNodeId: string): boolean {
  const edgeIds = graph.getInputEdgeIds(joinNodeId);
  const used = new Array(edgeIds.length).fill(false);
  for (const edgeId of edgeIds) {
    const edge = graph.getEdge(edgeId);
    if (!edge || edge.joinOrder >= edgeIds.length || used[edge.joinOrder]) {
      return false;
    }
    used[edge.joinOrder] = true;
  }
  return true;
}

function hasMissingRequiredConfig(type: BlockType, config: BlockConfig): boolean {
  switch (type) {
    case BlockType.FrontTrim:
    case BlockType.BackTrim:
    case BlockType.DeleteAt:
    case BlockType.Substring:
      return (
        config.kind !== 'positionLength' ||
        !isPositiveInt(config.position) ||
        !isPositiveInt(config.length)
      );
    case BlockType.Replace:
    case BlockType.DeleteAll:
      return config.kind !== 'stringPair' || config.target.length === 0;
    case BlockType.Prefix:
    case BlockType.Suffix:
    case BlockType.ReplaceIfEmpty:
      return config.kind !== 'constant';
    case BlockType.Join:
      return config.kind !== 'join';
    case BlockType.Constant:
      return config.kind !== 'constant';
    default:
      return false;
  }
}

function isPositiveInt(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

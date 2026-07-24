// 編集時グラフの軽量評価を行う。
// 接続・結合順・トポロジカル順のテスト検証のために存在する（本番プレビューは Core）。
// RELEVANT FILES: model.ts, validation.ts

import { BlockType, NodeId, NodeKind } from '@csvmapper/contracts';

import type { GraphModel } from './model';

/**
 * 入力値から出力値を評価する。
 * ブロックは接続検証用に最低限の変換だけ行い、書記素処理は C++ Core に委ねる。
 */
export function evaluateGraph(
  graph: GraphModel,
  inputValues: ReadonlyMap<NodeId, string> | Record<NodeId, string>,
): Map<NodeId, string> {
  const values = new Map<NodeId, string>();
  const inputs =
    inputValues instanceof Map
      ? inputValues
      : new Map(Object.entries(inputValues));

  for (const [id, value] of inputs) {
    values.set(id, value);
  }

  const order = graph.topologicalSort();
  for (const id of order) {
    const node = graph.getNode(id);
    if (!node || node.kind !== NodeKind.Block || !node.block) {
      continue;
    }
    const block = node.block;
    if (block.type === BlockType.Constant) {
      const cfg = block.config;
      values.set(
        id,
        cfg.kind === 'constant' ? cfg.value : '',
      );
      continue;
    }

    const edgeIds = graph.getInputEdgeIds(id);
    if (block.type === BlockType.Join) {
      const ordered: Array<{ order: number; value: string }> = [];
      for (const edgeId of edgeIds) {
        const edge = graph.getEdge(edgeId);
        if (!edge) {
          continue;
        }
        ordered.push({
          order: edge.joinOrder,
          value: values.get(edge.from) ?? '',
        });
      }
      ordered.sort((a, b) => a.order - b.order);
      const cfg = block.config;
      const separator = cfg.kind === 'join' ? cfg.separator : '';
      const ignoreEmpty = cfg.kind === 'join' ? cfg.ignoreEmpty : true;
      const parts = ordered.map(o => o.value);
      const filtered = ignoreEmpty ? parts.filter(p => p.length > 0) : parts;
      values.set(id, filtered.join(separator));
      continue;
    }

    // 編集時テスト用: 単入力ブロックは入力をそのまま通す（実変換は Core）。
    if (edgeIds.length > 0) {
      const edge = graph.getEdge(edgeIds[0]);
      values.set(id, edge ? values.get(edge.from) ?? '' : '');
    } else {
      values.set(id, '');
    }
  }

  let outputIds = [...graph.getOutputOrder()];
  if (outputIds.length === 0) {
    outputIds = graph
      .getNodes()
      .filter(n => n.kind === NodeKind.Output)
      .map(n => n.id);
  }
  for (const id of outputIds) {
    const node = graph.getNode(id);
    if (!node || node.kind !== NodeKind.Output) {
      continue;
    }
    const inputEdges = graph.getInputEdgeIds(id);
    if (inputEdges.length === 0) {
      values.set(id, '');
      continue;
    }
    const edge = graph.getEdge(inputEdges[0]);
    values.set(id, edge ? values.get(edge.from) ?? '' : '');
  }

  return values;
}

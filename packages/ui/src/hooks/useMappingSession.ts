// MappingSession を React の外部ストアとして購読するフック。
// Presentation 層がセッション変更で再描画するために存在する。
// RELEVANT FILES: ../screens/MainScreen.tsx, ../../application/src/session/store.ts

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { MappingSession } from '@csvmapper/application';

/**
 * セッション全体を画面単位で購読する。
 * 再描画が重い場合のみノード ID 単位購読へ細分化する。
 */
export function useMappingSession(session: MappingSession) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => session.subscribe(onStoreChange),
    [session],
  );
  const getSnapshot = useCallback(() => session.getRevision(), [session]);
  const revision = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(
    () => ({
      revision,
      phase: session.getPhase(),
      inputColumns: session.getInputColumns(),
      nodes: session.getNodes(),
      edges: session.getEdges(),
      outputOrder: session.getOutputOrder(),
      issues: session.getIssues(),
      ui: session.getTransientUi(),
      canUndo: session.canUndo,
      canRedo: session.canRedo,
      errorCount: session.errorIssues().length,
      warningCount: session.warningIssues().length,
    }),
    [session, revision],
  );
}

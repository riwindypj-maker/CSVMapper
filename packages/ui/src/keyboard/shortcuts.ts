// macOS / Windows 向けキーボードショートカットの解決。
// 実キー入力と単体テストの両方から同じ判定を使うために存在する。
// RELEVANT FILES: FocusRegions.tsx, ../screens/MainScreen.tsx

export type ShortcutAction =
  | 'undo'
  | 'redo'
  | 'selectAll'
  | 'focusSearch'
  | 'delete'
  | 'zoomIn'
  | 'zoomOut'
  | 'fitAll'
  | 'escape';

export interface ShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey?: boolean;
}

/** meta（macOS）または ctrl（Windows）を修飾キーとして扱う。 */
function hasPrimaryModifier(event: ShortcutEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

/**
 * キーイベントからショートカット動作を解決する。
 * 一致しない場合は null。
 */
export function resolveShortcut(event: ShortcutEvent): ShortcutAction | null {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const primary = hasPrimaryModifier(event);

  if (key === 'Escape') {
    return 'escape';
  }
  if ((key === 'Delete' || key === 'Backspace') && !primary) {
    return 'delete';
  }
  if (!primary) {
    return null;
  }

  if (key === 'z' && event.shiftKey) {
    return 'redo';
  }
  if (key === 'z') {
    return 'undo';
  }
  if (key === 'y') {
    return 'redo';
  }
  if (key === 'a') {
    return 'selectAll';
  }
  if (key === 'f') {
    return 'focusSearch';
  }
  if (key === '=' || key === '+' || key === 'Add') {
    return 'zoomIn';
  }
  if (key === '-' || key === '_' || key === 'Subtract') {
    return 'zoomOut';
  }
  if (key === '0') {
    return 'fitAll';
  }
  return null;
}

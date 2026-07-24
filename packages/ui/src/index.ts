// @csvmapper/ui の公開入口。
// ホストがメイン画面をマウントするために存在する。
// RELEVANT FILES: screens/MainScreen.tsx, hooks/useMappingSession.ts

export { MainScreen, dispatchUiShortcut } from './screens/MainScreen';
export type { MainScreenProps } from './screens/MainScreen';
export { useMappingSession } from './hooks/useMappingSession';
export { labels } from './accessibility/labels';
export { resolveShortcut } from './keyboard/shortcuts';
export type { ShortcutAction, ShortcutEvent } from './keyboard/shortcuts';
export {
  FocusRegionProvider,
  FocusRegion,
  FOCUS_REGION_ORDER,
  useFocusRegions,
} from './keyboard/FocusRegions';
export type { FocusRegionId } from './keyboard/FocusRegions';
export { colors, layout, spacing, typography } from './theme/tokens';

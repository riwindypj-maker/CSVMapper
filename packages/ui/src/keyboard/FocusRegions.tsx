// メイン画面の Tab 領域フォーカス順を管理する。
// 読み順（ツールバー→左→キャンバス→右→プレビュー）を固定するために存在する。
// RELEVANT FILES: shortcuts.ts, ../screens/MainScreen.tsx

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors } from '../theme/tokens';

export type FocusRegionId =
  | 'toolbar'
  | 'left'
  | 'canvas'
  | 'right'
  | 'preview';

export const FOCUS_REGION_ORDER: readonly FocusRegionId[] = [
  'toolbar',
  'left',
  'canvas',
  'right',
  'preview',
] as const;

interface FocusRegionContextValue {
  activeRegion: FocusRegionId;
  setActiveRegion: (region: FocusRegionId) => void;
  focusNextRegion: () => void;
  focusPreviousRegion: () => void;
}

const FocusRegionContext = createContext<FocusRegionContextValue | null>(null);

export function FocusRegionProvider({
  children,
  initialRegion = 'toolbar',
}: {
  children: React.ReactNode;
  initialRegion?: FocusRegionId;
}) {
  const [activeRegion, setActiveRegion] = useState<FocusRegionId>(initialRegion);

  const focusNextRegion = useCallback(() => {
    setActiveRegion(current => {
      const index = FOCUS_REGION_ORDER.indexOf(current);
      return FOCUS_REGION_ORDER[(index + 1) % FOCUS_REGION_ORDER.length];
    });
  }, []);

  const focusPreviousRegion = useCallback(() => {
    setActiveRegion(current => {
      const index = FOCUS_REGION_ORDER.indexOf(current);
      const next =
        (index - 1 + FOCUS_REGION_ORDER.length) % FOCUS_REGION_ORDER.length;
      return FOCUS_REGION_ORDER[next];
    });
  }, []);

  const value = useMemo(
    () => ({
      activeRegion,
      setActiveRegion,
      focusNextRegion,
      focusPreviousRegion,
    }),
    [activeRegion, focusNextRegion, focusPreviousRegion],
  );

  return (
    <FocusRegionContext.Provider value={value}>
      {children}
    </FocusRegionContext.Provider>
  );
}

export function useFocusRegions(): FocusRegionContextValue {
  const ctx = useContext(FocusRegionContext);
  if (!ctx) {
    throw new Error('useFocusRegions は FocusRegionProvider 内で使う');
  }
  return ctx;
}

/**
 * 領域全体をフォーカス対象として囲む。Tab 相当の切替は親が処理する。
 */
export function FocusRegion({
  id,
  accessibilityLabel,
  style,
  children,
}: {
  id: FocusRegionId;
  accessibilityLabel: string;
  style?: ViewStyle | ViewStyle[];
  children: React.ReactNode;
}) {
  const { activeRegion, setActiveRegion } = useFocusRegions();
  const focused = activeRegion === id;

  return (
    <Pressable
      accessibilityRole="none"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: focused }}
      onPress={() => setActiveRegion(id)}
      style={[style, focused ? styles.focused : null]}
    >
      <View style={styles.inner} pointerEvents="box-none">
        {children}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  focused: {
    borderColor: colors.focusRing,
    borderWidth: 2,
  },
  inner: {
    flex: 1,
  },
});

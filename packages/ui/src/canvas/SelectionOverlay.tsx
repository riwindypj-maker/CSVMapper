// 選択矩形や接続ガイドの一時オーバーレイ。
// 確定前の操作状態をモデルへ書き込まず可視化するために存在する。
// RELEVANT FILES: CanvasViewport.tsx, EdgeLayer.tsx

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '../theme/tokens';

export interface SelectionOverlayProps {
  /** ワールド座標の選択矩形。null のとき非表示。 */
  rect: { x: number; y: number; width: number; height: number } | null;
}

export function SelectionOverlay({ rect }: SelectionOverlayProps) {
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return (
    <View
      pointerEvents="none"
      style={[
        styles.rect,
        {
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  rect: {
    borderColor: colors.selection,
    borderStyle: 'dashed',
    borderWidth: 1,
    backgroundColor: colors.overlay,
    position: 'absolute',
  },
});

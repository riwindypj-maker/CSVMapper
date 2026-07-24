// キャンバス表示位置とスクロールバー用メトリクスの計算。
// transform ベースの viewport とスクロールバー位置を一致させるために存在する。
// RELEVANT FILES: CanvasViewport.tsx, CanvasScrollbars.tsx

/** computeWorldBounds と同じ形。循環 import を避けるためここに置く。 */
export interface ScrollWorldBounds {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/** スクロールバー表示・操作に必要な画面座標メトリクス。 */
export interface CanvasScrollMetrics {
  viewportWidth: number;
  viewportHeight: number;
  /** ワールド幅 × zoom（画面ピクセル）。 */
  contentWidth: number;
  /** ワールド高さ × zoom（画面ピクセル）。 */
  contentHeight: number;
  /**
   * ワールド左端からのスクロール量（画面ピクセル）。
   * 0 で左端、大きいほど右の内容が見える。
   */
  offsetX: number;
  offsetY: number;
  maxOffsetX: number;
  maxOffsetY: number;
  canScrollX: boolean;
  canScrollY: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * scroll / world / zoom からスクロールバー用の画面オフセットを求める。
 * screen = (world + scroll) * zoom と整合させる。
 */
export function computeCanvasScrollMetrics(
  world: ScrollWorldBounds,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number,
  scrollX: number,
  scrollY: number,
): CanvasScrollMetrics {
  const safeZoom = zoom > 0 ? zoom : 1;
  const contentWidth = world.width * safeZoom;
  const contentHeight = world.height * safeZoom;
  const maxOffsetX = Math.max(0, contentWidth - viewportWidth);
  const maxOffsetY = Math.max(0, contentHeight - viewportHeight);
  // 生オフセットは全体表示などで範囲外になり得る。表示は端へ寄せる。
  const rawOffsetX = -(scrollX + world.originX) * safeZoom;
  const rawOffsetY = -(scrollY + world.originY) * safeZoom;
  return {
    viewportWidth,
    viewportHeight,
    contentWidth,
    contentHeight,
    offsetX: clamp(rawOffsetX, 0, maxOffsetX),
    offsetY: clamp(rawOffsetY, 0, maxOffsetY),
    maxOffsetX,
    maxOffsetY,
    canScrollX: maxOffsetX > 0.5,
    canScrollY: maxOffsetY > 0.5,
  };
}

/**
 * 画面ピクセルのスクロールオフセットを session の scroll へ戻す。
 */
export function scrollFromOffsets(
  world: ScrollWorldBounds,
  zoom: number,
  offsetX: number,
  offsetY: number,
): { scrollX: number; scrollY: number } {
  const safeZoom = zoom > 0 ? zoom : 1;
  return {
    scrollX: -world.originX - offsetX / safeZoom,
    scrollY: -world.originY - offsetY / safeZoom,
  };
}

/**
 * パン操作の画面移動量を scroll 差分へ変換する。
 * ドラッグ方向に内容が追従する（右へドラッグ → scrollX 増加）。
 */
export function scrollDeltaFromPan(
  dxScreen: number,
  dyScreen: number,
  zoom: number,
): { dScrollX: number; dScrollY: number } {
  const safeZoom = zoom > 0 ? zoom : 1;
  return {
    dScrollX: dxScreen / safeZoom,
    dScrollY: dyScreen / safeZoom,
  };
}

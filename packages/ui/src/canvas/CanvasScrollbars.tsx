// キャンバスの縦横スクロールバー。
// transform 方式の viewport を作業範囲内で移動するために存在する。
// RELEVANT FILES: CanvasViewport.tsx, canvasScroll.ts, ../theme/tokens.ts

import React, { useMemo, useRef } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';

import { labels } from '../accessibility/labels';
import { colors, layout } from '../theme/tokens';
import type { CanvasScrollMetrics } from './canvasScroll';

const MIN_THUMB = 28;

export interface CanvasScrollbarsProps {
  metrics: CanvasScrollMetrics;
  onOffsetChange: (offsetX: number, offsetY: number) => void;
}

function thumbLength(
  trackSize: number,
  viewportSize: number,
  contentSize: number,
): number {
  if (contentSize <= 0 || trackSize <= 0) {
    return trackSize;
  }
  const ratio = Math.min(1, viewportSize / contentSize);
  return Math.max(MIN_THUMB, Math.min(trackSize, trackSize * ratio));
}

function thumbStart(
  trackSize: number,
  thumbSize: number,
  offset: number,
  maxOffset: number,
): number {
  if (maxOffset <= 0 || trackSize <= thumbSize) {
    return 0;
  }
  return (offset / maxOffset) * (trackSize - thumbSize);
}

function offsetFromThumbStart(
  thumbStartPos: number,
  trackSize: number,
  thumbSize: number,
  maxOffset: number,
): number {
  if (maxOffset <= 0 || trackSize <= thumbSize) {
    return 0;
  }
  const travel = trackSize - thumbSize;
  const ratio = Math.min(1, Math.max(0, thumbStartPos / travel));
  return ratio * maxOffset;
}

/**
 * 横・縦スクロールバーと角の交差部を描画する。
 * つまみドラッグとトラッククリックで offset を更新する。
 */
export function CanvasScrollbars({
  metrics,
  onOffsetChange,
}: CanvasScrollbarsProps) {
  const thickness = layout.canvasScrollbarSize;
  const hTrackWidth = Math.max(
    0,
    metrics.viewportWidth - (metrics.canScrollY ? thickness : 0),
  );
  const vTrackHeight = Math.max(
    0,
    metrics.viewportHeight - (metrics.canScrollX ? thickness : 0),
  );

  const hThumb = thumbLength(
    hTrackWidth,
    metrics.viewportWidth,
    metrics.contentWidth,
  );
  const vThumb = thumbLength(
    vTrackHeight,
    metrics.viewportHeight,
    metrics.contentHeight,
  );
  const hThumbLeft = thumbStart(
    hTrackWidth,
    hThumb,
    metrics.offsetX,
    metrics.maxOffsetX,
  );
  const vThumbTop = thumbStart(
    vTrackHeight,
    vThumb,
    metrics.offsetY,
    metrics.maxOffsetY,
  );

  const metricsRef = useRef(metrics);
  metricsRef.current = metrics;
  const onOffsetChangeRef = useRef(onOffsetChange);
  onOffsetChangeRef.current = onOffsetChange;
  const hTrackWidthRef = useRef(hTrackWidth);
  hTrackWidthRef.current = hTrackWidth;
  const vTrackHeightRef = useRef(vTrackHeight);
  vTrackHeightRef.current = vTrackHeight;
  const hThumbRef = useRef(hThumb);
  hThumbRef.current = hThumb;
  const vThumbRef = useRef(vThumb);
  vThumbRef.current = vThumb;
  const hThumbLeftRef = useRef(hThumbLeft);
  hThumbLeftRef.current = hThumbLeft;
  const vThumbTopRef = useRef(vThumbTop);
  vThumbTopRef.current = vThumbTop;

  const dragOrigin = useRef<{
    axis: 'x' | 'y';
    pointer: number;
    thumbStart: number;
  } | null>(null);

  // Grant 時の thumb 位置を ref から取る。再生成でドラッグ中の state を失わない。
  const horizontalPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event: GestureResponderEvent) => {
          dragOrigin.current = {
            axis: 'x',
            pointer: event.nativeEvent.pageX,
            thumbStart: hThumbLeftRef.current,
          };
        },
        onPanResponderMove: (event: GestureResponderEvent) => {
          const origin = dragOrigin.current;
          if (!origin || origin.axis !== 'x') {
            return;
          }
          const m = metricsRef.current;
          if (!m.canScrollX) {
            return;
          }
          const nextStart =
            origin.thumbStart + (event.nativeEvent.pageX - origin.pointer);
          const nextOffsetX = offsetFromThumbStart(
            nextStart,
            hTrackWidthRef.current,
            hThumbRef.current,
            m.maxOffsetX,
          );
          onOffsetChangeRef.current(nextOffsetX, m.offsetY);
        },
        onPanResponderRelease: () => {
          dragOrigin.current = null;
        },
        onPanResponderTerminate: () => {
          dragOrigin.current = null;
        },
      }),
    [],
  );

  const verticalPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event: GestureResponderEvent) => {
          dragOrigin.current = {
            axis: 'y',
            pointer: event.nativeEvent.pageY,
            thumbStart: vThumbTopRef.current,
          };
        },
        onPanResponderMove: (event: GestureResponderEvent) => {
          const origin = dragOrigin.current;
          if (!origin || origin.axis !== 'y') {
            return;
          }
          const m = metricsRef.current;
          if (!m.canScrollY) {
            return;
          }
          const nextStart =
            origin.thumbStart + (event.nativeEvent.pageY - origin.pointer);
          const nextOffsetY = offsetFromThumbStart(
            nextStart,
            vTrackHeightRef.current,
            vThumbRef.current,
            m.maxOffsetY,
          );
          onOffsetChangeRef.current(m.offsetX, nextOffsetY);
        },
        onPanResponderRelease: () => {
          dragOrigin.current = null;
        },
        onPanResponderTerminate: () => {
          dragOrigin.current = null;
        },
      }),
    [],
  );

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {metrics.canScrollX ? (
        <Pressable
          accessibilityLabel={labels.canvasScrollHorizontal}
          accessibilityRole="adjustable"
          style={[
            styles.hTrack,
            {
              bottom: 0,
              height: thickness,
              right: metrics.canScrollY ? thickness : 0,
              width: hTrackWidth,
            },
          ]}
          onPress={event => {
            if (!metrics.canScrollX) {
              return;
            }
            const centered = event.nativeEvent.locationX - hThumb / 2;
            const nextOffsetX = offsetFromThumbStart(
              centered,
              hTrackWidth,
              hThumb,
              metrics.maxOffsetX,
            );
            onOffsetChange(nextOffsetX, metrics.offsetY);
          }}
        >
          <View
            style={[
              styles.thumb,
              {
                height: thickness - 4,
                left: hThumbLeft,
                top: 2,
                width: hThumb,
              },
            ]}
            {...horizontalPan.panHandlers}
          />
        </Pressable>
      ) : null}
      {metrics.canScrollY ? (
        <Pressable
          accessibilityLabel={labels.canvasScrollVertical}
          accessibilityRole="adjustable"
          style={[
            styles.vTrack,
            {
              bottom: metrics.canScrollX ? thickness : 0,
              height: vTrackHeight,
              right: 0,
              top: 0,
              width: thickness,
            },
          ]}
          onPress={event => {
            if (!metrics.canScrollY) {
              return;
            }
            const centered = event.nativeEvent.locationY - vThumb / 2;
            const nextOffsetY = offsetFromThumbStart(
              centered,
              vTrackHeight,
              vThumb,
              metrics.maxOffsetY,
            );
            onOffsetChange(metrics.offsetX, nextOffsetY);
          }}
        >
          <View
            style={[
              styles.thumb,
              {
                height: vThumb,
                left: 2,
                top: vThumbTop,
                width: thickness - 4,
              },
            ]}
            {...verticalPan.panHandlers}
          />
        </Pressable>
      ) : null}
      {metrics.canScrollX && metrics.canScrollY ? (
        <View
          style={[
            styles.corner,
            {
              bottom: 0,
              height: thickness,
              right: 0,
              width: thickness,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  corner: {
    backgroundColor: colors.surfaceAlt,
    borderLeftColor: colors.border,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    position: 'absolute',
  },
  hTrack: {
    backgroundColor: colors.surfaceAlt,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    left: 0,
    position: 'absolute',
  },
  thumb: {
    backgroundColor: colors.borderStrong,
    borderRadius: 4,
    opacity: 0.85,
    position: 'absolute',
  },
  vTrack: {
    backgroundColor: colors.surfaceAlt,
    borderLeftColor: colors.border,
    borderLeftWidth: StyleSheet.hairlineWidth,
    position: 'absolute',
  },
});

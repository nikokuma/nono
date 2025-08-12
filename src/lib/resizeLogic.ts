import { ASPECT_RATIO, HEIGHT_STEP } from './constants';
import { clamp, roundToStep } from './math';
import { getMaxSafeWindowHeight } from './screen';

 export function calculateResizeDimensions(rawHeight: number, minHeight = 100) {
  const steppedHeight = roundToStep(rawHeight, HEIGHT_STEP);
  // remove the upper cap so height grows freely
  const clampedHeight = Math.max(steppedHeight, minHeight);

  const width = Math.round(clampedHeight * ASPECT_RATIO);
  
  return { width, height: clampedHeight };
 }

/**
 * Given a height, return a width preserving the aspect ratio.
 */
export function calculateWidthFromHeight(height: number): number {
  return Math.round(height * ASPECT_RATIO);
}

/**
 * Given a width, return a height preserving the aspect ratio.
 */
export function calculateHeightFromWidth(width: number): number {
  return Math.round(width / ASPECT_RATIO);
}

export function normalizeResizeInput(raw: number, step = HEIGHT_STEP, min = 100): number {
  return clamp(roundToStep(raw, step), min, getMaxSafeWindowHeight());
}

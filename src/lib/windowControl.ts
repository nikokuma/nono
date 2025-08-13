// src/lib/windowControl.ts
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize, LogicalPosition } from '@tauri-apps/api/dpi';
import type { Layout } from './constants';
export type Side = 'left' | 'right';

// Optional helper (not strictly needed anymore)
export const isTauri = () => {
  try { return /\bTauri\b/i.test(navigator.userAgent) || !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__; }
  catch { return false; }
};

/** Grow vertically about center-Y, and horizontally on ONE side. */
export async function resizeWindowAnchoredToWrapper(
  side: Side,
  newW: number,
  newH: number,
  _wrapper?: HTMLElement
) {
  try {
    const win = getCurrentWindow();

    const scale    = await win.scaleFactor();
    const outerPos = (await win.outerPosition()).toLogical(scale);
    const innerSz  = (await win.innerSize()).toLogical(scale);

    const dW = Math.round(newW - innerSz.width);
    const dH = Math.round(newH - innerSz.height);

    // keep TOP fixed to avoid vertical jumps
    const newY = outerPos.y;

    // grow left: shift window left by dW; grow right: keep X
    const newX = side === 'left' ? Math.round(outerPos.x - dW) : outerPos.x;

    // move first, then size (macOS behaves better)
    await win.setPosition(new LogicalPosition(newX, newY));
    await win.setSize(new LogicalSize(newW, newH));
  } catch (err) {
    console.debug('[resizeWindowAnchoredToWrapper] skipped:', err);
  }
}


/** Center-grow in both axes (INNER-size deltas). */
export async function resizeWindowCentered(newW: number, newH: number) {
  try {
    const win   = getCurrentWindow();
    const scale = await win.scaleFactor();
    const pos   = (await win.outerPosition()).toLogical(scale);
    const inner = (await win.innerSize()).toLogical(scale);

    const newX = Math.round(pos.x - (newW - inner.width)  / 2);
    const newY = Math.round(pos.y - (newH - inner.height) / 2);

    await win.setPosition(new LogicalPosition(newX, newY));
    await win.setSize(new LogicalSize(newW, newH));
  } catch (err) {
    console.debug('[resizeWindowCentered] skipped:', err);
  }
}


// Kept for compatibility
export async function resizeWindowSideGrowKeepCenterY(side: Side, newW: number, newH: number) {
  return resizeWindowAnchoredToWrapper(side, newW, newH);
}

export async function recenterY(targetCenterY: number) {
  if (!isTauri()) return;
  const win = getCurrentWindow();
  const factor = await win.scaleFactor();
  const pos = (await win.outerPosition()).toLogical(factor);
  const size = (await win.outerSize()).toLogical(factor);
  const newY = Math.round(targetCenterY - size.height / 2);
  await win.setPosition(new LogicalPosition(pos.x, newY));
}

/** Only used by your other helpers — leaving out here for brevity */
export async function resizeByLayout(
  newW: number,
  newH: number,
  _layout: Layout,
  mode: 'nonoLocked' | 'edgeLocked' = 'nonoLocked'
) {
  if (mode === 'nonoLocked') return resizeWindowCentered(newW, newH);
  // In your code you decide left/right from layout; keep that logic where it is
  return resizeWindowCentered(newW, newH);
}

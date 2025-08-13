// lib/window.ts
import {
  getCurrentWindow,
  LogicalPosition,
  LogicalSize,
  PhysicalPosition,
  PhysicalSize,
} from '@tauri-apps/api/window';

export async function getWindowPositionLogical(): Promise<LogicalPosition> {
  const win = getCurrentWindow();
  const phys = await win.innerPosition();
  const factor = await win.scaleFactor();
  return phys.toLogical(factor);
}


export async function getLogicalBounds() {
  const win       = getCurrentWindow();
  const physPos   = await win.outerPosition();
  const physSize  = await win.innerSize();
  const factor    = await win.scaleFactor();
  return {
    pos:  physPos.toLogical(factor),
    size: physSize.toLogical(factor),
  };
}


async function getPhysicalBounds() {
  const win  = getCurrentWindow();
  const pos  = await win.innerPosition();     // physical position
  const size = await win.innerSize();         // physical size
  return { pos, size };
}

/**
 * Core resize helper.
 * @param width  Target **logical** width in px
 * @param height Target **logical** height in px
 * @param keepCenter If `true`, window will shift so its center stays exactly where it was
 */
export async function resizeWindowToFitExact(
  width: number,
  height: number,
  keepCenter = false
) {
  const win = getCurrentWindow();

  if (keepCenter) {
    const { pos, size } = await getPhysicalBounds();

    const centerX = pos.x + size.width  / 2;
    const centerY = pos.y + size.height / 2;

    // compute new top-left so center stays put
    const newX = Math.round(centerX - width  / 2);
    const newY = Math.round(centerY - height / 2);

    // move in logical coords
    await win.setPosition(new LogicalPosition(newX, newY));
  }

  // always set physical size directly
  await win.setSize(new PhysicalSize(width, height));
}

/**
 * Grow/shrink **downwards/rightwards** from top-left.
 * (This is what you want during your hair-clip drag so Nono’s top doesn’t get cut off.)
 */
export async function resizeWindowGrowDown(
  width: number,
  height: number
): Promise<void> {
  return resizeWindowToFitExact(width, height, /* keepCenter= */ false);
}

/**
 * Grow/shrink **around the current center**.
 * (Use this when toggling your menu so Nono never “jumps.”)
 */
export async function resizeWindowKeepCenter(
  width: number,
  height: number
): Promise<void> {
  return resizeWindowToFitExact(width, height, /* keepCenter= */ true);
}

/**
 * Returns the window’s current **physical** inner size in pixels.
 * Useful for calculating deltas before you re-resize.
 */
export async function getWindowSize(): Promise<{
  width: number;
  height: number;
}> {
  const win = getCurrentWindow();
  const s = await win.innerSize();
  return { width: s.width, height: s.height };
}


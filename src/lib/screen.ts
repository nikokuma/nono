import {
  getCurrentWindow,
  LogicalSize,
  LogicalPosition,
  PhysicalSize
} from '@tauri-apps/api/window';

/**
 * Get the scale factor (DPI ratio) of the current window.
 */
export async function getScaleFactor(): Promise<number> {
  const win = await getCurrentWindow();
  return await win.scaleFactor();
}

/**
 * Get logical screen width based on window.screen.
 */
export function getScreenWidth(): number {
  return window.screen.width;
}

/**
 * Get logical screen height based on window.screen.
 */
export function getScreenHeight(): number {
  return window.screen.height;
}

/**
 * Returns the center of the screen as a {x, y} coordinate.
 */

export function getScreenCenter(): LogicalPosition {
  return new LogicalPosition(
    getScreenWidth() / 2,
    getScreenHeight() / 2
  );
}


/**
 * Returns screen bounds with optional padding.
 * Can be used for clamping window or UI positions.
 */
export function getSafeScreenBounds(padding = 0): { minX: number, maxX: number, minY: number, maxY: number } {
  return {
    minX: padding,
    maxX: getScreenWidth() - padding,
    minY: padding,
    maxY: getScreenHeight() - padding
  };
}

/**
 * Determine if a window is on screen (partially or fully).
 */
export function isWindowOnScreen(pos: LogicalPosition, size: LogicalSize): boolean {
  const bounds = getSafeScreenBounds(0);

  const right = pos.x + size.width;
  const bottom = pos.y + size.height;

  const horizontallyVisible = pos.x < bounds.maxX && right > bounds.minX;
  const verticallyVisible = pos.y < bounds.maxY && bottom > bounds.minY;

  return horizontallyVisible && verticallyVisible;
}

export function getScreenSize() {
  return {
    width: window.screen.width,
    height: window.screen.height
  };
}

export function getAvailableScreenHeight(): number {
  return window.screen.availHeight;
}

export function getMaxSafeWindowHeight(): number {
  const availHeight = getAvailableScreenHeight();
  return availHeight - availHeight / 10; // 90% of available screen height
}

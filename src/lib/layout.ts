import { getCurrentWindow } from '@tauri-apps/api/window';
import type { LogicalPosition } from '@tauri-apps/api/dpi';

export type Layout =
| 'bottom-left'
| 'middle'
| 'bottom-right'
| 'right'
| 'left';

export async function getLayout(): Promise<Layout> {
const win = getCurrentWindow();

try {
const position = await win.innerPosition(); // returns PhysicalPosition
const scaleFactor = await win.scaleFactor();
const logical: LogicalPosition = position.toLogical(scaleFactor);

const screenWidth = window.screen.width;
const screenHeight = window.screen.height;

const x = logical.x;
const y = logical.y;

const isLeft = x < screenWidth / 4;
const isRight = x > (screenWidth * 2) / 5;
const isBottom = y > (screenHeight * 2) / 5;

if (isLeft && isBottom) return 'bottom-left';
if (isRight && isBottom) return 'bottom-right';
if (isRight) return 'right';
if (isLeft) return 'left';

// covers top and mid areas
return 'middle';
} catch (err) {
console.error('Error getting layout position:', err);
return 'middle'; // fallback
}
}
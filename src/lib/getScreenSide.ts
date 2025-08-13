import { LogicalPosition } from "@tauri-apps/api/window";

export type Layout =
  | 'bottom-left'
  | 'middle'
  | 'bottom-right'
  | 'right'
  | 'left';

export function getScreenSide(pos: LogicalPosition): Layout {
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;

  const isLeft = pos.x < screenWidth / 4;
  const isRight = pos.x > (screenWidth * 2) / 5;
  const isBottom = pos.y > (screenHeight * 2) / 5;

  if (isLeft && isBottom) return 'bottom-left';
  if (isRight && isBottom) return 'bottom-right';
  if (isRight) return 'right';
  if (isLeft) return 'left';
  return 'middle';
}

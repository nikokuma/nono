import { getCurrentWindow } from '@tauri-apps/api/window';
import type { LogicalPosition } from '@tauri-apps/api/window';
import { getWindowPositionLogical } from './window';

export async function getWindowPosition(): Promise<LogicalPosition> {
  return getWindowPositionLogical();
}

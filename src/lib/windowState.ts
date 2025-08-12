import {
  restoreStateCurrent,
  saveWindowState,
  StateFlags
} from '@tauri-apps/plugin-window-state';

/**
 * Restore the window's last known size and position.
 */
export async function restoreWindowState() {
  await restoreStateCurrent(StateFlags.ALL);
}

/**
 * Save the current window's size and position.
 */
export async function persistWindowState() {
  await saveWindowState(StateFlags.ALL);
}

// src/lib/notify.ts
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { showNonoBubble } from './nonoBubble';

// Call to deliver both system + Nono bubble
export async function remindUser(user: string, title: string, startsAt: Date, minutesLeft: number, onSnooze: (min: number) => void) {
  const body = `${user}, “${title}” starts in ${minutesLeft} min.`;
  try {
    let ok = await isPermissionGranted();
    if (!ok) ok = (await requestPermission()) === 'granted';
    if (ok) {
      await sendNotification({ title: 'Nono reminder', body });
    }
  } catch (e) {
    console.warn('System notification failed:', e);
  }
  // Show in-app bubble with actions
  showNonoBubble({
    message: `${user}, “${title}” starts in ${minutesLeft} minutes! Get ready <3`,
    onSnooze,
  });
}

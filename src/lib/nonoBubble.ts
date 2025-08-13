import { writable } from 'svelte/store';

type BubbleState = {
  visible: boolean;
  message: string;
  // when user taps snooze
  onSnooze?: (min: number) => void;
};

export const bubble = writable<BubbleState>({ visible: false, message: '' });

export function showNonoBubble(opts: { message: string; onSnooze?: (min: number) => void }) {
  bubble.set({ visible: true, message: opts.message, onSnooze: opts.onSnooze });
  // auto-hide after 12s if user ignores it
  setTimeout(() => bubble.update(b => (b.visible ? { ...b, visible: false } : b)), 12000);
}

export function hideNonoBubble() {
  bubble.set({ visible: false, message: '' });
}

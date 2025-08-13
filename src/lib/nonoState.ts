import { writable, get } from 'svelte/store';

export const nonoScale = writable(1);
export const isChibiMode = writable(false);

// Setter
export function setNonoScale(scale: number) {
  nonoScale.set(scale);
  updateChibiMode(scale);
}

// Getter
export function getNonoScale(): number {
  return get(nonoScale);
}

// Toggle chibi manually
export function toggleChibiMode() {
  isChibiMode.update(v => !v);
}

// Auto set chibi mode based on scale
export function updateChibiMode(scale: number) {
  isChibiMode.set(scale <= 0.5);
}

// windowSize.ts
import { writable } from 'svelte/store';

export const windowSize = writable({ width: 0, height: 0 });


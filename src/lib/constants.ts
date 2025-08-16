// --- Nono base sprite (unscaled, logical px) ---
export const BASE_WIDTH  = 300;
export const BASE_HEIGHT = 450;
export const ASPECT_RATIO = BASE_WIDTH / BASE_HEIGHT; // 2:3

// optional snapping if you use it elsewhere
export const HEIGHT_STEP = 3;
export const WIDTH_STEP  = 2;

// bounds (defensive default if window is undefined)
export const MIN_HEIGHT = BASE_HEIGHT * 0.2;
export const MAX_HEIGHT =
  ((typeof window !== 'undefined' ? window.screen.availHeight : 1080) * 5);

// --- Window padding + gap between Nono and panels (unscaled) ---
export const WINDOW_PAD = 24;
export const DOCK_GAP  = 24;

// --- Per-UI base sizes (unscaled). Tweak these; scale multiplies them. ---
export const PANEL_BASE = {
  chat:     { w: 400,  h: 500 },
  calendar: { w: 600, h: 550 },
  todo:     { w: 400,  h: 500 },
  apps:     { w: 200, h: 350},
  menu:     { w: 250, h: 350 },
} as const;

// --- OPTIONAL: per-layout overrides (only add keys you want to change) ---
export const PANEL_BASE_BY_LAYOUT = {
  chat: {
    'bottom-left':  { w: 900,  h: 620 },
    'bottom-right': { w: 900,  h: 620 },
  },
  // calendar: { left: { w: 1280, h: 900 } },
} as const;

// --- OPTIONAL: how to dock when Nono is in a bottom-* zone ---
// 'side'  → panel sits left/right of Nono (width adds)
// 'below' → panel goes under Nono (height stacks)
export const PANEL_DOCK = {
  chat:     'side',
  calendar: 'side',
  todo:     'side',
  apps:     'side',
} as const;

// Layout type used across the app
export type Layout =
  | 'bottom-left'
  | 'middle'
  | 'bottom-right'
  | 'right'
  | 'left';

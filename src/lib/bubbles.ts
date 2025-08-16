// src/lib/ui/bubbles.ts
export type Side = 'left' | 'right';

export type BubbleId = 'apps' | 'list' | 'notes' | 'settings';

export const bubbleSpecs: Record<BubbleId, { baseW: number; baseH: number }> = {
  apps:     { baseW: 360, baseH: 420 },
  list:     { baseW: 300, baseH: 480 },
  notes:    { baseW: 380, baseH: 380 },
  settings: { baseW: 420, baseH: 500 },
};

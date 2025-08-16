// math for docking + sizes + anchoring next to Nono

import {
  BASE_WIDTH, BASE_HEIGHT,
  WINDOW_PAD, DOCK_GAP,
  PANEL_BASE,
  // If you use overrides, uncomment:
  // PANEL_BASE_BY_LAYOUT,
  type Layout
} from './constants';

export type PanelKind = 'chat' | 'calendar' | 'todo' | 'apps' | 'menu';

export function panelSideForLayout(layout: Layout): 'leftOfNono'|'rightOfNono' {
  // middle/right/bottom-right → panel on Nono's LEFT
  // left/bottom-left          → panel on Nono's RIGHT
  if (layout === 'left' || layout === 'bottom-left') return 'rightOfNono';
  return 'leftOfNono';
}

export function getPanelBase(kind: PanelKind, layout: Layout) {
  // plug per-layout overrides if you have them:
  // const ov = (PANEL_BASE_BY_LAYOUT as any)?.[kind]?.[layout];
  // return ov ?? PANEL_BASE[kind];
  return PANEL_BASE[kind];
}

export function targetWindowSizeFor(
  layout: Layout,
  scale: number,
  kind?: PanelKind
) {
  const nonoW = Math.round(BASE_WIDTH  * scale);
  const nonoH = Math.round(BASE_HEIGHT * scale);

  if (!kind) {
    return {
      width:  Math.max(WINDOW_PAD + nonoW + WINDOW_PAD, BASE_WIDTH),
      height: Math.max(WINDOW_PAD + nonoH + WINDOW_PAD, BASE_HEIGHT),
    };
  }

  const base = getPanelBase(kind, layout);
  const panelW = Math.round(base.w * scale);
  const panelH = Math.round(base.h * scale);

  return {
    width:  Math.max(WINDOW_PAD + nonoW + DOCK_GAP + panelW + WINDOW_PAD, BASE_WIDTH),
    height: Math.max(WINDOW_PAD + Math.max(nonoH, panelH) + WINDOW_PAD, BASE_HEIGHT),
  };
}

// panelDock.ts
export function computePanelFrame(nonoEl: HTMLElement, layout: Layout, scale: number, kind: PanelKind) {
  const base = getPanelBase(kind, layout);
  const panelW = Math.round(base.w * scale);
  const panelH = Math.round(base.h * scale);

  const r = nonoEl.getBoundingClientRect();
  const side = panelSideForLayout(layout);

  const GAP = 0;          // hard zero gap
  const TOUCH = -1;       // tiny tuck to avoid 1px seam

  const left = side === 'rightOfNono'
    ? Math.round(r.right + GAP + TOUCH)
    : Math.round(r.left  - panelW - GAP - TOUCH);

  // center vertically around Nono, but clamp to viewport so tops never clip
  let top = Math.round(r.top + (r.height - panelH) / 2);
  const pad = 0;
  const maxTop = window.innerHeight - pad - panelH;
  if (top < pad) top = pad;
  if (top > maxTop) top = Math.max(pad, maxTop);

  return { left, top, w: panelW, h: panelH };
}



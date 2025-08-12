<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store';

  // state
  import { nonoScale, setNonoScale } from '$lib/nonoState';

  // helpers
  import { loadScale } from '$lib/persist';
  import { getLayout } from '$lib/getLayout';
  import { getLogicalBounds } from '$lib/window';

  import {
    getPanelBase,
    targetWindowSizeFor,
    type PanelKind
  } from '$lib/panelDock';

  import {
    resizeWindowAnchoredToWrapper,
    type Side,
  } from '$lib/windowControl';

  import { BASE_HEIGHT, BASE_WIDTH, DOCK_GAP, type Layout } from '$lib/constants';
  import { startResizeDrag } from '$lib/hairclipResize';

  // panels
  import Aichat from '$lib/component/aichat.svelte';
  import ApplicationsSection from '$lib/component/applicationsSection.svelte';
  import Calendar from '$lib/component/calDebug.svelte';
  import TodoPanel from '$lib/component/todoPanel.svelte';
  import NonoBubble from '$lib/component/NonoBubble.svelte';

  /* ------------------------------- UI flags ------------------------------- */
  let menuOpen = false;
  let chatOpen = false;
  let appsOpen = false;
  let calendarOpen = false;
  let todoOpen = false;

  /* -------------------------- layout / measurements ----------------------- */
  let preMenuSize = { width: BASE_WIDTH, height: BASE_HEIGHT };
  let menuLayout: Layout = 'middle';

  let wrapperRef: HTMLElement;
  let panelFrame = { left: 0, top: 0, w: 0, h: 0 };
  let dockSide: Side = 'right';

  /* -------------------------- drag guard for Nono ------------------------- */
  let isDragging = false;
  let dragStartTime = 0;
  function handleMouseDown() { isDragging = false; dragStartTime = Date.now(); }
  function handleMouseMove() { if (Date.now() - dragStartTime > 100) isDragging = true; }

  /* -------------------------- pin / unpin Nono ---------------------------- */
  let pinned = false;
  let pinLeft = 0;
  let pinTop = 0;
  // legacy hook (kept in case you animate later)
  let nonoShiftX = 0;

  function pinNono() {
    if (!wrapperRef) return;
    const r = wrapperRef.getBoundingClientRect();
    pinLeft = Math.round(r.left);
    pinTop  = Math.round(r.top);
    pinned = true;
  }
  function unpinNono() { pinned = false; }

  /* ----------------------------- helpers --------------------------------- */
  function getOpenKind(): PanelKind | null {
    if (chatOpen) return 'chat';
    if (calendarOpen) return 'calendar';
    if (todoOpen) return 'todo';
    if (appsOpen) return 'apps';
    return null;
  }
  const isAnyPanelOpen = () => !!getOpenKind();

  // deterministic map from layout → growth side
  function layoutToDockSide(layout: Layout): Side {
    switch (layout) {
      case 'right':
      case 'bottom-right':
        return 'left';   // Nono on right -> grow LEFT
      case 'left':
      case 'bottom-left':
        return 'right';  // Nono on left  -> grow RIGHT
      case 'middle':
      default:
        return 'right';  // middle -> grow RIGHT
    }
  }

  // if preferred side has no room, flip
  function clampDockSideBySpace(side: Side, kind: PanelKind, scale: number, wrapper: HTMLElement): Side {
    const r = wrapper.getBoundingClientRect();
    const base = getPanelBase(kind, menuLayout);
    const panelW = Math.round(base.w * scale) + DOCK_GAP;

    const spaceLeft  = Math.round(r.left);
    const spaceRight = Math.round(window.innerWidth - r.right);

    if (side === 'right' && spaceRight < panelW && spaceLeft > spaceRight) return 'left';
    if (side === 'left'  && spaceLeft  < panelW && spaceRight > spaceLeft) return 'right';
    return side;
  }

  function panelFrameFromSide(
  wrapper: HTMLElement,
  side: Side,
  scale: number,
  kind: PanelKind
) {
  const r = wrapper.getBoundingClientRect();
  const base = getPanelBase(kind, menuLayout);
  const w = Math.round(base.w * scale);
  const h = Math.round(base.h * scale);

  // horizontal (same as before)
  const left = side === 'left'
    ? Math.round(r.left - DOCK_GAP - w)
    : Math.round(r.right + DOCK_GAP);

  // vertical (center *then clamp* so it never goes off-screen)
  const unclampedTop = Math.round(r.top + (r.height - h) / 2);
  const margin = 12; // keep a little breathing room
  const minTop = margin;
  const maxTop = Math.max(margin, window.innerHeight - h - margin);
  const top = Math.min(Math.max(unclampedTop, minTop), maxTop);

  return { left, top, w, h };
}


  /* ------------------------------ lifecycle ------------------------------ */
  onMount(() => {
    let cancelled = false;

    // restore saved scale
    (async () => {
      try {
        const saved = await loadScale();
        if (!cancelled && saved != null) setNonoScale(saved);
      } catch (e) {
        console.warn('Could not load saved scale', e);
      }
    })();

    // re-anchor panel on window resize (keeps panel kissing Nono)
    const onResize = () => {
      if (!isAnyPanelOpen() || !wrapperRef) return;
      const s = get(nonoScale);
      const kind = getOpenKind();
      if (!kind) return;
      panelFrame = panelFrameFromSide(wrapperRef, dockSide, s, kind);
      console.log('[onResize] reframe', { dockSide, panelFrame });
    };
    window.addEventListener('resize', onResize);

    // if scale changes while a panel is open: pin → grow one-sided → re-anchor
    const unsub = nonoScale.subscribe((s) => {
  void (async () => {
    const kind = getOpenKind();
    if (!kind || !wrapperRef) return;

    pinNono();
    await tick();

    // re-evaluate side & clamp by space
    let side = layoutToDockSide(menuLayout);
    side = clampDockSideBySpace(side, kind, s, wrapperRef);
    dockSide = side;

    const { size: cur } = await getLogicalBounds();
    const { width, height } = targetWindowSizeFor(menuLayout, s, kind);
    const dW = Math.round(width - cur.width);

    console.log('[scale->pre]', { layout: menuLayout, dockSide, cur, target: { width, height }, dW });

    // IMPORTANT: keep the offset when growing LEFT
    if (dockSide === 'left' && dW !== 0) {
      pinLeft = pinLeft + dW;
      await tick();
    }

    await resizeWindowAnchoredToWrapper(dockSide, width, height, wrapperRef);

    const after = await getLogicalBounds();
    console.log('[scale->post]', { after });

    panelFrame = panelFrameFromSide(wrapperRef, dockSide, s, kind);
    console.log('[scale->frame]', { panelFrame });
  })();
});


    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
      unsub();
    };
  });

  /* -------------------------------- actions ------------------------------- */
  async function toggleMenu(e: MouseEvent) {
    e.stopPropagation();
    if (isDragging) return;

    // clicking Nono acts like Back when a panel is open
    if (isAnyPanelOpen()) {
      await backToNono();
      return;
    }

    if (!menuOpen) {
      const { size } = await getLogicalBounds();
      preMenuSize = { width: size.width, height: size.height };
      menuLayout = await getLayout();
      console.log('[toggleMenu] open', { preMenuSize, menuLayout });
      menuOpen = true;
      await tick();
    } else {
      console.log('[toggleMenu] close');
      menuOpen = false;
    }
  }

  async function backToNono() {
  // close all panels
  menuOpen = false;
  chatOpen = appsOpen = calendarOpen = todoOpen = false;

  pinNono();
  await tick();

  const { size: cur } = await getLogicalBounds();
  const targetW = preMenuSize.width;
  const targetH = preMenuSize.height;
  const dW = Math.round(targetW - cur.width); // likely negative when shrinking

  console.log('[back->pre]', { dockSide, cur, target: { w: targetW, h: targetH }, dW });

  // If we were left-anchored, reverse the kept offset
  if (dockSide === 'left' && dW !== 0) {
    pinLeft = pinLeft + dW; // dW negative → subtracts what we added
    await tick();
  }

  await resizeWindowAnchoredToWrapper(dockSide, targetW, targetH, wrapperRef);

  const after = await getLogicalBounds();
  console.log('[back->post]', { after });

  unpinNono();
  nonoShiftX = 0;
  await tick();
}


  async function openPanel(kind: PanelKind) {
  // toggle flags
  menuOpen = false;
  chatOpen = calendarOpen = todoOpen = appsOpen = false;
  if (kind === 'chat') chatOpen = true;
  else if (kind === 'calendar') calendarOpen = true;
  else if (kind === 'todo') todoOpen = true;
  else if (kind === 'apps') appsOpen = true;

  if (!wrapperRef) return;

  // choose side deterministically + clamp by space
  menuLayout = await getLayout();
  const s = get(nonoScale);
  let side = layoutToDockSide(menuLayout);
  side = clampDockSideBySpace(side, kind, s, wrapperRef);
  dockSide = side;

  pinNono();
  await tick();

  const { size: cur } = await getLogicalBounds();
  const { width, height } = targetWindowSizeFor(menuLayout, s, kind);
  const dW = Math.round(width - cur.width);

  console.log('[openPanel->pre]', { kind, layout: menuLayout, dockSide, cur, target: { width, height }, dW });

  // IMPORTANT: keep the compensation if growing LEFT
  if (dockSide === 'left' && dW !== 0) {
    pinLeft = pinLeft + dW;
    await tick();
  }

  await resizeWindowAnchoredToWrapper(dockSide, width, height, wrapperRef);

  const after = await getLogicalBounds();
  console.log('[openPanel->post]', { after });

  // DO NOT restore pinLeft here — we keep it so there’s real space to the left
  panelFrame = panelFrameFromSide(wrapperRef, dockSide, s, kind);
  console.log('[openPanel->frame]', { panelFrame });
}


  const openChat = () => openPanel('chat');
  const openCalendar = () => openPanel('calendar');
  const openTodo = () => openPanel('todo');
  const openApps = () => openPanel('apps');
</script>

<main>
  <div class="nono-stack">
    <div
      class="nono-wrapper"
      class:pinned={pinned}
      bind:this={wrapperRef}
      style="--nonoShiftX:{nonoShiftX}px; --pin-left:{pinLeft}px; --pin-top:{pinTop}px"
      on:mousedown={handleMouseDown}
      on:mousemove={handleMouseMove}
      on:click={toggleMenu}
      data-tauri-drag-region
    >
      <img src="/NonoNeutral.png" alt="Nono" class="nono" data-tauri-drag-region />

      <img
        src="/NonoGreenClip.png"
        alt=""
        class="clip"
        draggable="false"
        on:dragstart|preventDefault
        on:mousedown={(e) => startResizeDrag(e, wrapperRef)}
      />

      {#if menuOpen && !chatOpen && !appsOpen && !calendarOpen && !todoOpen}
        <div class="bubble-container layout-{menuLayout}">
          <div class="bubble" on:click|stopPropagation={openCalendar}>Calendar!</div>
          <div class="bubble" on:click|stopPropagation={openTodo}>To-Do List!</div>
          <div class="bubble" on:click|stopPropagation={openApps}>Applications!</div>
          <div class="bubble" on:click|stopPropagation={openChat}>Nono Chat!</div>
        </div>
      {/if}
    </div>

    {#if chatOpen}
      {#key `${$nonoScale}-chat-${menuLayout}`}
        <div class="panel"
             style="left:{panelFrame.left}px; top:{panelFrame.top}px; width:{panelFrame.w}px; height:{panelFrame.h}px;">
          <div class="panel-scaler"
               style="width:{getPanelBase('chat', menuLayout).w}px; height:{getPanelBase('chat', menuLayout).h}px; transform: scale({$nonoScale});">
            <button on:click={backToNono}>← Back</button>
            <Aichat />
          </div>
        </div>
      {/key}
    {/if}

    {#if calendarOpen}
      {#key `${$nonoScale}-cal-${menuLayout}`}
        <div class="panel"
             style="left:{panelFrame.left}px; top:{panelFrame.top}px; width:{panelFrame.w}px; height:{panelFrame.h}px;">
          <div class="panel-scaler"
               style="width:{getPanelBase('calendar', menuLayout).w}px; height:{getPanelBase('calendar', menuLayout).h}px; transform: scale({$nonoScale});">
            <button on:click={backToNono}>← Back</button>
            <Calendar />
          </div>
        </div>
      {/key}
    {/if}

    {#if todoOpen}
      {#key `${$nonoScale}-todo-${menuLayout}`}
        <div class="panel"
             style="left:{panelFrame.left}px; top:{panelFrame.top}px; width:{panelFrame.w}px; height:{panelFrame.h}px;">
          <div class="panel-scaler"
               style="width:{getPanelBase('todo', menuLayout).w}px; height:{getPanelBase('todo', menuLayout).h}px; transform: scale({$nonoScale});">
            <button on:click={backToNono}>← Back</button>
            <TodoPanel />
          </div>
        </div>
      {/key}
    {/if}

    {#if appsOpen}
      {#key `${$nonoScale}-apps-${menuLayout}`}
        <div class="panel"
             style="left:{panelFrame.left}px; top:{panelFrame.top}px; width:{panelFrame.w}px; height:{panelFrame.h}px;">
          <div class="panel-scaler"
               style="width:{getPanelBase('apps', menuLayout).w}px; height:{getPanelBase('apps', menuLayout).h}px; transform: scale({$nonoScale});">
            <button on:click={backToNono}>← Back</button>
            <ApplicationsSection />
          </div>
        </div>
      {/key}
    {/if}
  </div>

  <NonoBubble />
</main>

<style>
  html, body {
    margin: 0;
    padding: 0;
    overflow: visible;
    background: transparent;
    width: 100%;
    height: 100%;
    overscroll-behavior: none;
  }

  main {
    background: transparent;
    overflow: visible;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .nono-stack {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: visible;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
  }

  .nono-wrapper {
    position: relative;
    transform: translateX(var(--nonoShiftX, 0px));
    transform-origin: center center;
    transition: transform 120ms ease;
    overflow: visible;
    -webkit-app-region: drag;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 300px;
    height: 450px;
  }

  /* when pinned, lock to screen pixels */
  .nono-wrapper.pinned {
    position: fixed;
    left: var(--pin-left);
    top:  var(--pin-top);
    transform: none !important;
  }

  .nono {
    -webkit-app-region: drag;
    z-index: 20;
    object-fit: contain;
    width: 100%;
    height: 100%;
  }

  .clip {
    position: absolute;
    width: 16.67%;
    height: 11.11%;
    z-index: 30;
    top: 11.11%;
    right: 16.67%;
    pointer-events: auto;
    cursor: ns-resize;
    user-select: none;
    -webkit-user-drag: none;
    -webkit-app-region: no-drag;
  }

  .bubble-container {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    z-index: 999;
    pointer-events: none;
  }

  .bubble {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 60%;
    height: 45%;
    background-image: url('/NonoMessageBubble.png');
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 26px;
    text-shadow: 1px 1px 2px black;
    text-align: center;
    overflow: hidden;
    user-select: none;
    cursor: pointer;
    pointer-events: auto;
    -webkit-app-region: no-drag;
    z-index: 998;
    padding: 0 12px;
    box-sizing: border-box;
  }

  .panel {
    position: fixed;
    z-index: 10000;
    background: transparent;
    border-radius: 12px;
    padding: 0;
    overflow: hidden;
    display: flex;
  }

  .panel-scaler {
    transform-origin: top left;
    position: relative;
    width: max-content;
    height: max-content;
    overflow: hidden;
  }

  /* bubbles layout (unchanged) */
  .bubble-container.layout-middle .bubble:nth-child(1) { transform: translate(-160%, -110%); }
  .bubble-container.layout-middle .bubble:nth-child(2) { transform: translate(-140%, -150%); }
  .bubble-container.layout-middle .bubble:nth-child(3) { transform: translate(20%, -150%); }
  .bubble-container.layout-middle .bubble:nth-child(4) { transform: translate(50%, -110%); }

  .bubble-container.layout-left .bubble:nth-child(1) { transform: translate(-30%, -30%); }
  .bubble-container.layout-left .bubble:nth-child(2) { transform: translate(3%, -45%); }
  .bubble-container.layout-left .bubble:nth-child(3) { transform: translate(-18%, -6%); }
  .bubble-container.layout-left .bubble:nth-child(4) { transform: translate(30%, 3%); }

  .bubble-container.layout-right .bubble:nth-child(1) { transform: translate(-160%, 0%); }
  .bubble-container.layout-right .bubble:nth-child(2) { transform: translate(-160%, -50%); }
  .bubble-container.layout-right .bubble:nth-child(3) { transform: translate(-160%, -100%); }
  .bubble-container.layout-right .bubble:nth-child(4) { transform: translate(-160%, -150%); }

  .bubble-container.layout-bottom-left .bubble:nth-child(1) { transform: translate(-30%, 30%); }
  .bubble-container.layout-bottom-left .bubble:nth-child(2) { transform: translate(-45%, 3%); }
  .bubble-container.layout-bottom-left .bubble:nth-child(3) { transform: translate(3%, -18%); }
  .bubble-container.layout-bottom-left .bubble:nth-child(4) { transform: translate(24%, -12%); }

  .bubble-container.layout-bottom-right .bubble:nth-child(1) { transform: translate(36%, 36%); }
  .bubble-container.layout-bottom-right .bubble:nth-child(2) { transform: translate(12%, 30%); }
  .bubble-container.layout-bottom-right .bubble:nth-child(3) { transform: translate(6%, 3%); }
  .bubble-container.layout-bottom-right .bubble:nth-child(4) { transform: translate(-18%, 12%); }
</style>

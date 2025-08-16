<script lang="ts">
  import { onMount } from 'svelte';
  import { Calendar, DayGrid, TimeGrid, Interaction, List } from '@event-calendar/core';
  import '@event-calendar/core/index.css';

  import { remindUser } from '$lib/notify';
  import { showNonoBubble } from '$lib/nonoBubble';
  import { loadEventsFile, saveEventsFile, migrateLocalStorageToFile } from '$lib/storage';

  // -------------------- State --------------------
  let events: any[] = [];

  let showEditor = false;
  let editingId: string | null = null;

  type Draft = {
    id?: string;
    title: string;
    date: string;        // YYYY-MM-DD (start for all-day or date part for timed)
    endDate?: string;    // YYYY-MM-DD (exclusive end for all-day multi-day)
    time?: string;       // HH:mm or HH:mm AM/PM (we normalize)
    durationMin?: number;
    allDay: boolean;
    reminderMin?: number;
  };

  let currentDate = new Date();
  let currentView: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek' = 'dayGridMonth';

  // Derived month label (centered)
  $: currentLabel =
    new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(currentDate);

  // -------------------- Helpers --------------------
  const isoDateOnly = (d: Date) => d.toISOString().slice(0, 10);
  const isoAllDay   = (date: string) => date;
  const toIso       = (d: Date) => d.toISOString();
  const dateOnly    = (d: Date) => d.toISOString().slice(0, 10);

  function parseStart(e: any) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(e.start)) return new Date(`${e.start}T09:00:00`);
    return new Date(e.start);
  }
  function withinRange(d: Date, start: Date, end: Date) { return d >= start && d < end; }
  function fmtTime(d: Date) { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  function toHHMM(d: Date) {
    const hh = String(d.getHours()).padStart(2, '0'); const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  function parseTimeTo24h(raw: string) {
    const s = (raw || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
    if (!m) return { h: 9, m: 0 };
    let h = parseInt(m[1], 10), min = parseInt(m[2], 10), ap = m[3]?.toUpperCase();
    if (ap === 'AM') { if (h === 12) h = 0; } else if (ap === 'PM') { if (h < 12) h += 12; }
    return { h, m: min };
  }
  function buildLocalDate(dateStr: string, timeStr: string) {
    const [Y, M, D] = dateStr.split('-').map(n => parseInt(n, 10));
    const { h, m } = parseTimeTo24h(timeStr);
    return new Date(Y, M - 1, D, h, m, 0, 0);
  }
  function minutesBetween(a: Date, b: Date) { return Math.max(5, Math.round((b.getTime() - a.getTime()) / 60000)); }

  function emptyDraft(date?: string): Draft {
    const d = date ?? isoDateOnly(new Date());
    return { title: '', date: d, endDate: undefined, time: '09:00', durationMin: 60, allDay: true, reminderMin: 60 };
  }
  let draft: Draft = emptyDraft();

  function summarize(range: 'today' | 'tomorrow' | 'week') {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart.getTime() + 86400000);
    const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);

    let start: Date, end: Date;
    if (range === 'today') { start = todayStart; end = tomorrowStart; }
    else if (range === 'tomorrow') { start = tomorrowStart; end = new Date(tomorrowStart.getTime() + 86400000); }
    else { start = weekStart; end = weekEnd; }

    const list = events.map(e => ({ e, d: parseStart(e) }))
      .filter(({ d }) => withinRange(d, start, end))
      .sort((a, b) => a.d.getTime() - b.d.getTime());

    if (list.length === 0) return '— none —';

    return list.map(({ e, d }) => {
      const isAllDay = !!e.allDay || /^\d{4}-\d{2}-\d{2}$/.test(e.start);
      const when = isAllDay ? 'all day' : fmtTime(d);
      return `• ${e.title}  —  ${when}`;
    }).join('\n');
  }
  function showAgendaBubble() {
    const msg = `Today:\n${summarize('today')}\n\nTomorrow:\n${summarize('tomorrow')}\n\nThis week:\n${summarize('week')}`;
    showNonoBubble({ message: msg });
  }

  function updateEvent(id: string, patch: any) {
    events = events.map(e => String(e.id) === id ? { ...e, ...patch } : e);
    persist(); rescheduleReminders();
  }

  // -------------------- Calendar interactions --------------------
  function onDateClick(info: any) {
    const ev = info.jsEvent as MouseEvent | undefined;
    const dateStr = info.dateStr;

    // Alt+Click toggles Month/Week at that date
    if (ev?.altKey) {
      if (options.view === 'timeGridWeek') options = { ...options, view: 'dayGridMonth', date: dateStr };
      else                                  options = { ...options, view: 'timeGridWeek',  date: dateStr };
      return;
    }

    // Double-click → Day view
    if (ev && ev.detail >= 2) { options = { ...options, view: 'timeGridDay', date: dateStr }; return; }

    // Normal click → open editor
    editingId = null;
    if (info.allDay) {
      draft = emptyDraft(dateStr); draft.allDay = true;
    } else {
      const start = info.date as Date;
      draft = emptyDraft(start.toISOString().slice(0, 10));
      draft.allDay = false; draft.time = toHHMM(start); draft.durationMin = 60;
    }
    showEditor = true;
  }

  function onSelect(info: any) {
    editingId = null;
    const start = info.start as Date, end = info.end as Date, allDay = !!info.allDay;
    if (allDay) {
      const startStr = dateOnly(start), endStr = dateOnly(end);
      draft = { ...emptyDraft(startStr), allDay: true, endDate: endStr };
    } else {
      const startDateStr = dateOnly(start), startTimeStr = toHHMM(start), dur = minutesBetween(start, end);
      draft = { ...emptyDraft(startDateStr), allDay: false, time: startTimeStr, durationMin: dur };
    }
    showEditor = true;
  }

  function onEventClick({ event }: any) {
    editingId = String(event.extendedProps?.id ?? event.id ?? '');
    const start = event.start!;
    const isAllDay = !!event.allDay || (!!event.extendedProps?.allDay)
      || (start.getHours() === 0 && start.getMinutes() === 0 && !event.end);

    let endDateExclusive: string | undefined;
    if (isAllDay && event.end) endDateExclusive = dateOnly(event.end);

    draft = {
      id: editingId || undefined,
      title: event.title,
      date: dateOnly(start),
      endDate: endDateExclusive,
      time: isAllDay ? '09:00' : toHHMM(start),
      durationMin: !isAllDay && event.end ? minutesBetween(start, event.end) : 60,
      allDay: isAllDay,
      reminderMin: event.extendedProps?.reminderMin ?? 60
    };
    showEditor = true;
  }

  // -------------------- Save / Delete --------------------
  function upsertEvent() {
    const id = editingId ?? crypto.randomUUID();

    let startStr: string, endStr: string | undefined;
    if (draft.allDay) {
      startStr = isoAllDay(draft.date);
      if (draft.endDate && draft.endDate !== draft.date) endStr = draft.endDate;
    } else {
      const start = buildLocalDate(draft.date, draft.time || '09:00');
      const durMs = Math.max(5, Number(draft.durationMin ?? 60)) * 60_000;
      const end = new Date(start.getTime() + durMs);
      startStr = toIso(start); endStr = toIso(end);
    }

    const newEvt: any = {
      id, title: (draft.title || '').trim(), start: startStr,
      ...(endStr ? { end: endStr } : {}), allDay: !!draft.allDay,
      reminderMin: draft.reminderMin ?? 60
    };
    if (!newEvt.title) return;

    events = editingId ? events.map(e => (String(e.id) === id ? { ...e, ...newEvt } : e))
                       : [...events, newEvt];

    persist(); rescheduleReminders(); showEditor = false; editingId = null;
  }

  function deleteEvent() {
    if (!editingId) return;
    events = events.filter(e => String(e.id) !== editingId);
    persist(); rescheduleReminders(); showEditor = false; editingId = null;
  }

  // -------------------- Calendar options --------------------
  let options: any = {
    view: 'dayGridMonth',
    height: '100%',
    expandRows: true,
    headerToolbar: false,                 // we render our own titlebar
    dayHeaderFormat: { weekday: 'narrow' },
    contentHeight: 'auto',
    handleWindowResize: true,

    selectable: true,
    selectMirror: true,
    select: onSelect,
    dateClick: onDateClick,
    eventClick: onEventClick,

    // time-grid niceties
    slotMinTime: '07:00:00',
    slotMaxTime: '22:00:00',
    slotDuration: '00:30:00',
    snapDuration: '00:15:00',
    nowIndicator: true,

    // drag / drop / resize
    editable: true,
    eventDurationEditable: true,

   datesSet: (info: any) => {
  // use the center of the rendered range as the anchor instead of the first visible day
  const start = info.start as Date;
  const end   = info.end   as Date;
  const center = new Date((start.getTime() + end.getTime()) / 2);
  currentDate = center;
  currentView = (info.view?.type ?? currentView);
},

    events
  };

  // keep options in sync with events
  $: if (events) options = { ...options, events };

  // -------------------- Reminders --------------------
  let intervalId: number | null = null;
  const fired = new Set<string>();
  function startMsFor(e: any) {
    if (e.allDay || /^[0-9-]{10}$/.test(e.start)) return Date.parse(`${e.start}T09:00:00`);
    return Date.parse(e.start);
  }
  async function checkReminders() {
    const now = Date.now();
    for (const e of events) {
      const id = String(e.id ?? e.title + e.start);
      if (fired.has(id)) continue;
      const start = startMsFor(e);
      if (Number.isNaN(start)) continue;

      const remindMs = (e.reminderMin ?? 60) * 60_000;
      const fireAt = start - remindMs;
      if (fireAt <= now && start >= now) {
        const minutesLeft = Math.max(0, Math.round((start - now) / 60000));
        const title = e.title ?? 'Event';
        const idKey = String(e.id ?? title + e.start);
        const snooze = (min: number) => { setTimeout(() => remindUser('Nico', title, new Date(start), 0, snooze), min * 60_000); };
        await remindUser('Nico', title, new Date(start), minutesLeft, snooze);
        fired.add(idKey);
      }
    }
  }
  function rescheduleReminders() {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(checkReminders, 30_000) as unknown as number;
    checkReminders();
  }

  // -------------------- Persistence --------------------
  function persist() { saveEventsFile(events); }
  function isTypingTarget(el: EventTarget | null) {
    const t = el as HTMLElement | null; if (!t) return false;
    const tag = t.tagName?.toLowerCase(); return tag === 'input' || tag === 'textarea' || (t as any).isContentEditable;
  }

  // -------------------- Lifecycle --------------------
  onMount(() => {
    const ctxHandler = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest('.ec')) e.preventDefault();
    };
    document.addEventListener('contextmenu', ctxHandler);

    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'm' || e.key === 'M')      { setMonth();  e.preventDefault(); }
      else if (e.key === 'w' || e.key === 'W') { setWeek();   e.preventDefault(); }
      else if (e.key === 'd' || e.key === 'D') { setDay();    e.preventDefault(); }
      else if (e.key === 'a' || e.key === 'A') { setAgenda(); e.preventDefault(); }
      else if (e.key === 'n' || e.key === 'N') { newEventNow(); e.preventDefault(); }
      else if (e.key === 'ArrowLeft')          { step(-1); e.preventDefault(); }
      else if (e.key === 'ArrowRight')         { step(+1); e.preventDefault(); }
      else if (e.key === 'g' || e.key === 'G') { showAgendaBubble(); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);

    void (async () => {
      try { await migrateLocalStorageToFile(); } catch {}
      events = await loadEventsFile();
      rescheduleReminders();
    })();

    return () => {
      document.removeEventListener('contextmenu', ctxHandler);
      window.removeEventListener('keydown', onKey);
    };
  });

  // -------------------- View helpers --------------------
  function setMonth()  { options = { ...options, view: 'dayGridMonth'  }; }
  function setWeek()   { options = { ...options, view: 'timeGridWeek'  }; }
  function setDay()    { options = { ...options, view: 'timeGridDay'   }; }
  function setAgenda() { options = { ...options, view: 'listWeek'      }; }

  function shiftDate(yyyy_mm_dd: string, days: number) {
    const [Y, M, D] = yyyy_mm_dd.split('-').map(n => parseInt(n, 10));
    const d = new Date(Y, M - 1, D); d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function jump(date: Date) { options = { ...options, date: isoDateOnly(date) }; }
 function step(dir: 1 | -1) {
  const d = new Date(currentDate);

  if (currentView === 'dayGridMonth') {
    // anchor to mid-month so we don’t land on the previous/next month’s
    // leading/trailing grid dates
    d.setDate(15);
    d.setMonth(d.getMonth() + dir);
  } else if (currentView === 'timeGridWeek' || currentView === 'listWeek') {
    // anchor to mid-week
    const day = d.getDay();
    d.setDate(d.getDate() - day + 3); // roughly Wed
    d.setDate(d.getDate() + dir * 7);
  } else { // timeGridDay
    d.setDate(d.getDate() + dir);
  }
  jump(d);
}
  function newEventNow() {
    editingId = null;
    const now = new Date();
    draft = emptyDraft(isoDateOnly(now));
    draft.allDay = (currentView === 'dayGridMonth');
    if (!draft.allDay) {
      const mins = now.getMinutes(); const r = mins % 30 ? mins + (30 - (mins % 30)) : mins;
      now.setMinutes(r, 0, 0); draft.time = toHHMM(now); draft.durationMin = 60;
    }
    showEditor = true;
  }
</script>

<div class="calendar-wrapper">
  <img src="/CalendarBubble.png" class="calendar-frame" alt="frame" />
  <div class="calendar-overlay">
    <!-- Centered Month/Year + prev/next -->
    <div class="panel-titlebar">
      <button class="nav ghost" aria-label="Previous" on:click={() => step(-1)}>←</button>
      <div class="title">{currentLabel}</div>
      <button class="nav ghost" aria-label="Next" on:click={() => step(+1)}>→</button>
    </div>

    <!-- View toggle row -->
    <div class="view-switch">
      <button class="ghost" on:click={setMonth}  aria-pressed={currentView==='dayGridMonth'}>Month</button>
      <button class="ghost" on:click={setWeek}   aria-pressed={currentView==='timeGridWeek'}>Week</button>
      <button class="ghost" on:click={setDay}    aria-pressed={currentView==='timeGridDay'}>Day</button>
      <button class="ghost" on:click={setAgenda} aria-pressed={currentView==='listWeek'}>Agenda</button>
      <button class="ghost" on:click={showAgendaBubble} title="Show agenda bubble">Bubble</button>
    </div>

 <div class="calendar-viewport">
  <div class="calendar-stage">
    <Calendar plugins={[DayGrid, TimeGrid, List, Interaction]} {options} />
  </div>
</div>


  </div>
</div>

{#if showEditor}
  <div class="sheet" on:click={() => (showEditor = false)}>
    <div class="card" on:click|stopPropagation>
      <h3>{editingId ? 'Edit event' : 'Add event'}</h3>

      <label>Date</label>
      <div class="row">
        <button class="ghost" on:click={() => draft.date = shiftDate(draft.date, -1)}>←</button>
        <input value={draft.date} readonly style="flex:1" />
        <button class="ghost" on:click={() => draft.date = shiftDate(draft.date, +1)}>→</button>
      </div>

      <div class="row">
        <label class="chk">
          <input type="checkbox" bind:checked={draft.allDay} />
          <span>All day</span>
        </label>
      </div>

      {#if draft.allDay}
        <label>End date (optional)</label>
        <input type="date" bind:value={draft.endDate} />
      {:else}
        <label>Start time</label>
        <input type="text" bind:value={draft.time} placeholder="e.g. 3:00 PM or 15:00" />
        <label>Duration (min)</label>
        <input type="number" min="5" step="5" bind:value={draft.durationMin} />
      {/if}

      <label>Title</label>
      <input bind:value={draft.title} placeholder="What’s happening?" />

      <label>Reminder (min before)</label>
      <input type="number" min="0" step="5" bind:value={draft.reminderMin} />

      <div class="row end">
        {#if editingId}
          <button class="danger" on:click={deleteEvent}>Delete</button>
          <div style="flex:1"></div>
        {/if}
        <button on:click={() => (showEditor = false)}>Cancel</button>
        <button class="primary" on:click={upsertEvent}>Save</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* FRAME LAYOUT */
  .calendar-wrapper { position: relative; width: 100%; height: 100%; }
  .calendar-frame  { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; z-index:1; pointer-events:none; }

  .calendar-overlay{
    position:absolute;
    top:20px; left:70px; right:70px; bottom:60px; /* pulled up, more bottom room */
    z-index:2;
    display:flex; flex-direction:column; min-height:0; gap:8px;
    overflow: hidden; /* no outer scrollbars */
  }

  /* CUSTOM TITLEBAR */
  .panel-titlebar{
    position: relative;
    display:flex; align-items:center; justify-content:center;
    height: 20px;
  }
  .panel-titlebar .title{
    font-weight: 800; letter-spacing: .02em; color:#fff; text-align:center;
  }
  .panel-titlebar .nav{
    position: absolute; top:0; bottom:0; width: 36px;
  }
  .panel-titlebar .nav:first-child{ left: 0; }
  .panel-titlebar .nav:last-child{  right: 0; }

  .view-switch{ display:flex; gap:8px; justify-content:center; }

  /* CALENDAR AREA */
  .calendar-overlay :global(.ec){ flex:1; min-height:0; background:transparent; color:#fff; }

/* Viewport crops the stage so you don’t see overflow/scrollbars */
.calendar-viewport{
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;            /* <- no scrollbars */
}

/* Stage = the whole calendar content you can move/scale independently */
.calendar-stage{
  position: absolute;
  inset: 0;

  /* 🔧 knobs you can tweak live */
  --cal-x:0px;                 /* move whole calendar left/right */
  --cal-y: 0px;                /* move whole calendar up/down */
  --cal-scale-x: 0.97;          /* stretch/squish horizontally */
  --cal-scale-y: 0.88;    
       /* stretch/squish vertically (your “shrink Y only”) */
  --ec-body-x:  -8px;   /* move left/right */
  --ec-body-y: 18px;  /* move up/down */
  --ec-body-scale-x: 0.955;
  --ec-body-scale-y: .545;

  --ec-header-y: 0px;
--ec-header-x: -8px;
--ec-header-scale-x: 0.955;
--ec-header-scale-y: 1;




  transform:
    translate(var(--cal-x), var(--cal-y))
    scaleX(var(--cal-scale-x))
    scaleY(var(--cal-scale-y));
  transform-origin: top center; /* lines up nicely with your frame */
}


/* Hover a day cell → make its number red */
:global(.ec .ec-day:hover .ec-day-head time) {
  color: #ff6a6a !important;
  text-shadow: 0 0 6px rgba(255,120,120,.35);
}



/* Sunday letter in the header row only */
:global(.ec .ec-header .ec-day.ec-sun),
:global(.ec .ec-header .ec-day.ec-sun > *) {
  color: #ff6a6a !important;
}




  /* kill borders & divider backgrounds (all views) */
  :global(.ec){ --ec-border-color: transparent !important; }
  :global(.ec .ec-scrollgrid),
  :global(.ec .ec-scrollgrid th),
  :global(.ec .ec-scrollgrid td),
  :global(.ec .ec-daygrid),
  :global(.ec .ec-daygrid-day),
  :global(.ec .ec-daygrid-day-frame),
  :global(.ec .ec-daygrid-day-top),
  :global(.ec .ec-col-header),
  :global(.ec .ec-col-header-cell),
  :global(.ec .ec-timegrid),
  :global(.ec .ec-timegrid-slot),
  :global(.ec .ec-timegrid-axis),
  :global(.ec .ec-timegrid-divider),
  :global(.ec .ec-list),
  :global(.ec .ec-list-table td){
    border: 0 !important;
    background: transparent !important;
  }
  :global(.ec .ec-daygrid-day)::before,
  :global(.ec .ec-daygrid-day)::after,
  :global(.ec .ec-timegrid-slot)::before{ display:none !important; }

  /* Move the whole month/week/day grid block */
:global(.ec .ec-body){
  position: relative !important;
  top: var(--ec-body-y, 0px);     /* vertical nudge */
  left: var(--ec-body-x, 0px);    /* horizontal nudge */
  transform: scaleX(var(--ec-body-scale-x, 1))
             scaleY(var(--ec-body-scale-y, 1));
  transform-origin: top center;  /* keeps scaling aligned */
}


/* Move the whole header block */
:global(.ec .ec-header) {
  position: relative !important;
  top: var(--ec-header-y, 0px);     /* vertical nudge */
  left: var(--ec-header-x, 0px);    /* horizontal nudge */
  transform: scaleX(var(--ec-header-scale-x, 1))
             scaleY(var(--ec-header-scale-y, 1));
  transform-origin: top center;    /* keeps scaling aligned */
}

/* Each cell becomes a positioning context */
:global(.ec .ec-daygrid-day) {
  position: relative;
}

:global(.ec .ec-day-head) {
  position: absolute !important;

  /* tweak these like knobs */
  --daynum-top:     46%;   /* move up/down within cell (0% = top, 50% = middle) */
  --daynum-left:    50%;   /* move left/right (50% = center) */
  --daynum-scale-x: 1.6;   /* horizontal stretch */
  --daynum-scale-y: 3;   /* vertical stretch */

  top: var(--daynum-top);
  left: var(--daynum-left);
  transform: translate(-50%, -50%) scaleX(var(--daynum-scale-x)) scaleY(var(--daynum-scale-y));
  transform-origin: center;

  /* keep clicks going to events, not the number */
  pointer-events: none;
  z-index: 1; /* sits over bg, under events by default */
}


/* Typography for the number itself */
:global(.ec .ec-day-head time) {
  font-size: 16px;     /* change size */
  font-weight: 700;
  line-height: 1;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,.35);
}

/* If you need it behind events entirely, lower z-index: */
:global(.ec .ec-events) { z-index: 2; }
:global(.ec .ec-day-head) { z-index: 0; }  /* optional */


  /* stop internal scroll areas from creating scrollbars */
  :global(.ec .ec-scroller),
  :global(.ec .ec-scroller-harness){ overflow: visible !important; }
  :global(.ec), :global(.ec .ec-scrollgrid){ height: 200% !important; }

  /* cosmetics */
  :global(.ec .ec-col-header-cell){ color:#eee !important; font-weight:800 !important; background:transparent !important; }
  :global(.ec .ec-daygrid-day-number){ color:#ddd !important; font-weight:700 !important;}

  /* Events */
  :global(.ec .ec-event){
    background: rgba(127, 212, 255, .25) !important;
    border: 1px solid rgba(127, 212, 255, .45) !important;
    color:#fff !important;
    border-radius: 8px !important;
    backdrop-filter: blur(2px);
  }

  /* Modal/editor */
  .sheet { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: grid; place-items: center; z-index: 10001; }
  .card  { width: 360px; background:#111; color:#fff; padding:16px; border-radius:12px; box-shadow:0 12px 30px rgba(0,0,0,.5); }
  label { display:block; margin-top:10px; font-size:14px; color:#ccc; }
  input { width:100%; margin-top:6px; padding:8px; border-radius:8px; border:1px solid #444; background:#1a1a1a; color:#fff; }
  .row { display:flex; gap:8px; align-items:center; margin-top:8px; }
  .row.end { justify-content:flex-end; }
  .chk { display:flex; gap:8px; align-items:center; color:#ddd; }
  button { padding:8px 12px; border-radius:8px; border:1px solid #555; background:#222; color:#fff; cursor:pointer; }
  button.primary { background:#2d7; border-color:#2d7; color:#000; font-weight:700; }
  button.danger  { background:#e55; border-color:#e55; }
  button.ghost { background: transparent; border-color: #444; color:#ddd; }
</style>

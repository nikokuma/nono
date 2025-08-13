<script lang="ts">
  import { onMount } from 'svelte';
  import { Calendar, DayGrid, TimeGrid, Interaction, List } from '@event-calendar/core';
  import '@event-calendar/core/index.css';
  import { remindUser } from '$lib/notify';
  import { showNonoBubble } from '$lib/nonoBubble';
  import { loadEventsFile, saveEventsFile, migrateLocalStorageToFile } from '$lib/storage';

  // -------------------- Persistence --------------------
  const LS_KEY = 'nono.events.v1';
  function loadEvents() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      console.log('[Nono] loaded', Array.isArray(list) ? list.length : 0, 'events from storage');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      console.warn('[Nono] loadEvents failed', e);
      return [];
    }
  }
  function saveEvents(list: any[]) {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
    console.log('[Nono] saved', list.length, 'events');
  }

  // -------------------- State --------------------
  let events: any[] = loadEvents();


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

  let currentDate = new Date();           // anchor for nav
let currentView = 'dayGridMonth';


function sameDay(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function parseStart(e: any) {
  // all-day "YYYY-MM-DD" vs ISO datetime
  if (/^\d{4}-\d{2}-\d{2}$/.test(e.start)) return new Date(`${e.start}T09:00:00`);
  return new Date(e.start);
}
function withinRange(d: Date, start: Date, end: Date) {
  return d >= start && d < end;
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function summarize(range: 'today' | 'tomorrow' | 'week') {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 86400000);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday-start; tweak if Mon-start
  const weekEnd = new Date(weekStart.getTime() + 7*86400000);

  let start: Date, end: Date;
  if (range === 'today') { start = todayStart; end = tomorrowStart; }
  else if (range === 'tomorrow') { start = tomorrowStart; end = new Date(tomorrowStart.getTime()+86400000); }
  else { start = weekStart; end = weekEnd; }

  const list = events
    .map(e => ({ e, d: parseStart(e) }))
    .filter(({d}) => withinRange(d, start, end))
    .sort((a,b) => a.d.getTime() - b.d.getTime());

  if (list.length === 0) return '— none —';

  return list.map(({e, d}) => {
    const isAllDay = !!e.allDay || /^\d{4}-\d{2}-\d{2}$/.test(e.start);
    const when = isAllDay ? 'all day' : fmtTime(d);
    return `• ${e.title}  —  ${when}`;
  }).join('\n');
}

function showAgendaBubble() {
  const msg =
    `Today:\n${summarize('today')}\n\n` +
    `Tomorrow:\n${summarize('tomorrow')}\n\n` +
    `This week:\n${summarize('week')}`;
  showNonoBubble({ message: msg });
}


function isoDateOnly(d: Date) { return d.toISOString().slice(0,10); }

  let draft: Draft = emptyDraft();

  function emptyDraft(date?: string): Draft {
    const d = date ?? new Date().toISOString().slice(0,10);
    return { title: '', date: d, endDate: undefined, time: '09:00', durationMin: 60, allDay: true, reminderMin: 60 };
  }

  // -------------------- Utilities --------------------
  const isoAllDay = (date: string) => date; // YYYY-MM-DD
  const toIso     = (d: Date) => d.toISOString();
  const dateOnly  = (d: Date) => d.toISOString().slice(0,10);
  function toHHMM(d: Date) {
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    return `${hh}:${mm}`;
  }
  function parseTimeTo24h(raw: string) {
    const s = (raw || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
    if (!m) return { h: 9, m: 0 };
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ap = m[3]?.toUpperCase();
    if (ap === 'AM') { if (h === 12) h = 0; }
    else if (ap === 'PM') { if (h < 12) h += 12; }
    return { h, m: min };
  }
  function buildLocalDate(dateStr: string, timeStr: string) {
    const [Y, M, D] = dateStr.split('-').map(n => parseInt(n, 10));
    const { h, m } = parseTimeTo24h(timeStr);
    return new Date(Y, M - 1, D, h, m, 0, 0);
  }
  function minutesBetween(a: Date, b: Date) {
    return Math.max(5, Math.round((b.getTime() - a.getTime()) / 60000));
  }

  function updateEvent(id: string, patch: any) {
    events = events.map(e => String(e.id) === id ? { ...e, ...patch } : e);
    saveEvents(events);
    rescheduleReminders();
  }

function onDateClick(info: any) {
  const ev = info.jsEvent as MouseEvent | undefined;
  const dateStr = info.dateStr;

  // Alt+Click: toggle Week <-> Month anchored on clicked date
  if (ev?.altKey) {
    if (options.view === 'timeGridWeek') {
      options = { ...options, view: 'dayGridMonth', date: dateStr };
    } else {
      options = { ...options, view: 'timeGridWeek',  date: dateStr };
    }
    return;
  }

  // Double-click → Day view for that date
  if (ev && ev.detail >= 2) {
    options = { ...options, view: 'timeGridDay', date: dateStr };
    return;
  }

  // Normal click → open editor (all-day in Month, timed in TimeGrid)
  editingId = null;
  if (info.allDay) {
    draft = emptyDraft(dateStr);
    draft.allDay = true;
  } else {
    const start = info.date as Date;
    draft = emptyDraft(start.toISOString().slice(0,10));
    draft.allDay = false;
    draft.time = toHHMM(start);
    draft.durationMin = 60;
  }
  showEditor = true;
}



  function onSelect(info: any) {
    // Fired for range select in Month (all-day) and also for time range in TimeGrid
    editingId = null;

    const start = info.start as Date;
    const end   = info.end as Date;       // exclusive end
    const allDay = !!info.allDay;

    if (allDay) {
      // Multi-day all-day range on Month view
      const startStr = dateOnly(start);
      const endStr   = dateOnly(end);     // exclusive end
      draft = {
        ...emptyDraft(startStr),
        allDay: true,
        endDate: endStr,                  // editor will show End date
      };
    } else {
      // Time range on Week/Day
      const startDateStr = dateOnly(start);
      const startTimeStr = toHHMM(start);
      const dur = minutesBetween(start, end);
      draft = {
        ...emptyDraft(startDateStr),
        allDay: false,
        time: startTimeStr,
        durationMin: dur,
      };
    }
    showEditor = true;
  }

  function onEventClick({ event }: any) {
    editingId = String(event.extendedProps?.id ?? event.id ?? '');
    const start = event.start!;
    const isAllDay = !!event.allDay || (!!event.extendedProps?.allDay)
      || (start.getHours() === 0 && start.getMinutes() === 0 && !event.end);

    let endDateExclusive: string | undefined;
    if (isAllDay && event.end) {
      endDateExclusive = dateOnly(event.end);
    }

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

    // Build start/end consistently
    let startStr: string;
    let endStr: string | undefined;

    if (draft.allDay) {
      startStr = isoAllDay(draft.date);       // "YYYY-MM-DD"
      // allow multi-day all-day via exclusive end
      if (draft.endDate && draft.endDate !== draft.date) {
        endStr = draft.endDate;               // also "YYYY-MM-DD" (exclusive)
      } else {
        endStr = undefined;                   // single-day all-day → no end
      }
    } else {
      const start = buildLocalDate(draft.date, draft.time || '09:00');
      const durMs = Math.max(5, Number(draft.durationMin ?? 60)) * 60_000;
      const end   = new Date(start.getTime() + durMs);
      startStr = toIso(start);
      endStr   = toIso(end);
    }

    const newEvt: any = {
      id,
      title: (draft.title || '').trim(),
      start: startStr,
      ...(endStr ? { end: endStr } : {}),
      allDay: !!draft.allDay,
      reminderMin: draft.reminderMin ?? 60
    };
    if (!newEvt.title) return;

    if (editingId) {
      events = events.map(e => (String(e.id) === id ? { ...e, ...newEvt } : e));
    } else {
      events = [...events, newEvt]; // reassign to trigger update
    }

    saveEvents(events);
    rescheduleReminders();
    showEditor = false;
    editingId = null;
  }

  function deleteEvent() {
    if (!editingId) return;
    events = events.filter(e => String(e.id) !== editingId);
    saveEvents(events);
    rescheduleReminders();
    showEditor = false;
    editingId = null;
  }

  // -------------------- Calendar options --------------------
  let options: any = {
    view: 'dayGridMonth',
    height: '100%',
    expandRows: true,
    headerToolbar: { start: 'title', center: '', end: 'today prev,next' },

    // selection / clicks
    selectable: true,
    selectMirror: true,
    select: onSelect,       // NEW: range select handler
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
  // Anchor for left/right arrow navigation
  currentDate = info.start ?? new Date();
  currentView = info.view?.type ?? currentView;
},


    eventDrop: ({ event }: any) => {
      const id = String(event.extendedProps?.id ?? event.id);
      if (event.allDay) {
        updateEvent(id, {
          start: dateOnly(event.start!),
          end: event.end ? dateOnly(event.end) : undefined,
          allDay: true
        });
      } else {
        updateEvent(id, {
          start: toIso(event.start!),
          end: event.end ? toIso(event.end) : undefined,
          allDay: false
        });
      }
    },

    eventResize: ({ event }: any) => {
      const id = String(event.extendedProps?.id ?? event.id);
      if (event.allDay) {
        updateEvent(id, { end: event.end ? dateOnly(event.end) : undefined, allDay: true });
      } else {
        updateEvent(id, { end: event.end ? toIso(event.end) : undefined, allDay: false });
      }
    },

    events
  };

  // When events change, rebuild options to force refresh
  $: if (events) {
    options = { ...options, events };
    console.log('[Nono] events now', events.length);
  }

  // -------------------- Reminders (console + bubble via notify helper) --------------------
  let intervalId: number | null = null;
  const fired = new Set<string>();

  function startMsFor(e: any) {
    // Normalize all-day reminders to 09:00 local
    if (e.allDay || /^[0-9-]{10}$/.test(e.start)) {
      return Date.parse(`${e.start}T09:00:00`);
    }
    return Date.parse(e.start);
  }

  async function checkReminders() {
    const now = Date.now();
    const soon = now + 24 * 60 * 60 * 1000;

    for (const e of events) {
      const id = String(e.id ?? e.title + e.start);
      if (fired.has(id)) continue;

      const start = startMsFor(e);
      if (Number.isNaN(start)) continue;

      const remindMs = (e.reminderMin ?? 60) * 60 * 1000;
      const fireAt = start - remindMs;

      if (fireAt <= now && start >= now) {
        const minutesLeft = Math.max(0, Math.round((start - now) / 60000));
        const title = e.title ?? 'Event';
        const idKey = String(e.id ?? title + e.start);
        const snooze = (min: number) => {
          setTimeout(() => {
            remindUser('Nico', title, new Date(start), 0, snooze);
          }, min * 60_000);
        };
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

  // ---- persistence helpers (keep near top-level, not inside onMount)
function persist() {
  saveEventsFile(events);
}

function isTypingTarget(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || (t as any).isContentEditable;
}

// ---- mount lifecycle
onMount(() => {
  // 1) Disable context menu only inside the calendar
  const ctxHandler = (e: MouseEvent) => {
    const el = e.target as HTMLElement | null;
    if (el && el.closest('.ec')) e.preventDefault();
  };
  document.addEventListener('contextmenu', ctxHandler);

  // 2) Keyboard shortcuts
  const onKey = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    if (e.key === 'm' || e.key === 'M') { setMonth(); e.preventDefault(); }
    else if (e.key === 'w' || e.key === 'W') { setWeek();  e.preventDefault(); }
    else if (e.key === 'd' || e.key === 'D') { setDay();   e.preventDefault(); }
    else if (e.key === 'a' || e.key === 'A') { setAgenda();e.preventDefault(); }
    else if (e.key === 'g' || e.key === 'G') { showAgendaBubble(); e.preventDefault(); }
    else if (e.key === 'n' || e.key === 'N') { newEventNow(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft')  { step(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { step(+1); e.preventDefault(); }
  };
  window.addEventListener('keydown', onKey);

  // 3) Do async stuff in an IIFE (so onMount stays sync)
  void (async () => {
    try { await migrateLocalStorageToFile(); } catch {}
    events = await loadEventsFile();
    rescheduleReminders();
  })();

  // 4) Cleanup on unmount
  return () => {
    document.removeEventListener('contextmenu', ctxHandler);
    window.removeEventListener('keydown', onKey);
  };
});

onMount(() => {
  // 1) Disable context menu only inside the calendar
  const ctxHandler = (e: MouseEvent) => {
    const el = e.target as HTMLElement | null;
    if (el && el.closest('.ec')) e.preventDefault();
  };
  document.addEventListener('contextmenu', ctxHandler);

  // 2) Keyboard shortcuts
  const onKey = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    if (e.key === 'm' || e.key === 'M') { setMonth(); e.preventDefault(); }
    else if (e.key === 'w' || e.key === 'W') { setWeek();  e.preventDefault(); }
    else if (e.key === 'd' || e.key === 'D') { setDay();   e.preventDefault(); }
    else if (e.key === 'a' || e.key === 'A') { setAgenda();e.preventDefault(); }
    else if (e.key === 'g' || e.key === 'G') { showAgendaBubble(); e.preventDefault(); }
    else if (e.key === 'n' || e.key === 'N') { newEventNow(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft')  { step(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { step(+1); e.preventDefault(); }
  };
  window.addEventListener('keydown', onKey);

  // 3) Do async stuff in an IIFE (so onMount stays sync)
  void (async () => {
    try { await migrateLocalStorageToFile(); } catch {}
    events = await loadEventsFile();
    rescheduleReminders();
  })();

  // 4) Cleanup on unmount
  return () => {
    document.removeEventListener('contextmenu', ctxHandler);
    window.removeEventListener('keydown', onKey);
  };
});


function onKey(e: KeyboardEvent) {
  if (isTypingTarget(e.target)) return;

  // View switches
  if (e.key === 'm' || e.key === 'M') { setMonth(); e.preventDefault(); }
  else if (e.key === 'w' || e.key === 'W') { setWeek(); e.preventDefault(); }
  else if (e.key === 'd' || e.key === 'D') { setDay(); e.preventDefault(); }
  else if (e.key === 'a' || e.key === 'A') { setAgenda(); e.preventDefault(); }

  // New event
  else if (e.key === 'n' || e.key === 'N') { newEventNow(); e.preventDefault(); }

  // Navigate
  else if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
  else if (e.key === 'ArrowRight'){ step(+1); e.preventDefault(); }
  else if (e.key === 'g' || e.key === 'G') { showAgendaBubble(); e.preventDefault(); }



window.addEventListener('keydown', onKey);
return () => window.removeEventListener('keydown', onKey);

}


  // -------------------- View toggle helpers --------------------
  function setMonth()  { options = { ...options, view: 'dayGridMonth'  }; }
  function setWeek()   { options = { ...options, view: 'timeGridWeek'  }; }
  function setDay()    { options = { ...options, view: 'timeGridDay'   }; }
  function setAgenda() { options = { ...options, view: 'listWeek'      }; }

  function shiftDate(yyyy_mm_dd: string, days: number) {
  const [Y,M,D] = yyyy_mm_dd.split('-').map(n => parseInt(n,10));
  const d = new Date(Y, M-1, D);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}

function jump(date: Date) {
  options = { ...options, date: isoDateOnly(date) };
}

function step(dir: 1 | -1) {
  const d = new Date(currentDate);
  if (currentView === 'timeGridDay') d.setDate(d.getDate() + dir);
  else if (currentView === 'timeGridWeek') d.setDate(d.getDate() + dir * 7);
  else /* month or list */ {
    d.setMonth(d.getMonth() + dir);
  }
  jump(d);
}

function newEventNow() {
  editingId = null;
  const now = new Date();
  draft = emptyDraft(isoDateOnly(now));
  draft.allDay = (currentView === 'dayGridMonth');
  if (!draft.allDay) {
    // round to next 30 minutes
    const mins = now.getMinutes();
    const r = mins % 30 ? mins + (30 - (mins % 30)) : mins;
    now.setMinutes(r, 0, 0);
    draft.time = toHHMM(now);
    draft.durationMin = 60;
  }
  showEditor = true;
}

</script>

<div class="calendar-wrapper">
  <img src="/CalendarBubble.png" class="calendar-frame" alt="frame" />
  <div class="calendar-overlay">
    <div class="calendar-panel-header">
      <button on:click={() => dispatchEvent(new Event('nono-back'))}>← Back</button>
      <div style="flex:1"></div>
      <button on:click={setMonth}>Month</button>
      <button on:click={setWeek}>Week</button>
      <button on:click={setDay}>Day</button>
      <button on:click={setAgenda}>Agenda</button>
      <button on:click={showAgendaBubble}>Agenda Bubble</button>

    </div>

    <!-- NEW: TimeGrid added alongside DayGrid/List/Interaction -->
    <Calendar plugins={[DayGrid, TimeGrid, List, Interaction]} {options} />
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
        <!-- Show End date to support multi-day all-day -->
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
  .calendar-wrapper { position: relative; width: 100%; height: 100%; }
  .calendar-frame  { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; z-index:1; pointer-events:none; }

  .calendar-overlay{
    position:absolute;
    /* tweak these to fit your PNG’s inner box */
    top:110px; left:70px; right:70px; bottom:90px;
    z-index:2; display:flex; flex-direction:column; min-height:0; gap:8px;
  }

  .calendar-panel-header { display:flex; align-items:center; gap:8px; }

  .calendar-overlay :global(.ec){ flex:1; min-height:0; }

  /* barebones modal */
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
  button.ghost { background: transparent; border-color: #444; }

</style>

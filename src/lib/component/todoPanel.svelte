<script lang="ts">
  import { onMount } from 'svelte';
  import { format } from 'date-fns';
  import {
    loadTodosFile, saveTodosFile, migrateTodosFromLocalStorage,
    newTodoDraft, addTodo, updateTodo, deleteTodo, listForDay, type Todo
  } from '$lib/storageTodos';
  import { loadEventsFile, addEventToFile } from '$lib/storage';
  import { showNonoBubble } from '$lib/nonoBubble';

  type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

  // --- recurrence state (collapsed by default) ---
  let recEnabled = false;
  let recFreq: Freq = 'DAILY';
  let recInterval = 1;
  let recByWeekday: Set<number> = new Set();
  let recByMonthDay = '';
  let recByMonth = '';
  let recIncludeStart = false;
  let showAdvanced = false;

  // --- publish toggle ---
  let publishToCalendar = false;

  // --- day data ---
  let today = new Date();
  let todos: Todo[] = [];
  let todaysTodos: Todo[] = [];
  let eventsToday: any[] = [];

  // --- composer (hidden until + clicked) ---
  let showComposer = false;
  let inputTitle = '';
  let inputTime = '';
  let inputTags = '';
  let showNotesFor: string | null = null;

  function refreshViews() {
    todaysTodos = listForDay(todos, today);
  }

  function toLocalISO(date: Date, timeHHMM: string | null): string | null {
    if (!timeHHMM || !/^\d{1,2}:\d{2}$/.test(timeHHMM)) return null;
    const [h, m] = timeHHMM.split(':').map(n => parseInt(n, 10));
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0).toISOString();
  }

  async function doAdd() {
    if (!inputTitle.trim()) return;
    const dueISO = toLocalISO(today, inputTime) ?? null;
    const t = newTodoDraft(inputTitle.trim(), dueISO);
    t.tags = inputTags.split(',').map(s => s.trim()).filter(Boolean);

    if (recEnabled) {
      const rule: any = {
        freq: recFreq,
        interval: Math.max(1, Number(recInterval)||1),
        includeStart: recIncludeStart,
        dtStart: new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
      };
      if (recFreq === 'WEEKLY') rule.byWeekday = Array.from(recByWeekday.values()).sort();
      if (recFreq === 'MONTHLY') {
        rule.byMonthDay = recByMonthDay.split(',').map(s => parseInt(s.trim(),10))
          .filter(n => Number.isFinite(n) && n>=1 && n<=31);
      }
      if (recFreq === 'YEARLY') {
        rule.byMonth = recByMonth.split(',').map(s => parseInt(s.trim(),10))
          .filter(n => Number.isFinite(n) && n>=1 && n<=12);
        rule.byMonthDay = recByMonthDay.split(',').map(s => parseInt(s.trim(),10))
          .filter(n => Number.isFinite(n) && n>=1 && n<=31);
      }
      t.recurrence = rule;
    }

    await addTodo(t);
    todos = await loadTodosFile();
    inputTitle = inputTime = inputTags = '';
    showComposer = false;
    refreshViews();

    if (publishToCalendar) {
      const start = t.due ?? new Date(today).toISOString();
      const allDay = !t.due;
      const eventId = await addEventToFile({
        title: t.title, start, allDay, reminderMin: 30
      });
      await updateTodo(t.id, { linkedEventId: eventId });
    }
  }

  async function cycleStatus(t: Todo) {
    const order: Todo['status'][] = ['white','blue','green','red'];
    const i = order.indexOf(t.status);
    const next = order[(i+1) % order.length];
    await updateTodo(t.id, { status: next });
    todos = await loadTodosFile();
    refreshViews();
  }

  async function saveNotes(t: Todo, notes: string) {
    await updateTodo(t.id, { notes });
    todos = await loadTodosFile();
    refreshViews();
  }

  async function remove(t: Todo) {
    await deleteTodo(t.id);
    todos = await loadTodosFile();
    refreshViews();
  }

  function prevDay() { today = new Date(today.getTime() - 86400000); refreshViews(); void refreshEventsToday(); }
  function nextDay() { today = new Date(today.getTime() + 86400000); refreshViews(); void refreshEventsToday(); }

  function fmtDue(t: Todo) {
    if (!t.due) return '—';
    const d = new Date(t.due);
    return format(d, 'h:mm a');
  }

  function statusDot(s: Todo['status']) {
    return s === 'green' ? '✓' : s === 'blue' ? '●' : s === 'red' ? '✕' : '○';
  }

  async function refreshEventsToday() {
    const events = await loadEventsFile();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(start.getTime() + 86400000);
    function parseStart(e: any) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(e.start)) return new Date(`${e.start}T09:00:00`);
      return new Date(e.start);
    }
    eventsToday = events
      .map((e: any) => ({ e, d: parseStart(e) }))
      .filter(({ d }: any) => d >= start && d < end)
      .sort((a: any, b: any) => a.d.getTime() - b.d.getTime());
  }

  onMount(async () => {
    try { await migrateTodosFromLocalStorage(); } catch {}
    todos = await loadTodosFile();
    refreshViews();
    await refreshEventsToday();
  });

  function pickRandom() {
    const pool = todaysTodos.filter(t => t.status === 'white' || t.status === 'blue');
    if (pool.length === 0) {
      showNonoBubble?.({ message: "Nothing to pick today. Maybe add a small task?" });
      return;
    }
    const choice = pool[Math.floor(Math.random() * pool.length)];
    console.log(`[Nono] Random picked: ${choice.title}`);
  }
</script>

<div class="todo-wrapper">
  <img src="/todolistbackdrop.png" alt="frame" class="todo-bg" />
  <div class="todo-overlay">
    <!-- HEADER -->
    <div class="header">
      <button class="ghost chevron" on:click={prevDay} aria-label="Previous day">‹</button>
      <div class="title">{format(today, 'EEEE, MMM d')}</div>
      <button class="ghost chevron" on:click={nextDay} aria-label="Next day">›</button>

      <div class="head-actions">
        <button class="ghost" on:click={pickRandom}>🎲</button>
        <button class="icon-btn plus" aria-label="Add task" on:click={() => showComposer = !showComposer}>+</button>
      </div>
    </div>

    {#if showComposer}
  <div class="composer">
    <input class="inp title" bind:value={inputTitle} placeholder="Add a task…" on:keydown={(e)=>e.key==='Enter' && doAdd()} />
    <input class="inp time"  bind:value={inputTime} placeholder="HH:mm"     on:keydown={(e)=>e.key==='Enter' && doAdd()} />
    <input class="inp tags"  bind:value={inputTags} placeholder="tags, comma,separated" on:keydown={(e)=>e.key==='Enter' && doAdd()} />
    <button class="btn add" on:click={doAdd}>Add</button>

    <!-- New: full-width meta row so we never overflow -->
    <div class="composer-meta">
      <label class="chk">
        <input type="checkbox" bind:checked={publishToCalendar} />
        <span>also add to calendar</span>
      </label>

      <button class="link small" on:click={() => showAdvanced = !showAdvanced}>
        {showAdvanced ? 'Hide options' : 'More options'}
      </button>
    </div>

    {#if showAdvanced}
      <!-- (unchanged) recurrence block -->
      <div class="rec-row">
        <label class="chk">
          <input type="checkbox" bind:checked={recEnabled} />
          <span>Repeat</span>
        </label>

        {#if recEnabled}
          <select bind:value={recFreq}>
            <option value="DAILY">daily</option>
            <option value="WEEKLY">weekly</option>
            <option value="MONTHLY">monthly</option>
            <option value="YEARLY">yearly</option>
          </select>

          <span class="every">every</span>
          <input class="small" type="number" min="1" bind:value={recInterval} />
          <span class="every">time(s)</span>

          {#if recFreq === 'WEEKLY'}
            <div class="weekday-picks">
              {#each ['S','M','T','W','T','F','S'] as lbl, i}
                <button
                  class="daypick {recByWeekday.has(i) ? 'on' : ''}"
                  on:click={() => { recByWeekday.has(i) ? recByWeekday.delete(i) : recByWeekday.add(i); }}>
                  {lbl}
                </button>
              {/each}
            </div>
          {/if}

          {#if recFreq === 'MONTHLY'}
            <input class="inline" placeholder="days (e.g. 1,15,28)" bind:value={recByMonthDay} />
          {/if}

          {#if recFreq === 'YEARLY'}
            <input class="inline" placeholder="months (1-12, e.g. 1,7)" bind:value={recByMonth} />
            <input class="inline" placeholder="day-of-month (e.g. 1 or 15)" bind:value={recByMonthDay} />
          {/if}

          <label class="chk">
            <input type="checkbox" bind:checked={recIncludeStart} />
            <span>include today (“today+”)</span>
          </label>
        {/if}
      </div>
    {/if}
  </div>
{/if}


    <!-- TODAY LIST -->
    <div class="section">
      <div class="section-title">Today’s Tasks</div>
      {#if todaysTodos.length === 0}
        <div class="empty">No tasks yet. Hit the “+” above!</div>
      {:else}
        {#each todaysTodos as t (t.id)}
          <div class="todo-row">
            <button class="status" on:click={() => cycleStatus(t)} title="Cycle status">
              {statusDot(t.status)}
            </button>
            <div class="main">
              <div class="line1">
                <div class="title {t.status}">{t.title}</div>
                <div class="due">{fmtDue(t)}</div>
              </div>
              <div class="line2">
                <div class="tags">
                  {#each t.tags ?? [] as tag}
                    <span class="tag">#{tag}</span>
                  {/each}
                </div>
                <div class="actions">
                  <button class="ghost" on:click={() => showNotesFor = showNotesFor === t.id ? null : t.id}>
                    {showNotesFor === t.id ? 'Hide notes' : 'Notes'}
                  </button>
                  <button class="ghost danger" on:click={() => remove(t)}>Delete</button>
                </div>
              </div>
              {#if showNotesFor === t.id}
                <textarea rows="3" bind:value={t.notes}
                  on:change={(e) => saveNotes(t, (e.target as HTMLTextAreaElement).value)}
                  placeholder="Add details…"></textarea>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <!-- CALENDAR MIRROR -->
    <div class="section">
      <div class="section-title">From Calendar (read-only)</div>
      {#if eventsToday.length === 0}
        <div class="empty">No calendar events today.</div>
      {:else}
        {#each eventsToday as item}
          <div class="event-row">
            <div class="dot">•</div>
            <div class="evt-title">{item.e.title}</div>
            <div class="evt-time">
              {#if item.e.allDay || /^\d{4}-\d{2}-\d{2}$/.test(item.e.start)}
                all day
              {:else}
                {format(item.d, 'h:mm a')}
              {/if}
            </div>
            <button class="ghost" on:click={async () => {
              const e = item.e;
              const title = e.title || 'Untitled';
              const dueISO = e.allDay || /^\d{4}-\d{2}-\d{2}$/.test(e.start)
                ? null : new Date(e.start).toISOString();
              const t = newTodoDraft(title, dueISO);
              t.linkedEventId = e.id ?? null;
              await addTodo(t);
              todos = await loadTodosFile();
              refreshViews();
            }}>
              Make task
            </button>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  /* frame */
  .todo-wrapper { position: relative; width: 100%; height: 100%; }
  .todo-bg { position: absolute; inset:0; width:100%; height:100%; object-fit: contain; z-index: 0; pointer-events: none; }
  .todo-overlay {
    position:absolute; inset: 20px; z-index: 1;
    display:flex; flex-direction:column; gap: 10px;
    padding: 2px;
  }

  /* header */
  .header { display:flex; align-items:center; gap:8px; color:#fff; }
  .title { flex:1; text-align:center; font-weight:800; letter-spacing:.02em; }
  .chevron { width:28px; height:28px; padding:0; display:grid; place-items:center; }
  .head-actions { display:flex; gap:8px; margin-left:4px; align-items: center; }
  .icon-btn.plus {
    width: 28px; height: 28px; border-radius: 50%;
    border: 1px solid rgba(255,255,255,.45);
    background: rgba(255,255,255,.12);
    backdrop-filter: blur(4px);
    font-size: 18px; line-height: 1; display: grid; place-items: center;
    cursor: pointer;
  }
  .icon-btn.plus:hover { background: rgba(255,255,255,.2); }

  .composer {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(0,1fr) 84px minmax(0,1fr) auto;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  background: rgba(0,0,0,.22);
  border: 1px solid rgba(255,255,255,.18);
  overflow: hidden; 
}
.composer-meta {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap; 
  margin-top: 2px;
}
  .inp {
    height: 30px; border-radius: 10px; border: 1px solid rgba(255,255,255,.35);
    background: rgba(0,0,0,.2); color: #fff; padding: 0 10px; outline: none;
  }
  .btn { height: 30px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.45); background: rgba(255,255,255,.18); color:#fff; }
  .link.small { justify-self: start; font-size: 12px; color:#cfefff; background:transparent; border:none; padding:0; text-decoration: underline; cursor:pointer; }
  .chk { display:flex; gap:6px; align-items:center; color:#ddd; }

  /* advanced/recurrence */
  .rec-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; color:#ddd; margin-top:6px; }
  .rec-row .small { width:64px; }
  .rec-row .every { opacity:.8; }
  .weekday-picks { display:flex; gap:4px; }
  .daypick { border:1px solid #444; background:transparent; color:#ddd; border-radius:8px; padding:4px 6px; }
  .daypick.on { background:#2d7; color:#000; border-color:#2d7; }
  .inline { height: 30px; border-radius: 10px; border: 1px solid #444; background: rgba(0,0,0,.2); color:#fff; padding: 0 10px; }

  /* sections */
  .section { background: rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.10); border-radius:12px; padding:10px; color:#fff; }
  .section-title { opacity:.95; font-weight:700; margin-bottom:6px; }

  /* items */
  .todo-row { display:flex; gap:8px; align-items:flex-start; padding:6px 0; }
  .status { width:28px; height:28px; border-radius:50%; text-align:center; line-height:26px; }
  .main { flex:1; min-width: 0; }
  .line1 { display:flex; gap:8px; align-items:center; }
  .title { flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
  .title.green { text-decoration: line-through; opacity:.6; }
  .title.blue { color:#7fd4ff; }
  .title.red { color:#ff9aa0; }
  .due { opacity:.8; font-size:.9em; }
  .line2 { display:flex; justify-content:space-between; align-items:center; margin-top:4px; }
  .tag { background: rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.2); border-radius:999px; padding:2px 8px; font-size:.85em; margin-right:4px; }
  textarea { width:100%; margin-top:6px; border-radius:10px; border:1px solid #444; background:#111; color:#fff; }

  /* calendar mirror rows */
  .event-row { display:flex; gap:8px; align-items:center; padding:4px 0; opacity:.95; }
  .evt-title { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .evt-time { opacity:.85; }
  .dot { opacity:.8; }

  /* buttons shared */
  .ghost { background:transparent; color:#ddd; border:1px solid #444; border-radius:10px; padding:6px 10px; cursor:pointer; }
  .ghost.danger { border-color:#a55; color:#f99; }
</style>

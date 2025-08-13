// src/lib/storageTodos.ts
import { nanoid } from 'nanoid';
import { addDays, startOfDay, isSameDay } from 'date-fns';
import { appDataDir, join } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs';

// ---- Types
export type TodoStatus = 'white' | 'blue' | 'green' | 'red';
export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export type RecurrenceRule = {
  freq: Freq;             // DAILY/WEEKLY/MONTHLY/YEARLY
  interval: number;       // every N (1=every, 2=every other, etc.)
  // WEEKLY: which weekdays apply (0=Sun .. 6=Sat). empty = all?
  byWeekday?: number[];
  // MONTHLY: which day-of-month (1..31). if omitted, use the due date’s DOM
  byMonthDay?: number[];
  // YEARLY: which month (1..12). if omitted, use due date’s month
  byMonth?: number[];
  // “today+” anchor – include the creation day even if it doesn't match rule
  includeStart?: boolean;
  // when it began; default to createdAt/due date
  dtStart?: string;       // ISO date (no time)
};

export type Todo = {
  id: string;
  title: string;
  due: string | null;
  status: 'white' | 'blue' | 'green' | 'red';
  notes?: string;
  tags?: string[];
  recurrence?: RecurrenceRule | 'none';
  linkedEventId?: string | null;
  createdAt: string;
  updatedAt: string;
  _v?: number;
};


const FILE_NAME = 'todos.json';
const LS_KEY = 'nono.todos.v1';

async function dataFile() {
  const dir = await appDataDir();
  const file = await join(dir, FILE_NAME);
  return { dir, file };
}

async function ensureDir(path: string) {
  try { await mkdir(path, { recursive: true }); } catch {}
}

export async function loadTodosFile(): Promise<Todo[]> {
  const { dir, file } = await dataFile();
  if (!(await exists(dir))) await ensureDir(dir);
  if (!(await exists(file))) return [];
  try {
    const txt = await readTextFile(file);
    const json = JSON.parse(txt);
    const list: Todo[] = Array.isArray(json) ? json : [];
    // upgrade
    for (const t of list) {
      if (!t._v) t._v = 2;
      if (!t.status) t.status = 'white';
      if (!('tags' in t)) t.tags = [];
      if (!('notes' in t)) t.notes = '';
    }
    return list;
  } catch {
    return [];
  }
}

export async function saveTodosFile(list: Todo[]): Promise<void> {
  const { dir, file } = await dataFile();
  if (!(await exists(dir))) await ensureDir(dir);
  await writeTextFile(file, JSON.stringify(list, null, 2));
}

export async function migrateTodosFromLocalStorage(): Promise<boolean> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return false;
    await saveTodosFile(list);
    // localStorage.removeItem(LS_KEY);
    return true;
  } catch {
    return false;
  }
}

export function newTodoDraft(title: string, dueISO: string | null = null): Todo {
  const now = new Date().toISOString();
  return {
    id: nanoid(),
    title: title.trim(),
    due: dueISO,
    status: 'white',
    notes: '',
    tags: [],
    recurrence: 'none',          // <-- was string, now explicit
    linkedEventId: null,
    createdAt: now,
    updatedAt: now,
    _v: 2
  };
}


export async function addTodo(todo: Todo) {
  const list = await loadTodosFile();
  list.push(todo);
  await saveTodosFile(list);
  return todo.id;
}

export async function updateTodo(id: string, patch: Partial<Todo>) {
  const list = await loadTodosFile();
  const idx = list.findIndex(t => t.id === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
    await saveTodosFile(list);
    return true;
  }
  return false;
}

export async function deleteTodo(id: string) {
  const list = await loadTodosFile();
  const next = list.filter(t => t.id !== id);
  await saveTodosFile(next);
}

export function isoDateOnly(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

export function listForDay(list: Todo[], day: Date) {
  const start = startOfDay(day);
  const end = startOfDay(addDays(day, 1));
  return list.filter(t => {
    if (!t.due) return isSameDay(start, start); // tasks with no due: treat as always visible “today”
    const d = new Date(t.due);
    return d >= start && d < end;
  });
}

// --- Recurrence expansion (MVP) ---
function sameYMD(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear() &&
         a.getMonth()===b.getMonth() &&
         a.getDate()===b.getDate();
}

function dateOnlyISO(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

// Expand a todo into concrete dates within [rangeStart, rangeEnd) (dates only)
export function expandTodoOccurrences(t: Todo, rangeStart: Date, rangeEnd: Date): Date[] {
  if (!t.recurrence || t.recurrence === 'none') {
    // Single task shows on its due date, or “today” if no due
    if (!t.due) {
      const today = new Date();
      if (today >= rangeStart && today < rangeEnd) return [new Date(today)];
      return [];
    }
    const d = new Date(t.due);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return (day >= rangeStart && day < rangeEnd) ? [day] : [];
  }

  const r = t.recurrence as RecurrenceRule;
  // Anchor start (includeStart = show this day once even if off-pattern)
  let anchor: Date;
  if (r.dtStart) {
    const ds = new Date(r.dtStart);
    anchor = new Date(ds.getFullYear(), ds.getMonth(), ds.getDate());
  } else if (t.due) {
    const d = new Date(t.due);
    anchor = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  } else {
    const c = new Date(t.createdAt);
    anchor = new Date(c.getFullYear(), c.getMonth(), c.getDate());
  }

  const out: Date[] = [];
  const interval = Math.max(1, r.interval || 1);

  // Helper to maybe include “includeStart” day
  const maybeIncludeStart = () => {
    if (r.includeStart) {
      if (anchor >= rangeStart && anchor < rangeEnd) out.push(new Date(anchor));
    }
  };

  if (r.freq === 'DAILY') {
    // Every N days
    // Find the first occurrence >= rangeStart aligned to anchor
    const start = new Date(anchor);
    while (start < rangeStart) start.setDate(start.getDate() + interval);
    for (let d = new Date(start); d < rangeEnd; d.setDate(d.getDate() + interval)) {
      out.push(new Date(d));
    }
    maybeIncludeStart();
    return dedupeDays(out);
  }

  if (r.freq === 'WEEKLY') {
    // Every N weeks, on certain weekdays
    const weekdays = (r.byWeekday && r.byWeekday.length) ? r.byWeekday : [anchor.getDay()];
    // Find week start aligned to anchor “phase”
    // Compute distance in days between anchor-week and rangeStart-week modulo (7*interval)
    const aWeekStart = weekStart(anchor);
    let start = weekStart(new Date(rangeStart));
    const diffWeeks = Math.floor((start.getTime() - aWeekStart.getTime()) / (7*86400000));
    const mod = ((diffWeeks % interval) + interval) % interval;
    if (mod !== 0) start.setDate(start.getDate() + (interval - mod) * 7);

    for (let w = new Date(start); w < rangeEnd; w.setDate(w.getDate() + interval*7)) {
      for (const wd of weekdays) {
        const d = new Date(w); d.setDate(d.getDate() + wd);
        if (d >= rangeStart && d < rangeEnd) out.push(d);
      }
    }
    maybeIncludeStart();
    return dedupeDays(out);
  }

  if (r.freq === 'MONTHLY') {
    // Every N months, on specific day-of-month (default: anchor DOM)
    const doms = (r.byMonthDay && r.byMonthDay.length) ? r.byMonthDay : [anchor.getDate()];
    let cursor = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    // advance cursor to first month >= rangeStart with proper modulo
    while (new Date(cursor.getFullYear(), cursor.getMonth()+1, 1) <= rangeStart) {
      cursor.setMonth(cursor.getMonth() + interval);
    }
    // back up one interval if we overshot
    while (cursor > rangeStart) cursor.setMonth(cursor.getMonth() - interval);
    // loop months
    while (cursor < rangeEnd) {
      for (const dom of doms) {
        const d = new Date(cursor.getFullYear(), cursor.getMonth(), dom);
        if (d >= rangeStart && d < rangeEnd) out.push(d);
      }
      cursor.setMonth(cursor.getMonth() + interval);
    }
    maybeIncludeStart();
    return dedupeDays(out);
  }

  if (r.freq === 'YEARLY') {
    // Every N years, on specific months and day-of-month (defaults to anchor)
    const months = (r.byMonth && r.byMonth.length) ? r.byMonth : [anchor.getMonth()+1]; // 1-12
    const dom = (r.byMonthDay && r.byMonthDay.length) ? r.byMonthDay[0] : anchor.getDate();
    let year = anchor.getFullYear();
    // advance to first year >= rangeStart with proper modulo
    while (new Date(year+1, 0, 1) <= rangeStart) year += interval;
    while (new Date(year, 0, 1) > rangeStart) year -= interval;

    // loop years
    for (let y = year; new Date(y, 0, 1) < rangeEnd; y += interval) {
      for (const m of months) {
        const d = new Date(y, m-1, dom);
        if (d >= rangeStart && d < rangeEnd) out.push(d);
      }
    }
    maybeIncludeStart();
    return dedupeDays(out);
  }

  return [];
}

function weekStart(d: Date) {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() - out.getDay()); // Sunday start; tweak if Monday
  return out;
}

function dedupeDays(list: Date[]) {
  const seen = new Set<string>();
  const out: Date[] = [];
  for (const d of list) {
    const key = d.toDateString();
    if (!seen.has(key)) { seen.add(key); out.push(d); }
  }
  return out.sort((a,b) => a.getTime()-b.getTime());
}

import { appDataDir, join } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs';

export type NonoEvent = {
  id: string;
  title: string;
  start: string;            // "YYYY-MM-DD" (all-day) or ISO date-time
  end?: string;             // same format; for all-day multi-day use "YYYY-MM-DD" exclusive
  allDay?: boolean;
  reminderMin?: number;
  // room for more: category, todoId, location, notes...
};

const FILE_NAME = 'events.json';

async function dataFilePath() {
  const dir = await appDataDir();
  return { dir, file: await join(dir, FILE_NAME) };
}

async function ensureDir(dir: string) {
  // createDir is recursive in plugin-fs v2 when { recursive: true }
  await mkdir(dir, { recursive: true }).catch(() => {});
}

export async function loadEventsFile(): Promise<NonoEvent[]> {
  const { dir, file } = await dataFilePath();
  if (!(await exists(dir))) await ensureDir(dir);
  if (!(await exists(file))) return [];
  try {
    const txt = await readTextFile(file);
    const list = JSON.parse(txt);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveEventsFile(list: NonoEvent[]): Promise<void> {
  const { dir, file } = await dataFilePath();
  if (!(await exists(dir))) await ensureDir(dir);
  await writeTextFile(file, JSON.stringify(list, null, 2));

  console.log('[Nono] events saved to:', file);
}

// one-shot migration from localStorage → file
const LS_KEY = 'nono.events.v1';
export async function migrateLocalStorageToFile(): Promise<boolean> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return false;
    await saveEventsFile(list);
    // optional: clear LS so we don’t re-migrate
    // localStorage.removeItem(LS_KEY);
    return true;
  } catch {
    return false;
  }
}

// handy helpers for other parts of the app (chat, todo)
export async function addEventToFile(evt: Omit<NonoEvent, 'id'> & { id?: string }) {
  const list = await loadEventsFile();
  const id = evt.id ?? crypto.randomUUID();
  list.push({ ...evt, id });
  await saveEventsFile(list);
  return id;
}

export async function updateEventInFile(id: string, patch: Partial<NonoEvent>) {
  const list = await loadEventsFile();
  const idx = list.findIndex(e => String(e.id) === String(id));
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...patch };
    await saveEventsFile(list);
    return true;
  }
  return false;
}

export async function deleteEventFromFile(id: string) {
  const list = await loadEventsFile();
  const next = list.filter(e => String(e.id) !== String(id));
  await saveEventsFile(next);
}

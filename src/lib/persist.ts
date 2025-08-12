import { Store } from '@tauri-apps/plugin-store';

let store: Store | null = null;

export async function ensureStore(): Promise<Store> {
  if (!store) {
    store = await Store.load('.nono-store.dat');
  }
  return store;
}


const SCALE_KEY = 'nonoScale';
const CHIBI_KEY = 'isChibi';

export async function loadScale(): Promise<number> {
  const s = await ensureStore();
  const value = await s.get(SCALE_KEY);
  return typeof value === 'number' ? value : 1.0;
}

export async function saveScale(scale: number): Promise<void> {
  const s = await ensureStore();
  await s.set(SCALE_KEY, scale);
  await s.save();
}

export async function loadChibi(): Promise<boolean> {
  const s = await ensureStore();
  const value = await s.get(CHIBI_KEY);
  return typeof value === 'boolean' ? value : false;
}

export async function saveChibi(isChibi: boolean): Promise<void> {
  const s = await ensureStore();
  await s.set(CHIBI_KEY, isChibi);
  await s.save();
}

export async function clearStore(): Promise<void> {
  const s = await ensureStore();
  await s.clear();
  await s.save();
}

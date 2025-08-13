// lib/eventBus.ts
type EventHandler = (payload?: unknown) => void;

const listeners = new Map<string, Set<EventHandler>>();

export function emit(event: string, payload?: unknown) {
  const handlers = listeners.get(event);
  if (!handlers) return;
  for (const handler of handlers) {
    handler(payload);
  }
}

export function on(event: string, handler: EventHandler) {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event)!.add(handler);
}

export function off(event: string, handler: EventHandler) {
  listeners.get(event)?.delete(handler);
}

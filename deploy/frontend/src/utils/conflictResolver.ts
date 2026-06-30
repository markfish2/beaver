export interface ConflictInfo {
  entityType: 'document' | 'node';
  entityId: string;
  localData: Record<string, unknown>;
  serverVersion: number;
  serverData?: Record<string, unknown>;
}

const CONFLICT_EVENT = 'data-conflict';

export function emitConflict(info: ConflictInfo) {
  window.dispatchEvent(new CustomEvent(CONFLICT_EVENT, { detail: info }));
}

export function onConflict(handler: (info: ConflictInfo) => void) {
  const listener = (e: Event) => handler((e as CustomEvent).detail);
  window.addEventListener(CONFLICT_EVENT, listener);
  return () => window.removeEventListener(CONFLICT_EVENT, listener);
}

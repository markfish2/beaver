export interface ConflictInfo {
  entityType: 'document' | 'node';
  entityId: string;
  localData: Record<string, unknown>;
  serverVersion: number;
  serverData?: Record<string, unknown>;
}

const CONFLICT_EVENT = 'data-conflict';
const DATA_REFRESH_EVENT = 'data-refresh-request';

export type DataRefreshRequest = Pick<ConflictInfo, 'entityType' | 'entityId'>;

export function emitConflict(info: ConflictInfo) {
  window.dispatchEvent(new CustomEvent(CONFLICT_EVENT, { detail: info }));
}

export function onConflict(handler: (info: ConflictInfo) => void) {
  const listener = (e: Event) => handler((e as CustomEvent).detail);
  window.addEventListener(CONFLICT_EVENT, listener);
  return () => window.removeEventListener(CONFLICT_EVENT, listener);
}

export function requestDataRefresh(request: DataRefreshRequest) {
  window.dispatchEvent(new CustomEvent<DataRefreshRequest>(DATA_REFRESH_EVENT, { detail: request }));
}

export function onDataRefresh(handler: (request: DataRefreshRequest) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<DataRefreshRequest>).detail);
  window.addEventListener(DATA_REFRESH_EVENT, listener);
  return () => window.removeEventListener(DATA_REFRESH_EVENT, listener);
}

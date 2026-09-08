// HTTP 局域网访问也可用；该标识只用于过滤回声，不参与认证。
export const clientId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export let localWriteRevision = 0;
export let pendingLocalWrites = 0;
export const activeMemoEditors = new Set<symbol>();
export const liveWakeEvent = 'remote-data-wake';
export function markLocalWrite() { localWriteRevision++; }
export function startLocalWrite() { markLocalWrite(); pendingLocalWrites++; }
export function finishLocalWrite() {
  markLocalWrite(); pendingLocalWrites = Math.max(0, pendingLocalWrites - 1);
  window.dispatchEvent(new Event(liveWakeEvent));
}
export const liveEventName = 'remote-data-change';

/** One authenticated stream per app, with retry only after connection loss. */
export function connectLiveUpdates(): () => void {
  let stopped = false;
  let controller: AbortController;
  let timer: ReturnType<typeof setTimeout>;
  let delay = 1000;
  let watchdog: ReturnType<typeof setTimeout>;
  const connect = async () => {
    controller = new AbortController();
    try {
      const token = localStorage.getItem('token');
      if (!token) { stopped = true; return; }
      const response = await fetch('/api/live', {
        cache: 'no-store',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });
      if (response.status === 401) { stopped = true; return; }
      if (!response.ok || !response.body) throw new Error('Live connection failed');
      delay = 1000;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!stopped) {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => controller.abort(), 45000);
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (!frame.startsWith('data: ')) continue;
          const data = JSON.parse(frame.slice(6)) as { resource: string; source: string };
          if (data.source !== clientId) window.dispatchEvent(new CustomEvent(liveEventName, { detail: data.resource }));
        }
      }
    } catch {
      // Network loss is expected; reconnect also reconciles missed events.
    } finally {
      clearTimeout(watchdog);
      if (!stopped) {
        timer = setTimeout(() => { void connect(); }, delay);
        delay = Math.min(delay * 2, 30000);
      }
    }
  };
  void connect();
  return () => { stopped = true; controller?.abort(); clearTimeout(timer); clearTimeout(watchdog); };
}

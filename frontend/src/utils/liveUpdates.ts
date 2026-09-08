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

/** One authenticated stream per app; pause it in the background and rebuild it on resume. */
export function connectLiveUpdates(): () => void {
  let stopped = false;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay = 1000;
  let connectionAttempt = 0;

  const isPageVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

  const connect = async (attempt: number) => {
    if (stopped || attempt !== connectionAttempt || !isPageVisible()) return;

    const currentController = new AbortController();
    controller = currentController;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    try {
      const token = localStorage.getItem('token');
      if (!token) { stopped = true; return; }
      const response = await fetch('/api/live', {
        cache: 'no-store',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
        },
        signal: currentController.signal,
      });
      if (response.status === 401) { stopped = true; return; }
      if (!response.ok || !response.body) throw new Error('Live connection failed');
      delay = 1000;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!stopped && attempt === connectionAttempt) {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => currentController.abort(), 45000);
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
      if (controller === currentController) controller = undefined;
      if (!stopped && attempt === connectionAttempt && isPageVisible()) {
        const nextDelay = delay;
        timer = setTimeout(() => {
          timer = undefined;
          void connect(attempt);
        }, nextDelay);
        delay = Math.min(delay * 2, 30000);
      }
    }
  };

  const pause = () => {
    connectionAttempt += 1;
    clearTimeout(timer);
    timer = undefined;
    controller?.abort();
    controller = undefined;
  };

  const resume = () => {
    if (stopped || !isPageVisible()) return;
    // Reconcile changes made while the PWA was suspended, even if the old SSE
    // connection did not emit a close event before the page became visible.
    window.dispatchEvent(new CustomEvent(liveEventName, { detail: 'all' }));
    connectionAttempt += 1;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void connect(connectionAttempt);
    }, 0);
    delay = 1000;
    controller?.abort();
    controller = undefined;
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') pause();
    else resume();
  };

  window.addEventListener('online', resume);
  window.addEventListener('offline', pause);
  window.addEventListener('pageshow', resume);
  window.addEventListener('pagehide', pause);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);

  void connect(connectionAttempt);
  return () => {
    stopped = true;
    pause();
    window.removeEventListener('online', resume);
    window.removeEventListener('offline', pause);
    window.removeEventListener('pageshow', resume);
    window.removeEventListener('pagehide', pause);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

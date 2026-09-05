import { useEffect, useRef } from 'react';
import { liveEventName, liveWakeEvent, localWriteRevision, pendingLocalWrites, activeMemoEditors } from '../utils/liveUpdates';
import { saveStateManager } from '../utils/saveStateManager';
import { createRemoteRefreshQueue } from '../utils/remoteRefreshQueue';

export function useRemoteRefresh(resources: string, refresh: (canApply: () => boolean) => Promise<void>, blocked = false, identity = '') {
  const latest = useRef({ refresh, blocked });
  const wake = useRef<() => void>(() => {});
  useEffect(() => { latest.current = { refresh, blocked }; });
  useEffect(() => { wake.current(); }, [blocked]);
  useEffect(() => {
    const queue = createRemoteRefreshQueue({
      blocked: () => latest.current.blocked || pendingLocalWrites > 0 || activeMemoEditors.size > 0 || saveStateManager.hasUnsavedChanges()
        || !!document.activeElement?.closest('input, textarea, [contenteditable="true"], .cm-editor'),
      version: () => localWriteRevision,
      refresh: canApply => latest.current.refresh(canApply),
    });
    wake.current = queue.wake;
    const changed = (event: Event) => {
      const resource = (event as CustomEvent<string>).detail;
      if (resource === 'all' || resources.split(',').includes(resource)) queue.invalidate();
    };
    window.addEventListener(liveEventName, changed);
    window.addEventListener(liveWakeEvent, queue.wake);
    window.addEventListener('focusout', queue.wake);
    window.addEventListener('focus', queue.wake);
    window.addEventListener('input', queue.edited, true);
    saveStateManager.subscribe(queue.wake);
    return () => {
      queue.dispose();
      window.removeEventListener(liveEventName, changed);
      window.removeEventListener(liveWakeEvent, queue.wake);
      window.removeEventListener('focusout', queue.wake);
      window.removeEventListener('focus', queue.wake);
      window.removeEventListener('input', queue.edited, true);
      saveStateManager.unsubscribe(queue.wake);
    };
  }, [resources, identity]);
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { clientId, connectLiveUpdates, liveEventName, startLocalWrite, finishLocalWrite, pendingLocalWrites, localWriteRevision } from '../src/utils/liveUpdates.ts';

test('SSE 分片重组、心跳忽略、本端回声过滤与断开清理', async () => {
  const target = new EventTarget();
  Object.defineProperty(globalThis, 'window', { value: target, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => 'test-token' }, configurable: true });
  const originalFetch = globalThis.fetch;
  let signal: AbortSignal | undefined;
  const events: string[] = [];
  target.addEventListener(liveEventName, event => events.push((event as CustomEvent<string>).detail));
  globalThis.fetch = async (_url, options) => {
    signal = options?.signal as AbortSignal;
    const headers = options?.headers as Record<string, string>;
    assert.equal(options?.cache, 'no-store');
    assert.equal(headers.Accept, 'text/event-stream');
    assert.equal(headers.Authorization, 'Bearer test-token');
    return new Response(new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(': heartbeat\n\ndata: {"resource":"no'));
        controller.enqueue(encoder.encode('des","source":"other-device"}\n\n'));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ resource: 'memos', source: clientId })}\n\n`));
        signal?.addEventListener('abort', () => controller.error(new Error('aborted')));
      },
    }));
  };
  const stop = connectLiveUpdates();
  try {
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.deepEqual(events, ['nodes']);
    stop();
    assert.equal(signal?.aborted, true);
  } finally { stop(); globalThis.fetch = originalFetch; }
});

test('PWA 回到前台时重建 SSE 并触发全量核对', async () => {
  const target = new EventTarget();
  const documentTarget = new EventTarget() as EventTarget & { visibilityState: 'hidden' | 'visible' };
  documentTarget.visibilityState = 'hidden';
  Object.defineProperty(globalThis, 'window', { value: target, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: documentTarget, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => 'test-token' }, configurable: true });
  const originalFetch = globalThis.fetch;
  let requests = 0;
  const events: string[] = [];
  const onEvent = (event: Event) => events.push((event as CustomEvent<string>).detail);
  target.addEventListener(liveEventName, onEvent);
  globalThis.fetch = async (_url, options) => {
    requests += 1;
    const signal = options?.signal as AbortSignal;
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"resource":"all","source":"other-device"}\n\n'));
        signal.addEventListener('abort', () => controller.close());
      },
    }));
  };

  const stop = connectLiveUpdates();
  try {
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(requests, 0);
    documentTarget.visibilityState = 'visible';
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(requests, 1);
    assert.ok(events.includes('all'));
  } finally {
    stop();
    target.removeEventListener(liveEventName, onEvent);
    globalThis.fetch = originalFetch;
    delete (globalThis as { document?: unknown }).document;
  }
});

test('本地保存期间锁定同步，并在完成后推进版本和唤醒', () => {
  const before = localWriteRevision;
  startLocalWrite();
  assert.equal(pendingLocalWrites, 1);
  finishLocalWrite();
  assert.equal(pendingLocalWrites, 0);
  assert.equal(localWriteRevision, before + 2);
});

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

test('本地保存期间锁定同步，并在完成后推进版本和唤醒', () => {
  const before = localWriteRevision;
  startLocalWrite();
  assert.equal(pendingLocalWrites, 1);
  finishLocalWrite();
  assert.equal(pendingLocalWrites, 0);
  assert.equal(localWriteRevision, before + 2);
});

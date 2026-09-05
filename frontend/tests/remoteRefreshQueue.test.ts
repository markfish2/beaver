import assert from 'node:assert/strict';
import test from 'node:test';
import { createRemoteRefreshQueue } from '../src/utils/remoteRefreshQueue.ts';

const tick = () => new Promise(resolve => setTimeout(resolve, 20));

test('编辑期间合并通知，退出编辑后更新一次，不进行定时刷新', async () => {
  let editing = true;
  let calls = 0;
  const queue = createRemoteRefreshQueue({ blocked: () => editing, version: () => 0, delay: 1,
    refresh: async canApply => { if (canApply()) calls++; },
  });
  try {
    queue.invalidate(); queue.invalidate(); queue.invalidate();
    await tick(); assert.equal(calls, 0);
    editing = false; queue.wake();
    await tick(); assert.equal(calls, 1);
    await tick(); assert.equal(calls, 1);
  } finally { queue.dispose(); }
});

test('请求途中发生本地保存，丢弃旧响应并重新读取', async () => {
  let version = 0;
  let release = () => {};
  let calls = 0;
  let applied = 0;
  const queue = createRemoteRefreshQueue({ blocked: () => false, version: () => version, delay: 1,
    refresh: async canApply => {
      calls++;
      if (calls === 1) await new Promise<void>(resolve => { release = resolve; });
      if (canApply()) applied++;
    },
  });
  try {
    queue.invalidate(); await tick();
    version++; release(); await tick();
    assert.equal(calls, 2); assert.equal(applied, 1);
  } finally { queue.dispose(); }
});

test('切换文档后禁止在途请求更新旧页面', async () => {
  let release = () => {};
  let applied = false;
  const queue = createRemoteRefreshQueue({ blocked: () => false, version: () => 0, delay: 1,
    refresh: async canApply => {
      await new Promise<void>(resolve => { release = resolve; });
      applied = canApply();
    },
  });
  queue.invalidate(); await tick();
  queue.dispose(); release(); await tick();
  assert.equal(applied, false);
});

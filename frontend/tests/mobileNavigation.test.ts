import assert from 'node:assert/strict';
import test from 'node:test';
import { createMobileDocumentState, getMobileTabFromState, resolveMobileBackTarget } from '../src/utils/mobileNavigation.ts';

test('明确来源页面优先于浏览器历史', () => {
  const state = createMobileDocumentState('/search?q=画布', 'files');
  assert.deepEqual(resolveMobileBackTarget('route-key', state, 4), {
    kind: 'route',
    to: '/search?q=画布',
    tab: 'files',
  });
});

test('应用内导航且无明确来源时使用历史后退', () => {
  assert.deepEqual(resolveMobileBackTarget('route-key', null, 2), { kind: 'history' });
});

test('直接访问、刷新和 PWA 冷启动统一返回首页', () => {
  assert.deepEqual(resolveMobileBackTarget('default', null, 1), {
    kind: 'route',
    to: '/',
    tab: 'memos',
  });
});

test('拒绝外部和协议相对返回地址', () => {
  assert.deepEqual(createMobileDocumentState('https://example.com'), { mobileReturnTo: '/' });
  assert.deepEqual(createMobileDocumentState('//example.com'), { mobileReturnTo: '/' });
});

test('只接受已知移动标签，拒绝伪造状态', () => {
  assert.equal(getMobileTabFromState({ mobileReturnTab: 'files' }), 'files');
  assert.equal(getMobileTabFromState({ mobileReturnTab: 'unknown' }), undefined);
});

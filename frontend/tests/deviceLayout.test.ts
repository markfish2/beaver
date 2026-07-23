import assert from 'node:assert/strict';
import test from 'node:test';
import { isPhoneLayout, isTabletDevice, type DeviceLayoutSnapshot } from '../src/utils/deviceLayout.ts';

const device = (overrides: Partial<DeviceLayoutSnapshot>): DeviceLayoutSnapshot => ({
  viewportWidth: 390,
  screenWidth: 390,
  screenHeight: 844,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Mobile)',
  platform: 'Linux armv8l',
  maxTouchPoints: 5,
  ...overrides,
});

test('窄屏手机使用移动布局', () => {
  assert.equal(isPhoneLayout(device({})), true);
});

test('三星 Android 平板竖屏仍使用 PC 布局', () => {
  const tablet = device({
    viewportWidth: 753,
    screenWidth: 800,
    screenHeight: 1280,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X700) AppleWebKit/537.36',
  });
  assert.equal(isTabletDevice(tablet), true);
  assert.equal(isPhoneLayout(tablet), false);
});

test('iPad 桌面级 UA 仍识别为平板', () => {
  const ipad = device({
    viewportWidth: 744,
    screenWidth: 744,
    screenHeight: 1133,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
    platform: 'MacIntel',
    maxTouchPoints: 5,
  });
  assert.equal(isTabletDevice(ipad), true);
  assert.equal(isPhoneLayout(ipad), false);
});

test('窄桌面窗口保持原有响应式布局规则', () => {
  assert.equal(isPhoneLayout(device({
    viewportWidth: 700,
    screenWidth: 1920,
    screenHeight: 1080,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
    platform: 'Linux x86_64',
    maxTouchPoints: 0,
  })), true);
});

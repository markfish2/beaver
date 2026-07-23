export interface DeviceLayoutSnapshot {
  viewportWidth: number;
  screenWidth: number;
  screenHeight: number;
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}

export function getDeviceLayoutSnapshot(): DeviceLayoutSnapshot {
  return {
    viewportWidth: window.innerWidth,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  };
}

export function isTabletDevice(device: DeviceLayoutSnapshot): boolean {
  const isIPad = /iPad/i.test(device.userAgent)
    || (device.platform === 'MacIntel' && device.maxTouchPoints > 1);
  const isAndroidTablet = /Android/i.test(device.userAgent) && !/Mobile/i.test(device.userAgent);
  const shortestScreenSide = Math.min(device.screenWidth, device.screenHeight);
  const isTabletSizedTouchDevice = device.maxTouchPoints > 0 && shortestScreenSide >= 600;

  return isIPad || isAndroidTablet || isTabletSizedTouchDevice;
}

export function isPhoneLayout(device: DeviceLayoutSnapshot = getDeviceLayoutSnapshot()): boolean {
  return device.viewportWidth < 768 && !isTabletDevice(device);
}

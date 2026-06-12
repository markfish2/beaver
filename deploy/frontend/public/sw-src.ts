/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// Workbox 注入的预缓存清单标记
declare global {
  interface ServiceWorkerGlobalScope {
    __WB_MANIFEST: Array<string | { url: string; revision: string }>;
  }
}

declare const self: ServiceWorkerGlobalScope;

// 跳过等待，立即激活
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Workbox 预缓存（由 vite-plugin-pwa injectManifest 注入清单）
// 必须使用 self.__WB_MANIFEST 以确保 Workbox 注入标记不被 Rollup 消除
precacheAndRoute(self.__WB_MANIFEST);

// ============ 运行时缓存策略 ============

// HTML 页面：StaleWhileRevalidate - 优先缓存，避免 iOS PWA 回前台重载
registerRoute(
  ({ request }) => request.destination === 'document',
  new StaleWhileRevalidate({
    cacheName: 'html-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 5 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// JS/CSS：CacheFirst - Vite 输出的带 hash 文件内容不变
registerRoute(
  ({ request }) => request.destination === 'script' || request.destination === 'style',
  new CacheFirst({
    cacheName: 'static-resources',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// 图片：StaleWhileRevalidate
registerRoute(
  ({ request }) => request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: 'image-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// API GET 请求：网络优先，离线返回缓存
registerRoute(
  ({ url, request }) => url.pathname.startsWith('/api/') && request.method === 'GET',
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// ============ Web Share Target 处理 ============

// 处理 manifest share_target 发出的 POST 请求
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);

  if (url.pathname === '/share' && event.request.method === 'POST') {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const title = formData.get('title') || '';
          const text = formData.get('text') || '';
          const sharedUrl = formData.get('url') || '';

          // 跳转到应用内的分享处理页面，通过 URL params 传递数据
          const params = new URLSearchParams();
          if (title) params.set('title', String(title));
          if (text) params.set('text', String(text));
          if (sharedUrl) params.set('url', String(sharedUrl));

          return Response.redirect(
            new URL(`/share?${params.toString()}`, self.registration.scope).href,
            303
          );
        } catch {
          return Response.redirect(
            new URL('/share', self.registration.scope).href,
            303
          );
        }
      })()
    );
  }
});

// ============ 导航回退 ============

// SPA 路由：所有导航请求回退到 index.html
const navigationHandler = async ({ event }: { event: FetchEvent }) => {
  try {
    return await fetch(event.request);
  } catch {
    return caches.match('/index.html') as Promise<Response>;
  }
};

registerRoute(
  ({ request, url }) =>
    request.mode === 'navigate' &&
    !url.pathname.startsWith('/api/') &&
    !url.pathname.startsWith('/uploads/'),
  navigationHandler
);

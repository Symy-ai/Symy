/**
 * Service Worker — Web Push 通知
 *
 * 🔧 2026-07-20: 营销报告 P2 #16 — 推送通知功能
 *
 * 职责:
 * 1. 接收 push 事件, 显示通知
 * 2. 接收 notificationclick 事件, 聚焦/打开应用
 *
 * 注意: Service Worker 在浏览器后台运行, 不能访问 DOM
 */

// 🔧 Service Worker 生命周期: install → activate → fetch/push/notificationclick
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activated');
  event.waitUntil(self.clients.claim());
});

// 🔧 接收 push 事件, 显示通知
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received');

  let data = {
    title: 'Symy',
    body: 'Symy misses you.',
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    data: { url: '/' },
  };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (err) {
    console.error('[Service Worker] Failed to parse push data:', err);
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      data: data.data,
      vibrate: [200, 100, 200],
    })
  );
});

// 🔧 通知点击: 聚焦或打开应用
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked');

  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 如果已有窗口, 聚焦它
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // 否则打开新窗口
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

/**
 * Claris Service Worker 🌸
 * Web Push 通知の受信とブラウザ通知表示を担当
 */

// Service Worker のバージョン管理用
const SW_VERSION = '1.0.0';

/**
 * push イベント: サーバーからの Web Push を受信
 */
self.addEventListener('push', (event) => {
  const defaultData = {
    title: 'Claris 🌸',
    body: '新しい通知があるよ！',
    icon: '/img/claris-icon.png',
    badge: '/img/claris-badge.png',
    data: { url: '/' },
  };

  let notificationData = defaultData;

  if (event.data) {
    try {
      const payload = event.data.json();
      notificationData = {
        ...defaultData,
        ...payload,
      };
    } catch {
      // JSON パース失敗時はテキストとして処理
      notificationData.body = event.data.text() || defaultData.body;
    }
  }

  const options = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    data: notificationData.data,
    vibrate: [200, 100, 200],
    tag: 'claris-notification',
    // 同じ tag の通知は上書きされる（スパム防止）
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(notificationData.title, options));
});

/**
 * notificationclick イベント: 通知クリックでアプリを開く
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    // 既に開いているタブがあればフォーカス、なければ新しいタブを開く
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

/**
 * activate イベント: 古いキャッシュのクリーンアップ
 */
self.addEventListener('activate', (event) => {
  console.log(`[SW ${SW_VERSION}] Activated`);
  event.waitUntil(self.clients.claim());
});

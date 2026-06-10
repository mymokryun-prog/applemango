const CACHE_NAME = 'applemangotalk-cache-v5';
const OFFLINE_URL = '/offline.html';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/offline.html',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
];

const DB_NAME = 'amang-signal-outbox-db';
const STORE_NAME = 'outbox';
const DB_VERSION = 1;

const openDatabase = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getAllOutboxEntries = async () => {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const deleteOutboxEntry = async (id) => {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const syncOutboxQueue = async () => {
  const entries = await getAllOutboxEntries();
  for (const entry of entries) {
    try {
      const response = await fetch(entry.endpoint, {
        method: entry.method || 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry.payload)
      });
      if (response.ok) {
        await deleteOutboxEntry(entry.id);
      }
    } catch (error) {
      console.warn('Outbox sync failed, will retry later:', error);
    }
  }
};

self.addEventListener('sync', (event) => {
  if (event.tag === 'outbox-sync') {
    event.waitUntil(syncOutboxQueue());
  }
});

self.addEventListener('push', (event) => {
  let payload = { title: '애플망고톡', body: '새로운 알림이 도착했습니다.', data: {} };

  if (event.data) {
    try {
      payload = event.data.json();
    } catch (error) {
      payload = { title: '애플망고톡', body: event.data.text(), data: {} };
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      data: payload.data,
      vibrate: [100, 50, 100]
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const openClient = clientList.find((client) => client.url.includes('/') && 'focus' in client);
      if (openClient) {
        return openClient.focus();
      }
      return self.clients.openWindow('/');
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(event.data.title, event.data.options);
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  // 네비게이션 및 JS/CSS는 항상 네트워크 우선 → 배포 즉시 반영
  const url = new URL(event.request.url);
  const isAsset = url.pathname.startsWith('/assets/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css');
  // API 요청은 실시간 데이터이므로 절대 캐시 우선 금지 (방 생성/삭제·알림·친구 목록 stale 방지)
  const isApi = url.pathname.startsWith('/api/');

  if (event.request.mode === 'navigate' || isAsset || isApi) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // API 응답은 캐시에 저장하지 않음 — 항상 서버 최신 상태를 사용
          if (!isApi && response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // 네트워크 실패(오프라인) 시에만 캐시/오프라인 페이지로 폴백
          if (isApi) {
            return caches.match(event.request).then(r => r || new Response(
              JSON.stringify({ error: 'offline' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            ));
          }
          return caches.match(event.request).then(r => r || caches.match(OFFLINE_URL));
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          return response;
        })
        .catch(() => caches.match(OFFLINE_URL));
    })
  );
});

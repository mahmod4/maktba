/**
 * Service Worker - DOMS Offline-First
 * يخزن الموارد محلياً للعمل بدون إنترنت
 */

const CACHE_NAME = 'doms-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/config.js',
  '/js/engine.js',
  '/js/storage.js',
  '/js/ui-schema.js',
  '/js/ui-orders.js',
  '/js/app.js',
  '/js/auth.js',
  '/js/sync.js',
  '/js/indexeddb.js',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js'
];

// تثبيت وتحميل الملفات للكاش
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    }).catch((err) => {
      console.warn('[SW] Cache addAll error:', err);
    })
  );
  self.skipWaiting();
});

// تنشيط وإزالة الكاش القديم
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// اعتراض الطلبات وخدمتها من الكاش أو الشبكة
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // تخطي طلبات Supabase API والمصادقة
  if (url.hostname.includes('supabase.co') || url.pathname.startsWith('/auth/')) {
    return;
  }

  // تخطي طلبات POST/PUT/DELETE (استخدم الشبكة دائماً)
  if (request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      // إذا موجود في الكاش، استخدمه + حدث في الخلفية
      if (cachedResponse) {
        // في الخلفية حاول تحديث الكاش
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, networkResponse.clone());
              });
            }
          })
          .catch(() => {/* فشل الشبكة، نستخدم الكاش */});
        return cachedResponse;
      }

      // جرب الشبكة أولاً
      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        // حفظ في الكاش
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, networkResponse.clone());
        });
        return networkResponse;
      }).catch(() => {
        // فشل الشبكة وما فيش كاش
        console.warn('[SW] Network failed and no cache for:', request.url);
        return new Response('Offline and not cached', { status: 503 });
      });
    })
  );
});

// استقبال رسائل من الصفحة الرئيسية
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

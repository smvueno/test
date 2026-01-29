// Service Worker for offline support
const CACHE_NAME = 'fruit-bounce-v1-' + '1769646369884'; // Will be replaced at build time
const urlsToCache = [
    './',
    './index.html'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('✅ Service worker installed - cached files for offline use');
                return cache.addAll(urlsToCache);
            })
            .catch((err) => {
                console.error('❌ Service worker cache failed:', err);
            })
    );
    // Don't auto-activate - wait for user confirmation via SKIP_WAITING message
    // This allows the update modal to show and wait for user interaction
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑️ Cleaning up old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    console.log('✅ Service worker activated and ready');
    // Claim all clients immediately
    return self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Skip Supabase API calls - use stale-while-revalidate for leaderboard data
    if (request.url.includes('supabase.co')) {
        // For leaderboard endpoints, use stale-while-revalidate
        if (request.url.includes('/leaderboard')) {
            // Network First Strategy for Leaderboard
            // We need fresh data for Realtime updates.
            // 1. Try Network
            // 2. If successful, update cache and return
            // 3. If failed (offline), return cached response
            event.respondWith(
                fetch(request)
                    .then((networkResponse) => {
                        // Clone response to cache it
                        const responseToCache = networkResponse.clone();

                        if (networkResponse.ok) {
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(request, responseToCache);
                            });
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // Network failed (offline), try cache
                        return caches.match(request);
                    })
            );
        } else {

            // For other Supabase calls (auth, etc.), always use network
            return event.respondWith(fetch(request));
        }
        return;
    }

    // Google Fonts Caching - Cache First Strategy
    if (request.url.includes('fonts.googleapis.com') || request.url.includes('fonts.gstatic.com')) {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                const fetchRequest = request.clone();
                return fetch(fetchRequest).then((response) => {
                    // Check if valid response (allow opaque responses for CORS)
                    if (!response || (response.status !== 200 && response.type !== 'opaque') || (response.type !== 'basic' && response.type !== 'cors' && response.type !== 'opaque')) {
                        return response;
                    }
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseToCache);
                    });
                    return response;
                });
            })
        );
        return;
    }

    // Cache-first strategy for static assets
    event.respondWith(
        caches.match(request)
            .then((response) => {
                // Cache hit - return response
                if (response) {
                    return response;
                }

                // Clone the request
                const fetchRequest = request.clone();

                return fetch(fetchRequest).then((response) => {
                    // Check if valid response
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    // SAFETY CHECK: In SPA mode, 404s often return index.html (text/html).
                    // We must NOT cache index.html as a script or css file!
                    const contentType = response.headers.get('content-type');
                    const isHTML = contentType && contentType.includes('text/html');
                    const isAsset = request.url.match(/\.(js|css|png|jpg|jpeg|svg|json)$/i);

                    if (isAsset && isHTML) {
                        console.warn('⚠️ Preventing caching of HTML response for asset:', request.url);
                        return response;
                    }

                    // Clone the response
                    const responseToCache = response.clone();

                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(request, responseToCache);
                        });

                    return response;
                }).catch(() => {
                    // Network failed, try to return cached version
                    return caches.match('./index.html');
                });
            })
    );
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
// Cache update test - Build 2

console.log("Service worker is active - should enable PWA functionality");

const cacheName = 'chtbt2-a9622b2c'; // Change this to force an update

// Files to cache for offline use
const filesToCache = [
    './',
    './index.html',
    './manifest.json',
    './js/main.js',
    './js/api/OpenAIClient.js',
    './js/data/names.js',
    './js/state/AppSettings.js',
    './js/state/StoryState.js',
    './js/storage/CloudSyncManager.js',
    './js/storage/StorageManager.js',
    './js/ui/ApplyEditsManager.js',
    './js/ui/BrainstormManager.js',
    './js/ui/CloudSyncUI.js',
    './js/ui/DraftMergeManager.js',
    './js/ui/MemoryHistoryManager.js',
    './js/ui/QuickRepliesManager.js',
    './js/ui/SettingsMenu.js',
    './js/ui/SlotManager.js',
    './js/ui/SummaryManager.js',
    './js/ui/ToolsManager.js',
    './js/ui/UIManager.js',
    './js/utils/DiceRoller.js',
    './js/utils/HashUtils.js',
    './js/utils/NameGenerator.js',
    './js/utils/TokenCalculator.js',
    './js/utils/diff.js',
    './css/main.css'
];

self.addEventListener("install", event => {
    self.skipWaiting(); // Take over immediately
    event.waitUntil(
        caches.open(cacheName).then(cache => {
            return cache.addAll(filesToCache);
        })
    );
});

self.addEventListener("activate", event => {
    // When the cacheName changes, delete all older caches
    event.waitUntil(
        caches.keys().then(keyList => {
            return Promise.all(keyList.map(key => {
                if (key !== cacheName) {
                    console.log('[ServiceWorker] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim(); // Take control of all open pages
});

self.addEventListener("fetch", event => {
    // Network-first strategy
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // If network fetch succeeds, update the cache and return the response
                return caches.open(cacheName).then(cache => {
                    cache.put(event.request, response.clone());
                    return response;
                });
            })
            .catch(() => {
                // If network fails (offline), return from cache
                return caches.match(event.request);
            })
    );
});
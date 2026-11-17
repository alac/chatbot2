console.log("Service worker is active - should enable PWA functionality");

const cacheName = 'chtbt2-48567134'; // Updated hash to force the new SW to install

// Files to cache for offline use
const filesToCache = [
    './',
    './index.html',
    './manifest.json',
    './js/main.js',
    './js/api/GithubClient.js',
    './js/api/ImageClient.js',
    './js/api/LocalRewriterEngine.js',
    './js/api/OpenAIClient.js',
    './js/data/names.js',
    './js/paperdoll/INTEGRATION.md',
    './js/paperdoll/src/body.js',
    './js/paperdoll/src/color.js',
    './js/paperdoll/src/compose.js',
    './js/paperdoll/src/element.js',
    './js/paperdoll/src/face.js',
    './js/paperdoll/src/geom.js',
    './js/paperdoll/src/index.js',
    './js/paperdoll/src/layers.js',
    './js/paperdoll/src/normalize.js',
    './js/paperdoll/src/registry.js',
    './js/paperdoll/src/render.js',
    './js/paperdoll/src/rig.js',
    './js/paperdoll/src/schema.js',
    './js/paperdoll/src/template.js',
    './js/paperdoll/src/assets/apron.js',
    './js/paperdoll/src/assets/dress.js',
    './js/paperdoll/src/assets/eyewear.js',
    './js/paperdoll/src/assets/hair.js',
    './js/paperdoll/src/assets/hairwear.js',
    './js/paperdoll/src/assets/hats.js',
    './js/paperdoll/src/assets/index.js',
    './js/paperdoll/src/assets/legwear.js',
    './js/paperdoll/src/assets/maid.js',
    './js/paperdoll/src/assets/neckwear.js',
    './js/paperdoll/src/assets/outer.js',
    './js/paperdoll/src/assets/pants.js',
    './js/paperdoll/src/assets/shoes.js',
    './js/paperdoll/src/assets/skirt.js',
    './js/paperdoll/src/assets/swimwear.js',
    './js/paperdoll/src/assets/top.js',
    './js/paperdoll/src/assets/washitsu.js',
    './js/services/GenerationCoordinator.js',
    './js/state/AppSettings.js',
    './js/state/StoryState.js',
    './js/storage/CloudSyncManager.js',
    './js/storage/StorageManager.js',
    './js/sync/CloudPayloadCodec.js',
    './js/sync/SyncEngine.js',
    './js/ui/ApplyEditsManager.js',
    './js/ui/AvatarManager.js',
    './js/ui/BatchEditManager.js',
    './js/ui/BrainstormManager.js',
    './js/ui/CloudSyncUI.js',
    './js/ui/DirectorManager.js',
    './js/ui/DraftMergeManager.js',
    './js/ui/DraftSwitcher.js',
    './js/ui/EditLogManager.js',
    './js/ui/FavoritesManager.js',
    './js/ui/FlagCollectorManager.js',
    './js/ui/ImageGenManager.js',
    './js/ui/MemoryHistoryManager.js',
    './js/ui/NanoGPTUsage.js',
    './js/ui/NotesManager.js',
    './js/ui/QuickRepliesManager.js',
    './js/ui/RemoteManagerUI.js',
    './js/ui/RequestTracker.js',
    './js/ui/RewriterManager.js',
    './js/ui/ScrollNavigator.js',
    './js/ui/SelectionToolbarManager.js',
    './js/ui/SettingsMenu.js',
    './js/ui/SlotManager.js',
    './js/ui/SummaryManager.js',
    './js/ui/SurgicalEditManager.js',
    './js/ui/TextRenderer.js',
    './js/ui/TimelineGeneratorManager.js',
    './js/ui/TimelineManager.js',
    './js/ui/ToolsManager.js',
    './js/ui/TrashExplorerManager.js',
    './js/ui/TurnRenderer.js',
    './js/ui/UIManager.js',
    './js/utils/CompressionUtils.js',
    './js/utils/CryptoUtils.js',
    './js/utils/DiceRoller.js',
    './js/utils/HashUtils.js',
    './js/utils/ImageOptimizer.js',
    './js/utils/NameGenerator.js',
    './js/utils/TokenCalculator.js',
    './js/utils/diff.js',
    './js/utils/textUtils.js',
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
    // Only handle requests for our own origin; pass through external API calls untouched
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    // The Cache API only supports GET requests. 
    // We must pass POST, PATCH, DELETE, etc., straight to the network.
     if (event.request.method !== 'GET') {
        return;
    }

    const url = new URL(event.request.url);

    // Bypass Service Worker completely for dynamic APIs and raw Gists
    if (url.hostname.includes('github.com') || 
        url.hostname.includes('githubusercontent.com')) {
        return;
    }

    // Network-first strategy for GET requests
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // If network fetch succeeds, update the cache and return the response
                return caches.open(cacheName).then(cache => {
                    // Only cache valid HTTP/HTTPS responses (prevents extension protocol bugs)
                    if (event.request.url.startsWith('http')) {
                        cache.put(event.request, response.clone());
                    }
                    return response;
                });
            })
            .catch(() => {
                // If network fails (offline), return from cache
                return caches.match(event.request);
            })
    );
});
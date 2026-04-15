console.log("Service worker is active - should enable PWA functionality");

const cacheName = 'chtbt2-3378aee4'; // Change value to force update

self.addEventListener("install", event => {
	// Kick out the old service worker
	self.skipWaiting();
});

self.addEventListener("fetch", function (event) {
	return;
})
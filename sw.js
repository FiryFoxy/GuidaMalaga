const CACHE_VERSION = '8';
const CACHE_NAME = `malaga-guide-${CACHE_VERSION}`;

const PRECACHE = [
    'index.html',
    'assets/main.css',
    'assets/logo.svg',
    'assets/site.webmanifest',
    'assets/icons/icon-192.png',
    'assets/icons/icon-512.png',
    'assets/icons/apple-touch-icon.png',
    'planner.js',
    'supabase-client.js',
    'group-planning-ui.js',
    'map.js',
    'planner-ui.js',
    'weather.js',
    'vocabulary.js',
    'pwa.js',
    'data/config.json',
    'data/vocabulary-audio.json',
    'data/coordinates.json',
    'data/weather-tips.json',
    'data/places/culture.json',
    'data/places/food.json',
    'data/places/nightlife.json',
    'data/places/shopping.json',
    'data/places/excursions.json',
    'sections/intro.html',
    'sections/culture.html',
    'sections/food.html',
    'sections/dishes.html',
    'assets/images/dishes/espeto-sardinas.jpg',
    'assets/images/dishes/gazpachuelo.jpg',
    'assets/images/dishes/porra-antequerana.jpg',
    'assets/images/dishes/ensalada-malaguena.jpg',
    'assets/images/dishes/fritura-malaguena.jpg',
    'assets/images/dishes/ajoblanco.jpg',
    'assets/images/dishes/plato-montes.jpg',
    'assets/images/dishes/tarta-malaguena.jpg',
    'sections/nightlife.html',
    'sections/shopping.html',
    'sections/excursions.html',
    'sections/weather.html',
    'sections/map.html',
    'sections/planner.html',
    'sections/program.html',
    'sections/vocabulary.html'
];

function scopeUrl(path) {
    return new URL(path, self.registration.scope).href;
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE.map(scopeUrl)))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key.startsWith('malaga-guide-') && key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match(scopeUrl('index.html')))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            const network = fetch(event.request).then((response) => {
                if (response.ok && response.type === 'basic') {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                }
                return response;
            });
            return cached || network;
        })
    );
});

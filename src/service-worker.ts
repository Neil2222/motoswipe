/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

/**
 * Service worker: what makes the app installable and quick to open, and
 * nothing more.
 *
 * Caches the built app shell (immutable, hashed files) and the static assets
 * once per deployment. Pages, API calls and photographs are always fetched
 * from the network — a swipe must be recorded, a deck must be current, and
 * hotlinked manufacturer images are never copied anywhere — so there is no
 * offline mode, only a cold-start that does not wait for JavaScript.
 */

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `motoswipe-${version}`;
const ASSETS = [...build, ...files.filter((f) => !f.startsWith('/media/'))];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	// Only our own, pre-cached assets. Everything else goes straight through.
	if (url.origin !== location.origin || !ASSETS.includes(url.pathname)) return;

	event.respondWith(
		caches.open(CACHE).then(async (cache) => {
			const cached = await cache.match(request);
			return cached ?? fetch(request);
		})
	);
});

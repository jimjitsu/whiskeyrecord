/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Offline support: cache the app shell (built JS/CSS, fonts, icons) on install,
// then serve it cache-first. Navigations fall back to the cached index.html so
// every route works offline. Requests to other sites (Google, OpenRouter) are
// never cached.
import { assets, immutable } from '$app/manifest';
import { version } from '$app/env';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `whiskey-record-${version}`;
/** Holds a share from the Android share sheet until /share picks it up. */
const SHARE_CACHE = 'whiskey-record-share';
const SHELL = [...immutable, ...assets].map((f) => `/${f.path}`).concat('/');

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(SHELL))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => {
				// Keep the previous version's files for one more update, so a page
				// that was already open can still load the code it asks for.
				const old = keys.filter((k) => k !== CACHE && k !== SHARE_CACHE);
				return Promise.all(old.slice(0, -1).map((k) => caches.delete(k)));
			})
			.then(() => sw.clients.claim())
	);
});

// "Share to Whiskey Record" (Android share sheet): the shared photo arrives as a
// form POST to /share-target. Keep the files and text in a cache, then send the
// app to /share, which turns them into a new record.

async function receiveShare(request: Request): Promise<Response> {
	try {
		const form = await request.formData();
		const cache = await caches.open(SHARE_CACHE);
		for (const key of await cache.keys()) await cache.delete(key);
		const files = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
		await Promise.all(
			files.map((f, i) =>
				cache.put(`/shared/photo-${i}`, new Response(f, { headers: { 'Content-Type': f.type } }))
			)
		);
		const meta = {
			count: files.length,
			title: String(form.get('title') ?? ''),
			text: String(form.get('text') ?? ''),
			url: String(form.get('url') ?? '')
		};
		await cache.put('/shared/meta', new Response(JSON.stringify(meta)));
	} catch {
		/* /share will say nothing arrived */
	}
	return Response.redirect('/share', 303);
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);
	if (
		request.method === 'POST' &&
		url.origin === sw.location.origin &&
		url.pathname === '/share-target'
	) {
		event.respondWith(receiveShare(request));
		return;
	}
	if (request.method !== 'GET') return;
	if (url.origin !== sw.location.origin) return;

	if (request.mode === 'navigate') {
		// Network first so updates show up; cached shell when offline.
		event.respondWith(
			fetch(request).catch(async () => (await caches.match('/')) ?? Response.error())
		);
		return;
	}

	event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
});

<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resizeImage } from '#lib/images.ts';
	import { pendingPhotos } from '#lib/draft.svelte.ts';

	// Something was shared to Whiskey Record from another app. The service worker
	// stashed it in a cache; turn it into a new record (photos get read by AI).
	const SHARE_CACHE = 'whiskey-record-share';
	const NEW_DRAFT_KEY = 'whiskey-record:draft:new';
	let message = $state('Opening what you shared…');
	let failed = $state(false);

	interface Meta {
		count: number;
		title: string;
		text: string;
		url: string;
	}

	/** A shared page title often looks like "Eagle Rare 10 Year | Some Store". */
	function nameFrom(meta: Meta): string {
		const raw = meta.title || (/^https?:\/\//.test(meta.text) ? '' : meta.text);
		return raw
			.split(/\s[|–—-]\s/)[0]
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 80);
	}

	onMount(async () => {
		try {
			const cache = await caches.open(SHARE_CACHE);
			const metaRes = await cache.match('/shared/meta');
			if (!metaRes) throw new Error('nothing');
			const meta = (await metaRes.json()) as Meta;
			const blobs: Blob[] = [];
			for (let i = 0; i < meta.count; i++) {
				const r = await cache.match(`/shared/photo-${i}`);
				if (r) blobs.push(await resizeImage(await r.blob()));
			}
			for (const key of await cache.keys()) await cache.delete(key);

			if (blobs.length) {
				pendingPhotos.blobs = blobs;
				goto('/record/new', { replaceState: true });
				return;
			}
			const name = nameFrom(meta);
			if (name || meta.url) {
				// No photo, just a link or text: start a record with the name filled in.
				try {
					localStorage.removeItem(NEW_DRAFT_KEY);
				} catch {
					/* ignore */
				}
				goto(`/record/new?name=${encodeURIComponent(name)}`, { replaceState: true });
				return;
			}
			throw new Error('nothing');
		} catch {
			failed = true;
			message =
				'Nothing came through from the share. Try sharing the photo itself (for a web image, long-press it and choose Share image).';
		}
	});
</script>

<main>
	<h1>{failed ? 'Nothing to add' : 'Adding…'}</h1>
	<p class:muted={!failed}>{message}</p>
	{#if failed}<a class="btn btn-block" href="/">Back to search</a>{/if}
</main>

<style>
	main {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-6) var(--gutter);
	}
	p {
		margin: 0;
	}
</style>

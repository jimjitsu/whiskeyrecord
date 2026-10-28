import { db } from './db';
import { getToken } from './google/auth.svelte';
import { downloadPhoto } from './google/api';

// Drive starts refusing (HTTP 429) when a new device asks for hundreds of
// photos at once, so downloads go through a small shared queue.
const MAX_DOWNLOADS = 3;
let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
	if (active >= MAX_DOWNLOADS) await new Promise<void>((go) => waiting.push(go));
	active++;
	try {
		return await fn();
	} finally {
		active--;
		waiting.shift()?.();
	}
}

/**
 * Object URLs for stored photos, keyed by photo id. Photos synced from another
 * device arrive without the image itself; it's downloaded from Drive the first
 * time it's shown, then kept on this device. Call `release()` on unmount.
 */
export function createPhotoUrls() {
	const urls = $state<Record<string, string>>({});
	/** True when a photo couldn't be fetched because Google sign-in has expired. */
	const state = $state({ needsSignIn: false });
	// Bookkeeping only; nothing renders from it, so it needn't be reactive.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const pending = new Set<string>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const waitingForSignIn = new Set<string>();

	async function load(ids: string[]) {
		const missing = ids.filter((id) => !urls[id] && !pending.has(id));
		if (!missing.length) return;
		missing.forEach((id) => pending.add(id));
		const rows = await db.photos.bulkGet(missing);
		await Promise.all(
			rows.map(async (row) => {
				if (!row) return;
				let blob = row.blob;
				if (!blob && row.driveFileId) {
					const token = getToken();
					if (!token) {
						waitingForSignIn.add(row.id);
						state.needsSignIn = true;
						return;
					}
					try {
						blob = await slot(() => downloadPhoto(token, row.driveFileId!));
						await db.photos.update(row.id, { blob });
					} catch {
						/* offline or removed from Drive: leave the placeholder */
					}
				}
				if (blob) urls[row.id] = URL.createObjectURL(blob);
			})
		);
		missing.forEach((id) => pending.delete(id));
	}

	/** After signing in again: fetch the photos that were waiting. */
	function retry() {
		const ids = [...waitingForSignIn];
		waitingForSignIn.clear();
		state.needsSignIn = false;
		return load(ids);
	}

	function release() {
		for (const url of Object.values(urls)) URL.revokeObjectURL(url);
	}

	return {
		urls,
		load,
		retry,
		release,
		get needsSignIn() {
			return state.needsSignIn;
		}
	};
}

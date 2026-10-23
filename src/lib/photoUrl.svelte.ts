import { db } from './db';
import { getToken } from './google/auth.svelte';
import { downloadPhoto } from './google/api';

/**
 * Object URLs for stored photos, keyed by photo id. Photos synced from another
 * device arrive without the image itself; it's downloaded from Drive the first
 * time it's shown, then kept on this device. Call `release()` on unmount.
 */
export function createPhotoUrls() {
	const urls = $state<Record<string, string>>({});
	// Bookkeeping only; nothing renders from it, so it needn't be reactive.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const pending = new Set<string>();

	async function load(ids: string[]) {
		const missing = ids.filter((id) => !urls[id] && !pending.has(id));
		if (!missing.length) return;
		missing.forEach((id) => pending.add(id));
		const rows = await db.photos.bulkGet(missing);
		for (const row of rows) {
			if (!row) continue;
			let blob = row.blob;
			const token = getToken();
			if (!blob && row.driveFileId && token) {
				try {
					blob = await downloadPhoto(token, row.driveFileId);
					await db.photos.update(row.id, { blob });
				} catch {
					/* offline or removed from Drive: leave the placeholder */
				}
			}
			if (blob) urls[row.id] = URL.createObjectURL(blob);
		}
		missing.forEach((id) => pending.delete(id));
	}

	function release() {
		for (const url of Object.values(urls)) URL.revokeObjectURL(url);
	}

	return { urls, load, release };
}

import { db } from './db';

/**
 * Object URLs for stored photos, keyed by photo id. Call `release()` when the
 * component unmounts so the browser can free the memory.
 */
export function createPhotoUrls() {
	const urls = $state<Record<string, string>>({});

	async function load(ids: string[]) {
		const missing = ids.filter((id) => !urls[id]);
		if (!missing.length) return;
		const rows = await db.photos.bulkGet(missing);
		for (const row of rows) if (row) urls[row.id] = URL.createObjectURL(row.blob);
	}

	function release() {
		for (const url of Object.values(urls)) URL.revokeObjectURL(url);
	}

	return { urls, load, release };
}

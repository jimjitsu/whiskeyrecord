<script lang="ts">
	import { page } from '$app/state';
	import { addPhotos, emptyWhiskey, type Whiskey } from '#lib/db.ts';
	import { takePendingPhotos } from '#lib/draft.svelte.ts';
	import RecordForm from '#lib/components/RecordForm.svelte';

	const DRAFT_KEY = 'whiskey-record:draft:new';

	// Start from the unsaved draft if there is one, unless new photos just arrived
	// from the camera (that means a fresh entry).
	// Photos straight from the camera get read by AI right away (when connected).
	let fromCamera = $state(false);

	async function start(): Promise<Whiskey> {
		const blobs = takePendingPhotos();
		fromCamera = blobs.length > 0;
		if (!blobs.length) {
			try {
				const raw = localStorage.getItem(DRAFT_KEY);
				if (raw) return (JSON.parse(raw) as { w: Whiskey }).w;
			} catch {
				/* ignore */
			}
		} else {
			try {
				localStorage.removeItem(DRAFT_KEY);
			} catch {
				/* ignore */
			}
		}
		const w = emptyWhiskey();
		w.name = page.url.searchParams.get('name') ?? '';
		w.photoIds = blobs.length ? await addPhotos(blobs) : [];
		return w;
	}
	const initialRecord = start();
</script>

{#await initialRecord then initial}
	<RecordForm {initial} isNew draftKey={DRAFT_KEY} autoRead={fromCamera} />
{/await}

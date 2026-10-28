<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onDestroy, onMount } from 'svelte';
	import { resizeImage } from '#lib/images.ts';
	import { pendingBarcode, pendingPhotos } from '#lib/draft.svelte.ts';
	import { findByBarcode, type Whiskey } from '#lib/db.ts';
	import { barcodeSupported, readBarcodeFromBlob, watchVideo } from '#lib/barcode.ts';
	import { createPhotoUrls } from '#lib/photoUrl.svelte.ts';
	import WhiskeyRow from '#lib/components/WhiskeyRow.svelte';

	// In-app viewfinder so several shots can be taken in a row.
	// Falls back to the phone's own camera if permission is denied.
	let video: HTMLVideoElement;
	let stream: MediaStream | null = null;
	let cameraError = $state('');
	let shots = $state<{ blob: Blob; url: string }[]>([]);
	let busy = $state(false);

	// Barcode check: a barcode in view is matched against your own record.
	const canScan = barcodeSupported();
	/** A scanned barcode that's already in the record. */
	let found = $state<{ code: string; matches: Whiskey[] } | null>(null);
	/** A scanned barcode that isn't; it's saved with the new whiskey. */
	let newCode = $state('');
	// Codes already dealt with on this screen, so they don't pop up again.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const handled = new Set<string>();
	const covers = createPhotoUrls();
	let stopWatching = () => {};

	async function onCode(code: string) {
		if (handled.has(code)) return;
		handled.add(code);
		const matches = await findByBarcode(code);
		if (matches.length) {
			found = { code, matches };
			covers.load(matches.flatMap((m) => m.photoIds.slice(0, 1)));
			navigator.vibrate?.(40);
		} else if (!newCode) {
			newCode = code;
		}
	}

	function keepShooting() {
		found = null;
	}

	const foundTitle = $derived(
		!found
			? ''
			: found.matches.length > 1
				? 'In your record'
				: found.matches[0].status === 'tasted'
					? "✓ You've had this"
					: 'On your want-to-try list'
	);

	onMount(async () => {
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
				audio: false
			});
			video.srcObject = stream;
			stopWatching = watchVideo(video, onCode);
		} catch {
			cameraError =
				"Couldn't open the camera here. You can still use your phone's camera or pick photos.";
		}
	});

	onDestroy(() => {
		stopWatching();
		covers.release();
		stream?.getTracks().forEach((t) => t.stop());
		shots.forEach((s) => URL.revokeObjectURL(s.url));
	});

	function push(small: Blob) {
		shots.push({ blob: small, url: URL.createObjectURL(small) });
	}

	async function addBlob(blob: Blob) {
		// A barcode in a full-size photo reads better than in the resized copy.
		readBarcodeFromBlob(blob).then((code) => {
			if (code) onCode(code);
		});
		push(await resizeImage(blob));
	}

	async function capture() {
		if (!video?.videoWidth || busy) return;
		busy = true;
		const canvas = document.createElement('canvas');
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		canvas.getContext('2d')!.drawImage(video, 0, 0);
		const shot = await resizeImage(canvas);
		push(shot);
		busy = false;
	}

	async function fromFiles(e: Event & { currentTarget: HTMLInputElement }) {
		const input = e.currentTarget;
		const files = [...(input.files ?? [])];
		// Clear now so picking the same photo again still fires a change.
		input.value = '';
		busy = true;
		try {
			for (const f of files) await addBlob(f);
		} finally {
			busy = false;
		}
	}

	function remove(i: number) {
		URL.revokeObjectURL(shots[i].url);
		shots.splice(i, 1);
	}

	function done() {
		pendingPhotos.blobs = shots.map((s) => s.blob);
		pendingBarcode.code = newCode;
		// A search that found nothing passes its text along as a starting name.
		const name = page.url.searchParams.get('name');
		goto(name ? `/record/new?name=${encodeURIComponent(name)}` : '/record/new');
	}
</script>

<div class="camera">
	<div class="top">
		<a class="close" href="/" aria-label="Close camera">✕</a>
		<p>{canScan ? 'Fit the label or its barcode in the frame' : 'Fit the label in the frame'}</p>
	</div>

	<div class="view">
		<video bind:this={video} autoplay playsinline muted></video>
		<div class="guide" aria-hidden="true"></div>
		{#if found}
			<div class="found" role="dialog" aria-label="Barcode match">
				<p class="eyebrow" class:had={found.matches[0].status === 'tasted'}>{foundTitle}</p>
				<div class="matches">
					{#each found.matches as m (m.id)}
						<WhiskeyRow whiskey={m} cover={covers.urls[m.photoIds[0]]} />
					{/each}
				</div>
				<div class="found-actions" class:one={found.matches.length > 1}>
					<button class="btn" onclick={keepShooting}>Keep shooting</button>
					{#if found.matches.length === 1}
						<a class="btn btn-primary open" href="/record/{found.matches[0].id}">Open record</a>
					{/if}
				</div>
			</div>
		{:else if newCode}
			<div class="newcode" role="status">
				<span class="bars" aria-hidden="true"></span>
				<span>New barcode. It'll be saved with this whiskey.</span>
			</div>
		{/if}
		{#if cameraError}
			<div class="fallback">
				<p>{cameraError}</p>
				<label class="btn btn-primary">
					Use phone camera
					<input
						class="visually-hidden"
						type="file"
						accept="image/*"
						capture="environment"
						onchange={fromFiles}
					/>
				</label>
			</div>
		{/if}
	</div>

	<div class="controls">
		<div class="strip" aria-label="Photos taken">
			{#each shots as s, i (s.url)}
				<button
					class="shot"
					class:cover={i === 0}
					onclick={() => remove(i)}
					aria-label="Remove photo {i + 1}"
				>
					<img src={s.url} alt="" />
				</button>
			{/each}
			<span class="count">
				{#if shots.length}{shots.length} photo{shots.length > 1 ? 's' : ''} · first is the cover · tap
					to remove{:else}No photos yet{/if}
			</span>
		</div>
		<div class="buttons">
			<label class="gallery">
				<svg
					viewBox="0 0 24 24"
					width="28"
					height="28"
					aria-hidden="true"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path
						d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"
					/></svg
				>
				<span>Gallery</span>
				<input class="visually-hidden" type="file" accept="image/*" multiple onchange={fromFiles} />
			</label>
			<button
				class="shutter"
				onclick={capture}
				disabled={!!cameraError || busy}
				aria-label="Take photo"
			></button>
			<button class="btn done" onclick={done} disabled={!shots.length || busy}>Done</button>
		</div>
	</div>
</div>

<style>
	.camera {
		position: fixed;
		inset: 0;
		display: grid;
		grid-template-rows: auto 1fr auto;
		background: #111;
		color: #f5efe0;
		z-index: 30;
	}
	.top {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--gutter);
	}
	.top p {
		margin: 0;
		font-size: 14px;
	}
	.close {
		display: grid;
		place-items: center;
		width: var(--tap);
		height: var(--tap);
		text-decoration: none;
		font-size: 22px;
	}
	.view {
		position: relative;
		overflow: hidden;
	}
	video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.guide {
		position: absolute;
		inset: 8% 20%;
		border: 2px dashed rgba(245, 239, 224, 0.8);
		pointer-events: none;
	}
	.found {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4) var(--gutter);
		background: var(--base);
		color: var(--ink);
		border-top: var(--border);
		max-height: 80%;
		overflow-y: auto;
	}
	.found .eyebrow {
		margin: 0;
	}
	.found .eyebrow.had {
		color: var(--teal);
	}
	.matches {
		display: grid;
		gap: var(--space-2);
	}
	.found-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2);
	}
	.found-actions.one {
		grid-template-columns: 1fr;
	}
	.open {
		background: var(--teal);
		border-color: var(--teal);
		color: var(--on-accent);
	}
	.newcode {
		position: absolute;
		left: var(--gutter);
		right: var(--gutter);
		bottom: var(--space-4);
		display: flex;
		gap: var(--space-3);
		align-items: center;
		padding: var(--space-3);
		background: #1a1a1a;
		border: 1px solid #f5efe0;
		font-size: 13px;
	}
	.bars {
		flex: none;
		width: 22px;
		height: 16px;
		background: repeating-linear-gradient(
			90deg,
			#ffc857 0 2px,
			transparent 2px 4px,
			#ffc857 4px 5px,
			transparent 5px 7px
		);
	}
	.fallback {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		gap: var(--space-4);
		padding: var(--space-5);
		text-align: center;
		background: #111;
	}
	.controls {
		background: #000;
		padding: var(--space-3) var(--gutter) calc(var(--space-4) + env(safe-area-inset-bottom));
		display: grid;
		gap: var(--space-3);
	}
	.strip {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 56px;
		overflow-x: auto;
	}
	.shot {
		flex: none;
		width: 48px;
		height: 56px;
		padding: 0;
		border: 1px solid #555;
		background: #333;
	}
	.shot.cover {
		border: 2px solid var(--amber);
	}
	.shot img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.count {
		font-size: 12px;
		color: #b8b0a0;
		flex: none;
	}
	.buttons {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
	}
	.gallery {
		justify-self: start;
		display: grid;
		justify-items: center;
		font-size: 11px;
		cursor: pointer;
		min-width: var(--tap);
	}
	.shutter {
		width: 76px;
		height: 76px;
		border-radius: 50%;
		border: 4px solid #f5efe0;
		background: #f5efe0;
		box-shadow: inset 0 0 0 4px #000;
		cursor: pointer;
	}
	.shutter:disabled {
		opacity: 0.4;
	}
	.done {
		justify-self: end;
		border-color: #f5efe0;
	}
</style>

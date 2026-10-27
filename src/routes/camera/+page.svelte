<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onDestroy, onMount } from 'svelte';
	import { resizeImage } from '#lib/images.ts';
	import { pendingPhotos } from '#lib/draft.svelte.ts';

	// In-app viewfinder so several shots can be taken in a row.
	// Falls back to the phone's own camera if permission is denied.
	let video: HTMLVideoElement;
	let stream: MediaStream | null = null;
	let cameraError = $state('');
	let shots = $state<{ blob: Blob; url: string }[]>([]);
	let busy = $state(false);

	onMount(async () => {
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
				audio: false
			});
			video.srcObject = stream;
		} catch {
			cameraError =
				"Couldn't open the camera here. You can still use your phone's camera or pick photos.";
		}
	});

	onDestroy(() => {
		stream?.getTracks().forEach((t) => t.stop());
		shots.forEach((s) => URL.revokeObjectURL(s.url));
	});

	function push(small: Blob) {
		shots.push({ blob: small, url: URL.createObjectURL(small) });
	}

	async function addBlob(blob: Blob) {
		push(await resizeImage(blob));
	}

	async function capture() {
		if (!video?.videoWidth || busy) return;
		busy = true;
		const canvas = document.createElement('canvas');
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		canvas.getContext('2d')!.drawImage(video, 0, 0);
		push(await resizeImage(canvas));
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
		// A search that found nothing passes its text along as a starting name.
		const name = page.url.searchParams.get('name');
		goto(name ? `/record/new?name=${encodeURIComponent(name)}` : '/record/new');
	}
</script>

<div class="camera">
	<div class="top">
		<a class="close" href="/" aria-label="Close camera">✕</a>
		<p>Fit the label in the frame</p>
	</div>

	<div class="view">
		<video bind:this={video} autoplay playsinline muted></video>
		<div class="guide" aria-hidden="true"></div>
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

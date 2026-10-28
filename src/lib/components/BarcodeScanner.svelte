<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { watchVideo } from '#lib/barcode.ts';

	/** Full-screen viewfinder that closes as soon as it reads a barcode. */
	let { onscan, onclose }: { onscan: (code: string) => void; onclose: () => void } = $props();

	let video: HTMLVideoElement;
	let stream: MediaStream | null = null;
	let error = $state('');
	let stop = () => {};

	onMount(async () => {
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' } },
				audio: false
			});
			video.srcObject = stream;
			stop = watchVideo(video, (code) => {
				stop();
				navigator.vibrate?.(40);
				onscan(code);
			});
		} catch {
			error = "Couldn't open the camera. You can type the numbers under the bars instead.";
		}
	});

	onDestroy(() => {
		stop();
		stream?.getTracks().forEach((t) => t.stop());
	});
</script>

<div class="scanner" role="dialog" aria-label="Scan a barcode">
	<div class="top">
		<button type="button" class="close" onclick={onclose} aria-label="Close scanner">✕</button>
		<p>Point at the barcode on the bottle</p>
	</div>
	<div class="view">
		<video bind:this={video} autoplay playsinline muted></video>
		<div class="guide" aria-hidden="true"></div>
		{#if error}<p class="error">{error}</p>{/if}
	</div>
</div>

<style>
	.scanner {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: grid;
		grid-template-rows: auto 1fr;
		background: #111;
		color: #f5efe0;
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
		width: var(--tap);
		height: var(--tap);
		border: 0;
		background: none;
		color: inherit;
		font-size: 22px;
		cursor: pointer;
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
		left: 12%;
		right: 12%;
		top: 38%;
		height: 24%;
		border: 3px solid var(--teal);
		pointer-events: none;
	}
	.error {
		position: absolute;
		inset: auto var(--gutter) var(--space-5);
		margin: 0;
		padding: var(--space-3);
		background: #1a1a1a;
		border: 1px solid #f5efe0;
		font-size: 14px;
	}
</style>

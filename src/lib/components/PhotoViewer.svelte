<script lang="ts">
	/**
	 * Full-screen photo viewer: swipe between photos, tap a thumbnail to jump.
	 * View only; the cover is changed in the edit form.
	 */
	let {
		urls,
		name,
		start = 0,
		onclose
	}: { urls: (string | undefined)[]; name: string; start?: number; onclose: () => void } = $props();

	let dialog = $state<HTMLDialogElement>();
	let track = $state<HTMLDivElement>();
	let index = $state(0);

	$effect(() => {
		if (!dialog || !track) return;
		dialog.showModal();
		index = start;
		track.scrollTo({ left: start * track.clientWidth, behavior: 'instant' });
	});

	function onScroll() {
		if (track) index = Math.round(track.scrollLeft / track.clientWidth);
	}
	function go(i: number) {
		track?.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
	}
</script>

<dialog
	bind:this={dialog}
	class="viewer"
	aria-label="Photos of {name}"
	{onclose}
	onkeydown={(e) => {
		if (e.key === 'ArrowRight') go(Math.min(index + 1, urls.length - 1));
		if (e.key === 'ArrowLeft') go(Math.max(index - 1, 0));
	}}
>
	<div class="top">
		<button class="close" type="button" onclick={() => dialog?.close()} aria-label="Close photos"
			>✕</button
		>
		{#if urls.length > 1}<span aria-live="polite">{index + 1} / {urls.length}</span>{/if}
		<span class="spacer"></span>
	</div>

	<div class="track" bind:this={track} onscroll={onScroll}>
		{#each urls as url, i (i)}
			<div class="slide">
				{#if url}<img src={url} alt="Photo {i + 1} of {name}" />{/if}
			</div>
		{/each}
	</div>

	{#if urls.length > 1}
		<div class="strip">
			{#each urls as url, i (i)}
				<button
					type="button"
					class:on={i === index}
					aria-label="Show photo {i + 1}"
					aria-current={i === index}
					onclick={() => go(i)}
				>
					{#if url}<img src={url} alt="" />{/if}
					{#if i === 0}<span class="cover">Cover</span>{/if}
				</button>
			{/each}
		</div>
	{/if}
</dialog>

<style>
	.viewer {
		width: 100%;
		max-width: 100%;
		height: 100%;
		max-height: 100%;
		margin: 0;
		padding: 0 0 env(safe-area-inset-bottom);
		border: 0;
		background: #0d0b09;
		color: #f5efe0;
	}
	.viewer[open] {
		display: grid;
		grid-template-rows: auto 1fr auto;
	}
	.viewer::backdrop {
		background: #0d0b09;
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-2) var(--space-2);
		font-size: 14px;
	}
	.close,
	.spacer {
		width: var(--tap);
		height: var(--tap);
	}
	.close {
		border: 0;
		background: none;
		color: inherit;
		font-size: 20px;
		cursor: pointer;
	}
	.track {
		display: flex;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scrollbar-width: none;
		min-height: 0;
	}
	.slide {
		flex: none;
		width: 100%;
		height: 100%;
		display: grid;
		place-items: center;
		scroll-snap-align: start;
	}
	.slide img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		display: block;
	}
	.strip {
		display: flex;
		justify-content: center;
		gap: 10px;
		padding: var(--space-4) var(--space-4) var(--space-5);
	}
	.strip button {
		position: relative;
		width: 54px;
		height: 72px;
		padding: 0;
		border: 1px solid #5a5148;
		background: #1f1a14;
		overflow: hidden;
		cursor: pointer;
	}
	.strip button.on {
		border: 2px solid #ffc857;
	}
	.strip img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.cover {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		background: #f5efe0;
		color: #15110d;
		font-family: var(--font-label);
		font-size: 8px;
		font-weight: 600;
		text-transform: uppercase;
		text-align: center;
	}
</style>

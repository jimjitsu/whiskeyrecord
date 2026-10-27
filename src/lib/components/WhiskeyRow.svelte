<script lang="ts">
	import type { Whiskey } from '#lib/db.ts';
	import Stars from './Stars.svelte';

	/**
	 * Compact list row used by search results and My whiskeys. `onvisible` fires
	 * once when the row scrolls into view, so long lists only load the photos
	 * people actually see.
	 */
	let { whiskey, cover, onvisible }: { whiskey: Whiskey; cover?: string; onvisible?: () => void } =
		$props();

	const meta = $derived(
		[whiskey.distillery, whiskey.age, whiskey.proof && `${whiskey.proof} proof`]
			.filter(Boolean)
			.join(' · ')
	);
	const rated = $derived(whiskey.status === 'tasted' && whiskey.rating != null);

	function visible(node: HTMLElement) {
		if (!onvisible) return;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					onvisible?.();
					io.disconnect();
				}
			},
			{ rootMargin: '200px' }
		);
		io.observe(node);
		return { destroy: () => io.disconnect() };
	}
</script>

<a class="wrow {whiskey.status}" href="/record/{whiskey.id}" use:visible>
	<span class="thumb"
		>{#if cover}<img src={cover} alt="" />{/if}</span
	>
	<span class="body">
		<span class="name">{whiskey.name}</span>
		{#if meta}<span class="meta">{meta}</span>{/if}
	</span>
	<span class="end">
		{#if rated}
			<Stars value={whiskey.rating} size={12} />
			<span class="score">{whiskey.rating!.toFixed(1)}</span>
		{:else if whiskey.status === 'want'}
			<span class="tag">Want</span>
		{/if}
	</span>
</a>

<style>
	.wrow {
		display: grid;
		grid-template-columns: 40px 1fr auto;
		gap: var(--space-3);
		align-items: center;
		padding: var(--space-2) var(--space-3) var(--space-2) var(--space-2);
		border: var(--border);
		border-left: 4px solid var(--red);
		background: var(--surface);
		text-decoration: none;
		min-height: 70px;
	}
	.wrow.tasted {
		border-left-color: var(--teal);
	}
	.thumb {
		width: 40px;
		height: 52px;
		border: var(--border);
		background: var(--base);
		overflow: hidden;
	}
	img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.body {
		display: grid;
		min-width: 0;
	}
	.name {
		font-weight: 700;
		font-size: 15px;
		line-height: 20px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta {
		font-size: 12px;
		line-height: 18px;
		color: var(--ink-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.end {
		display: grid;
		justify-items: end;
		gap: 2px;
		font-size: 13px;
	}
	.tag {
		font-family: var(--font-label);
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		padding: 2px 6px;
		border: 1px solid var(--red);
		color: var(--red);
	}
</style>

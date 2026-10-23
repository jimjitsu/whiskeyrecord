<script lang="ts">
	import type { Whiskey } from '#lib/db.ts';
	import Stars from './Stars.svelte';

	let { whiskey, cover }: { whiskey: Whiskey; cover?: string } = $props();
	const meta = $derived(
		[whiskey.distillery, whiskey.age, whiskey.proof && `${whiskey.proof} proof`]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<a class="card {whiskey.status}" href="/record/{whiskey.id}">
	<div class="thumb">
		{#if cover}<img src={cover} alt="" loading="lazy" />{/if}
	</div>
	<div class="body">
		<p class="eyebrow">{whiskey.status === 'tasted' ? 'Tasted' : 'Want to try'}</p>
		<p class="name">{whiskey.name}</p>
		{#if meta}<p class="meta muted">{meta}</p>{/if}
		{#if whiskey.status === 'tasted' && whiskey.rating != null}
			<p class="rating"><Stars value={whiskey.rating} size={14} /> {whiskey.rating.toFixed(1)}</p>
		{/if}
	</div>
</a>

<style>
	.card {
		display: grid;
		grid-template-columns: 64px 1fr;
		gap: var(--space-3);
		padding: var(--space-3);
		border: var(--border);
		border-top: 4px solid var(--red);
		background: var(--surface);
		text-decoration: none;
	}
	.card.tasted {
		border-top-color: var(--teal);
	}
	.thumb {
		width: 64px;
		height: 84px;
		background: var(--base);
		border: var(--border);
		overflow: hidden;
	}
	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.body {
		min-width: 0;
	}
	p {
		margin: 0;
	}
	.name {
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.meta {
		font-size: 14px;
	}
	.rating {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 14px;
		margin-top: var(--space-1);
	}
</style>

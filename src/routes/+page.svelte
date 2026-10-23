<script lang="ts">
	import { liveQuery } from 'dexie';
	import { onDestroy } from 'svelte';
	import { db, type Whiskey } from '#lib/db.ts';
	import { createSearch } from '#lib/search.ts';
	import { createPhotoUrls } from '#lib/photoUrl.svelte.ts';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import WhiskeyCard from '#lib/components/WhiskeyCard.svelte';
	import SyncStatus from '#lib/components/SyncStatus.svelte';

	// Home is the search screen: type to filter, or tap the camera to add.
	let whiskeys = $state<Whiskey[]>([]);
	let query = $state('');
	let loaded = $state(false);

	const sub = liveQuery(() => db.whiskeys.orderBy('updatedAt').reverse().toArray()).subscribe(
		(rows) => {
			whiskeys = rows;
			loaded = true;
		}
	);
	onDestroy(() => sub.unsubscribe());

	const search = $derived(createSearch(whiskeys));
	const results = $derived(search(query));

	const photos = createPhotoUrls();
	$effect(() => {
		photos.load(results.map((w) => w.photoIds[0]).filter(Boolean));
	});
	onDestroy(photos.release);
</script>

<AppHeader>
	{#snippet right()}
		<div class="header-actions">
			<SyncStatus />
			<a class="btn" href="/settings">Settings</a>
		</div>
	{/snippet}
</AppHeader>

<main>
	<h1>Whiskey Record</h1>

	<form class="search" role="search" onsubmit={(e) => e.preventDefault()}>
		<label class="eyebrow" for="q">Have I had this?</label>
		<div class="row">
			<input
				id="q"
				type="search"
				placeholder="Search name or distillery"
				autocomplete="off"
				bind:value={query}
			/>
		</div>
	</form>

	{#if query && results.length === 0}
		<div class="empty">
			<p>No match for "{query}" in your record.</p>
			<a class="btn btn-primary btn-block" href="/record/new?name={encodeURIComponent(query)}"
				>+ Add "{query}"</a
			>
		</div>
	{:else if loaded && whiskeys.length === 0}
		<div class="empty">
			<p class="muted">
				Nothing here yet. Take a photo of a bottle to start your record, or add one by name.
			</p>
			<a class="btn btn-block" href="/record/new">+ Add by name</a>
		</div>
	{:else}
		<p class="eyebrow count">
			{query
				? `${results.length} match${results.length === 1 ? '' : 'es'}`
				: `${whiskeys.length} whiskey${whiskeys.length === 1 ? '' : 's'}`}
		</p>
		<ul>
			{#each results as w (w.id)}
				<li><WhiskeyCard whiskey={w} cover={photos.urls[w.photoIds[0]]} /></li>
			{/each}
		</ul>
	{/if}
</main>

<a class="fab" href="/camera" aria-label="Add a whiskey with the camera">
	<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"
		><path
			d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linejoin="round"
		/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2" /></svg
	>
</a>

<style>
	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	main {
		display: grid;
		gap: var(--space-4);
		padding: 0 var(--gutter) 120px;
	}
	.search {
		display: grid;
		gap: var(--space-2);
	}
	.row input {
		width: 100%;
		min-height: 56px;
		padding: 0 var(--space-4);
		border: var(--border);
		background: var(--surface);
		font-size: 16px;
		border-radius: 0;
	}
	.empty {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border: var(--border);
		border-style: dashed;
	}
	.empty p {
		margin: 0;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-3);
	}
	.fab {
		position: fixed;
		right: max(var(--gutter), calc(50vw - 240px + var(--gutter)));
		bottom: calc(var(--space-5) + env(safe-area-inset-bottom));
		width: 64px;
		height: 64px;
		display: grid;
		place-items: center;
		background: var(--teal);
		color: var(--on-accent);
		border: var(--border);
		border-color: var(--teal);
		box-shadow: 4px 4px 0 var(--ink);
	}
</style>

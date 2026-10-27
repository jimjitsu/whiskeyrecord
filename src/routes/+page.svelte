<script lang="ts">
	import { liveQuery } from 'dexie';
	import { onDestroy } from 'svelte';
	import { db, isRunningLow, type Whiskey } from '#lib/db.ts';
	import { createSearch } from '#lib/search.ts';
	import { createPhotoUrls } from '#lib/photoUrl.svelte.ts';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import WhiskeyRow from '#lib/components/WhiskeyRow.svelte';
	import SyncStatus from '#lib/components/SyncStatus.svelte';
	import { nav } from '#lib/nav.svelte.ts';

	// Home offers two paths: search ("have I had this?") or add a whiskey.
	// The full list lives on /whiskeys.
	let whiskeys = $state<Whiskey[]>([]);
	// Coming back from a record keeps the search that led there.
	let query = $state(nav.query);
	$effect(() => {
		nav.query = query;
	});
	nav.back = '/';
	let loaded = $state(false);
	let input = $state<HTMLInputElement>();

	const sub = liveQuery(() => db.whiskeys.orderBy('updatedAt').reverse().toArray()).subscribe(
		(rows) => {
			whiskeys = rows;
			loaded = true;
		}
	);
	onDestroy(() => sub.unsubscribe());

	const search = $derived(createSearch(whiskeys));
	const searching = $derived(query.trim().length > 0);
	const results = $derived(searching ? search(query) : []);
	const count = $derived(whiskeys.length);
	const low = $derived(whiskeys.filter(isRunningLow).length);
	const plural = (n: number) => `${n} whiskey${n === 1 ? '' : 's'}`;

	const photos = createPhotoUrls();
	onDestroy(photos.release);

	function clear() {
		query = '';
		input?.focus();
	}
</script>

<AppHeader>
	{#snippet right()}
		<div class="header-actions">
			<SyncStatus />
			<a class="btn" href="/settings">Settings</a>
		</div>
	{/snippet}
</AppHeader>

<main class:searching>
	{#if !searching}<h1>Whiskey Record</h1>{/if}

	<form class="search" role="search" onsubmit={(e) => e.preventDefault()}>
		<label class="eyebrow" class:visually-hidden={searching} for="q">Have I had this?</label>
		<div class="field">
			<svg class="icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"
				><circle
					cx="10.5"
					cy="10.5"
					r="6.5"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				/><path
					d="M15.5 15.5 21 21"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				/></svg
			>
			<input
				id="q"
				type="search"
				placeholder="Search name or distillery"
				autocomplete="off"
				enterkeyhint="search"
				bind:this={input}
				bind:value={query}
			/>
			{#if searching}
				<button type="button" class="clear" onclick={clear} aria-label="Clear search">✕</button>
			{/if}
		</div>
		{#if !searching && loaded}
			<p class="hint muted">
				{count
					? `Searches all ${plural(count)}, even offline.`
					: 'Nothing to search yet. Add your first whiskey below.'}
			</p>
		{/if}
	</form>

	{#if searching}
		{#if results.length}
			<p class="eyebrow" aria-live="polite">
				{results.length} match{results.length === 1 ? '' : 'es'}
			</p>
			<ul class="list">
				{#each results as w (w.id)}
					<li>
						<WhiskeyRow
							whiskey={w}
							cover={photos.urls[w.photoIds[0]]}
							onvisible={() => w.photoIds[0] && photos.load([w.photoIds[0]])}
						/>
					</li>
				{/each}
			</ul>
			<a class="btn btn-block not-these" href="/record/new?name={encodeURIComponent(query.trim())}"
				>Not one of these? <strong>+ Add “{query.trim()}”</strong></a
			>
		{:else}
			<div class="none" aria-live="polite">
				<p class="eyebrow">Not in your record</p>
				<p>No match for “{query.trim()}” in your {plural(count)}. Want to add it?</p>
				<a class="btn btn-block btn-teal" href="/camera?name={encodeURIComponent(query.trim())}">
					<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"
						><path
							d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linejoin="round"
						/><circle
							cx="12"
							cy="13"
							r="3.5"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						/></svg
					>
					Take a photo of the label
				</a>
				<a class="btn btn-block" href="/record/new?name={encodeURIComponent(query.trim())}"
					>Add “{query.trim()}” by name</a
				>
			</div>
		{/if}
	{:else}
		<div class="or" aria-hidden="true">
			<span></span><span class="eyebrow">or</span><span></span>
		</div>

		<a class="add" href="/camera">
			<svg viewBox="0 0 24 24" width="48" height="48" aria-hidden="true"
				><path
					d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linejoin="round"
				/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2" /></svg
			>
			<span class="add-title">Add a whiskey</span>
			<span class="add-sub">Photograph the label. AI fills in the rest.</span>
		</a>

		{#if count}
			<a class="browse" href="/whiskeys">
				<strong>My whiskeys</strong>
				<span class="muted"
					>{#if low}<span class="low">{low} low</span>{/if}{count} ›</span
				>
			</a>
		{/if}
	{/if}
</main>

<style>
	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	main {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-2) var(--gutter) var(--space-6);
	}
	.search {
		display: grid;
		gap: var(--space-2);
		margin-top: var(--space-6);
	}
	.searching .search {
		margin-top: 0;
	}
	.field {
		position: relative;
	}
	.icon {
		position: absolute;
		left: var(--space-4);
		top: 50%;
		margin-top: -11px;
		pointer-events: none;
	}
	.field input {
		width: 100%;
		min-height: 64px;
		padding: 0 52px 0 48px;
		border: var(--border);
		background: var(--surface);
		font-size: 17px;
		border-radius: 0;
		-webkit-appearance: none;
		appearance: none;
	}
	.searching .field input {
		min-height: 56px;
		font-size: 16px;
	}
	.field input::-webkit-search-cancel-button {
		display: none;
	}
	.clear {
		position: absolute;
		right: var(--space-1);
		top: 50%;
		transform: translateY(-50%);
		width: var(--tap);
		height: var(--tap);
		border: 0;
		background: none;
		color: var(--ink-muted);
		font-size: 18px;
		cursor: pointer;
	}
	.hint {
		margin: 0;
		font-size: 13px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2);
	}
	.not-these {
		border-style: dashed;
		font-weight: 400;
		font-size: 14px;
	}
	.none {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border: var(--border);
		border-style: dashed;
	}
	.none p {
		margin: 0;
	}
	.btn-teal {
		background: var(--teal);
		border-color: var(--teal);
		color: var(--on-accent);
	}
	.or {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin: var(--space-3) 0;
	}
	.or span:not(.eyebrow) {
		flex: 1;
		border-top: var(--border);
	}
	.add {
		display: grid;
		justify-items: center;
		gap: var(--space-2);
		padding: var(--space-6) var(--space-4);
		background: var(--teal);
		border: var(--border);
		border-color: var(--teal);
		color: var(--on-accent);
		text-decoration: none;
		text-align: center;
		box-shadow: 4px 4px 0 var(--ink);
	}
	.add-title {
		font-family: var(--font-display);
		font-size: 28px;
		line-height: 1.15;
	}
	.add-sub {
		font-size: 13px;
	}
	.browse {
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 56px;
		margin-top: var(--space-5);
		padding: 0 var(--space-4);
		border: var(--border);
		text-decoration: none;
	}
	.browse span {
		font-size: 14px;
	}
	.low {
		margin-right: var(--space-3);
		color: var(--red);
		font-weight: 700;
	}
</style>

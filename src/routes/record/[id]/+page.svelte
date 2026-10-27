<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { liveQuery } from 'dexie';
	import { onDestroy, onMount } from 'svelte';
	import { db, deleteWhiskey, patchWhiskey, type Status, type Whiskey } from '#lib/db.ts';
	import { createPhotoUrls } from '#lib/photoUrl.svelte.ts';
	import { applyUndo, finalizeUndo, takeUndo, type UndoEntry } from '#lib/undo.ts';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import StatusToggle from '#lib/components/StatusToggle.svelte';
	import Stars from '#lib/components/Stars.svelte';
	import RatingInput from '#lib/components/RatingInput.svelte';
	import Toast from '#lib/components/Toast.svelte';
	import { nav } from '#lib/nav.svelte.ts';

	// Saved records open read-only. Status and rating save instantly;
	// everything else goes through Edit → Save.
	const id = page.params.id!;
	let w = $state<Whiskey | undefined>();
	let loaded = $state(false);
	const sub = liveQuery(() => db.whiskeys.get(id)).subscribe((row) => {
		w = row;
		loaded = true;
	});
	onDestroy(() => sub.unsubscribe());

	const photos = createPhotoUrls();
	$effect(() => {
		if (w) photos.load(w.photoIds);
	});
	onDestroy(photos.release);

	let slide = $state(0);
	function onScroll(e: Event & { currentTarget: HTMLElement }) {
		const el = e.currentTarget;
		slide = Math.round(el.scrollLeft / el.clientWidth);
	}

	// "Saved · Undo"
	let undo = $state<UndoEntry | null>(null);
	onMount(() => {
		if (page.url.searchParams.get('saved')) {
			undo = takeUndo();
			history.replaceState(history.state, '', `/record/${id}`);
		}
	});
	async function doUndo() {
		if (!undo) return;
		const entry = undo;
		undo = null;
		const result = await applyUndo(entry);
		if (result === 'deleted') goto('/', { replaceState: true });
	}
	function dismissUndo() {
		if (undo) finalizeUndo(undo);
		undo = null;
	}

	function setStatus(s: Status) {
		patchWhiskey(id, { status: s });
	}

	// Rating popup
	let ratingDialog = $state<HTMLDialogElement>();
	let draftRating = $state<number | null>(null);
	function openRating() {
		draftRating = w?.rating ?? null;
		ratingDialog?.showModal();
	}
	async function saveRating() {
		await patchWhiskey(id, { rating: draftRating });
		ratingDialog?.close();
	}

	async function remove() {
		if (!w || !confirm(`Delete “${w.name}” from your record? This can't be undone.`)) return;
		await deleteWhiskey(id);
		goto('/', { replaceState: true });
	}

	const meta = $derived(
		w ? [w.distillery, w.age, w.proof && `${w.proof} proof`].filter(Boolean).join(' · ') : ''
	);
	const fmt = (iso: string) => new Date(iso).toLocaleDateString();
</script>

<AppHeader>
	{#snippet left()}
		<a class="btn" href={nav.back}>‹ Back</a>
	{/snippet}
	{#snippet right()}
		{#if w}<a class="btn" href="/record/{id}/edit">Edit</a>{/if}
	{/snippet}
</AppHeader>

{#if w}
	{#if w.photoIds.length}
		<div class="gallery-wrap">
			<div class="gallery" onscroll={onScroll} aria-label="Photos">
				{#each w.photoIds as pid (pid)}
					<div class="slide">
						{#if photos.urls[pid]}<img src={photos.urls[pid]} alt="Bottle of {w.name}" />{/if}
					</div>
				{/each}
			</div>
			{#if w.photoIds.length > 1}<span class="count">{slide + 1} / {w.photoIds.length}</span>{/if}
		</div>
	{/if}

	<main>
		<div class="heading">
			<h1>{w.name}</h1>
			{#if meta}<p class="muted">{meta}</p>{/if}
			{#if w.type}<span class="chip">{w.type}</span>{/if}
		</div>

		<div class="block">
			<span class="eyebrow">Status</span>
			<StatusToggle value={w.status} onchange={setStatus} />
		</div>

		{#if w.status === 'tasted'}
			<div class="block">
				<span class="eyebrow">Rating</span>
				<button class="rating" type="button" onclick={openRating}>
					{#if w.rating != null}
						<strong>{w.rating.toFixed(1)}</strong>
					{/if}
					<Stars value={w.rating} size={28} />
					{#if w.rating == null}<span class="muted">Tap to rate</span>{/if}
				</button>
			</div>

			<div class="block">
				<span class="eyebrow">Tasting notes</span>
				{#if w.notes}
					<p class="notes">{w.notes}</p>
				{:else}
					<a href="/record/{id}/edit" class="muted">Add tasting notes</a>
				{/if}
			</div>
		{/if}

		<details class="more">
			<summary>More info</summary>
			<dl>
				<dt class="eyebrow">Type</dt>
				<dd>{w.type || '—'}</dd>
				<dt class="eyebrow">Price paid</dt>
				<dd>{w.pricePaid || '—'}</dd>
				<dt class="eyebrow">Tags</dt>
				<dd>{w.tags.length ? w.tags.join(', ') : '—'}</dd>
				<dt class="eyebrow">Added</dt>
				<dd>{fmt(w.createdAt)}</dd>
				<dt class="eyebrow">Updated</dt>
				<dd>{fmt(w.updatedAt)}</dd>
			</dl>
			<button class="btn btn-block delete" type="button" onclick={remove}>Delete record</button>
		</details>
	</main>

	<dialog bind:this={ratingDialog} class="sheet" aria-label="Rate {w.name}">
		<form
			method="dialog"
			onsubmit={(e) => {
				e.preventDefault();
				saveRating();
			}}
		>
			<p class="eyebrow">Rating</p>
			<RatingInput bind:value={draftRating} />
			<div class="sheet-actions">
				<button class="btn" type="button" onclick={() => ratingDialog?.close()}>Cancel</button>
				<button class="btn btn-primary" type="submit">Save</button>
			</div>
		</form>
	</dialog>
{:else if loaded}
	<main><p>That record wasn't found. <a href="/">Back to search</a></p></main>
{/if}

{#if undo}
	<Toast
		message={undo.previous ? 'Saved' : 'Added to your record'}
		actionLabel="Undo"
		onaction={doUndo}
		ondismiss={dismissUndo}
	/>
{/if}

<style>
	.gallery-wrap {
		position: relative;
	}
	.gallery {
		display: flex;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scrollbar-width: none;
		border-block: var(--border);
		background: var(--surface);
	}
	.slide {
		flex: none;
		width: 100%;
		aspect-ratio: 4 / 3;
		scroll-snap-align: start;
	}
	.slide img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.count {
		position: absolute;
		right: var(--gutter);
		bottom: var(--space-3);
		padding: 2px 8px;
		background: var(--ink);
		color: var(--base);
		font-size: 12px;
	}
	main {
		display: grid;
		gap: var(--space-5);
		padding: var(--space-4) var(--gutter) 120px;
	}
	.heading {
		display: grid;
		gap: var(--space-2);
		justify-items: start;
	}
	.heading p {
		margin: 0;
	}
	.chip {
		padding: 2px 10px;
		border: var(--border);
		background: var(--amber);
		color: #1a1a1a;
		font-size: 12px;
	}
	.block {
		display: grid;
		gap: var(--space-2);
	}
	.rating {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--tap);
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
		text-align: left;
	}
	.rating strong {
		font-size: 28px;
	}
	.notes {
		margin: 0;
		white-space: pre-wrap;
	}
	.more {
		border: var(--border);
		background: var(--surface);
	}
	.more summary {
		min-height: var(--tap);
		display: flex;
		align-items: center;
		padding: 0 var(--space-3);
		font-weight: 700;
		cursor: pointer;
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-2) var(--space-4);
		margin: 0;
		padding: 0 var(--space-3) var(--space-4);
		align-items: baseline;
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.delete {
		width: calc(100% - 2 * var(--space-3));
		margin: 0 var(--space-3) var(--space-3);
		color: var(--red);
		border-color: var(--red);
	}
	.sheet {
		width: min(100%, 480px);
		max-width: 100%;
		margin: auto auto 0;
		padding: var(--space-5) var(--gutter) calc(var(--space-5) + env(safe-area-inset-bottom));
		border: 0;
		border-top: var(--border);
		background: var(--base);
		color: var(--ink);
	}
	.sheet::backdrop {
		background: rgb(0 0 0 / 0.5);
	}
	.sheet form {
		display: grid;
		gap: var(--space-4);
	}
	.sheet-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
	}
</style>

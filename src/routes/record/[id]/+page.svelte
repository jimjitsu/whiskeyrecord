<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { liveQuery } from 'dexie';
	import { onDestroy, onMount } from 'svelte';
	import {
		db,
		deleteWhiskey,
		isRunningLow,
		patchWhiskey,
		type BottleState,
		type Status,
		type Whiskey
	} from '#lib/db.ts';
	import { createPhotoUrls } from '#lib/photoUrl.svelte.ts';
	import { applyUndo, finalizeUndo, takeUndo, type UndoEntry } from '#lib/undo.ts';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import StatusToggle from '#lib/components/StatusToggle.svelte';
	import Stars from '#lib/components/Stars.svelte';
	import RatingInput from '#lib/components/RatingInput.svelte';
	import Toast from '#lib/components/Toast.svelte';
	import BottleControl from '#lib/components/BottleControl.svelte';
	import PhotoViewer from '#lib/components/PhotoViewer.svelte';
	import { nav } from '#lib/nav.svelte.ts';
	import { signIn } from '#lib/google/auth.svelte.ts';

	// Saved records open read-only. Status, rating and your bottle save
	// instantly; everything else goes through Edit → Save.
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

	let viewing = $state(false);

	// Photos from another device download from Drive; after the hourly
	// sign-in expires they can't, so offer the same one-tap sign-in as sync.
	async function signInForPhotos() {
		try {
			await signIn('');
			await photos.retry();
		} catch {
			/* popup closed: leave the button */
		}
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
	// Leaving before the toast times out still has to clean up dropped photos.
	onDestroy(() => {
		if (undo) finalizeUndo(undo);
	});
	function dismissUndo() {
		if (undo) finalizeUndo(undo);
		undo = null;
	}

	function setStatus(s: Status) {
		patchWhiskey(id, { status: s });
	}
	function setBottle(bottle: BottleState, level: number | null) {
		patchWhiskey(id, { bottle, level });
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

	const facts = $derived(
		w ? [w.age, w.proof && `${w.proof} proof`].filter(Boolean).join(' · ') : ''
	);
	const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
	const fmt = (iso: string) => {
		// Plain dates (YYYY-MM-DD) are read as local days, not UTC midnight.
		const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00` : iso);
		return isNaN(d.getTime()) ? iso : day.format(d);
	};
	const money = (v: string) => (v && /^\d/.test(v) ? `$${v}` : v);

	// Each section lists only what's filled in, and hides when there's nothing.
	type Row = [label: string, value: string];
	const keep = (rows: Row[]) => rows.filter(([, v]) => v);
	const whenWhere = $derived(
		w
			? keep([
					['Tasted on', w.tastedOn && fmt(w.tastedOn)],
					['Where', w.whereTasted]
				])
			: []
	);
	const bottleRows = $derived(
		w
			? keep([
					['Cask / finish', w.cask],
					['Mash bill', w.mashBill],
					['Batch', w.batch],
					['Bottle size', w.bottleSize],
					['Released', w.released],
					['Region', w.region]
				])
			: []
	);
	const owned = $derived(!!w && ['unopened', 'open', 'finished'].includes(w.bottle));
	const buyingRows = $derived(
		w
			? keep([
					[owned || w.status === 'tasted' ? 'Bought at' : 'Seen at', w.boughtAt],
					['Paid', money(w.pricePaid)],
					['Retail', money(w.retail)],
					['Buy again?', w.buyAgain === 'yes' ? 'Yes' : w.buyAgain === 'no' ? 'No' : '']
				])
			: []
	);
	// Nothing beyond the basics yet: one prompt to add the rest.
	const sparse = $derived(!!w && !bottleRows.length && !whenWhere.length);
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
	<main>
		<div class="top">
			<div class="info">
				{#if w.type}<span class="chip">{w.type}</span>{/if}
				<h1>{w.name}</h1>
				{#if w.distillery || facts}
					<p class="meta muted">
						{#if w.distillery}{w.distillery}<br />{/if}{facts}
					</p>
				{/if}
				{#if w.status === 'tasted'}
					<button class="rating" type="button" onclick={openRating} aria-label="Change rating">
						<Stars value={w.rating} size={18} />
						{#if w.rating != null}<strong>{w.rating.toFixed(1)}</strong>{:else}<span class="muted"
								>Tap to rate</span
							>{/if}
					</button>
				{/if}
			</div>
			{#if w.photoIds.length && !photos.urls[w.photoIds[0]] && photos.needsSignIn}
				<button class="thumb empty" type="button" onclick={signInForPhotos}>
					Sign in to load photo
				</button>
			{:else if w.photoIds.length}
				<button
					class="thumb"
					type="button"
					onclick={() => (viewing = true)}
					aria-label="Open photos ({w.photoIds.length})"
				>
					{#if photos.urls[w.photoIds[0]]}<img
							src={photos.urls[w.photoIds[0]]}
							alt="Bottle of {w.name}"
						/>{/if}
					<span class="badge" aria-hidden="true">
						<svg viewBox="0 0 24 24" width="12" height="12"
							><path
								d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							/></svg
						>{#if w.photoIds.length > 1}1/{w.photoIds.length}{/if}
					</span>
				</button>
			{:else}
				<a class="thumb empty" href="/record/{id}/edit">+ Photo</a>
			{/if}
		</div>

		<StatusToggle value={w.status} onchange={setStatus} />

		<div class="block">
			<p class="eyebrow split">
				<span>Your bottle</span>
				{#if isRunningLow(w)}<span class="low">Running low</span>{/if}
			</p>
			<BottleControl bottle={w.bottle} level={w.level} onchange={setBottle} />
		</div>

		{#if w.status === 'tasted'}
			<section>
				<h2 class="eyebrow">Tasting</h2>
				{#if w.notes}
					<p class="notes">{w.notes}</p>
				{:else}
					<a href="/record/{id}/edit" class="muted">Add tasting notes</a>
				{/if}
				{#if whenWhere.length}{@render list(whenWhere)}{/if}
			</section>
		{:else}
			<p class="muted small">Rating and tasting notes appear once you mark it tasted.</p>
			{#if whenWhere.length}<section>
					<h2 class="eyebrow">When &amp; where</h2>
					{@render list(whenWhere)}
				</section>{/if}
		{/if}

		{#if bottleRows.length}
			<section>
				<h2 class="eyebrow">Bottle</h2>
				{@render list(bottleRows)}
			</section>
		{/if}

		{#if buyingRows.length}
			<section>
				<h2 class="eyebrow">Buying</h2>
				{@render list(buyingRows)}
			</section>
		{/if}

		{#if w.tags.length}
			<section>
				<h2 class="eyebrow">Tags</h2>
				<p class="tags">
					{#each w.tags as t (t)}<span>{t}</span>{/each}
				</p>
			</section>
		{/if}

		{#if sparse}
			<a class="add-more" href="/record/{id}/edit"
				><span>Add bottle details and more</span><strong>Edit ›</strong></a
			>
		{/if}

		<p class="foot muted">
			Added {fmt(w.createdAt)}{#if w.updatedAt.slice(0, 10) !== w.createdAt.slice(0, 10)}
				· Updated {fmt(w.updatedAt)}{/if}
		</p>
		<button class="btn btn-block delete" type="button" onclick={remove}>Delete record</button>
	</main>

	{#if viewing}
		<PhotoViewer
			urls={w.photoIds.map((pid) => photos.urls[pid])}
			name={w.name}
			onclose={() => (viewing = false)}
		/>
	{/if}

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
	<main><p>That record wasn't found. <a href="/">Back to home</a></p></main>
{/if}

{#if undo}
	<Toast
		message={undo.previous ? 'Saved' : 'Added to your record'}
		actionLabel="Undo"
		onaction={doUndo}
		ondismiss={dismissUndo}
	/>
{/if}

{#snippet list(rows: Row[])}
	<dl>
		{#each rows as [label, value] (label)}<dt>{label}</dt>
			<dd>{value}</dd>{/each}
	</dl>
{/snippet}

<style>
	main {
		display: grid;
		gap: var(--space-5);
		padding: var(--space-2) var(--gutter) var(--space-6);
	}
	.top {
		display: grid;
		grid-template-columns: 1fr 128px;
		gap: var(--space-4);
		align-items: start;
	}
	.info {
		display: grid;
		gap: 6px;
		justify-items: start;
		min-width: 0;
	}
	h1 {
		font-size: 26px;
		overflow-wrap: anywhere;
	}
	.meta {
		margin: 0;
		font-size: 14px;
		line-height: 20px;
	}
	.chip {
		padding: 2px 10px;
		border: var(--border);
		background: var(--amber);
		color: #1a1a1a;
		font-size: 12px;
	}
	.rating {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 40px;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}
	.rating strong {
		font-size: 22px;
	}
	.thumb {
		position: relative;
		display: grid;
		place-items: center;
		width: 128px;
		aspect-ratio: 3 / 4;
		padding: 0;
		border: var(--border);
		background: var(--surface);
		overflow: hidden;
		cursor: pointer;
		text-decoration: none;
		font-size: 14px;
	}
	.thumb.empty {
		border-style: dashed;
		padding: var(--space-2);
		text-align: center;
	}
	.thumb img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.badge {
		position: absolute;
		right: 6px;
		bottom: 6px;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 3px 7px;
		background: var(--ink);
		color: var(--base);
		font-size: 12px;
		line-height: 16px;
	}
	.block {
		display: grid;
		gap: var(--space-2);
	}
	.split {
		display: flex;
		justify-content: space-between;
	}
	.low {
		color: var(--red);
	}
	section {
		display: grid;
		gap: 10px;
		padding-top: var(--space-4);
		border-top: var(--border);
	}
	h2 {
		margin: 0;
		font-family: var(--font-label);
		font-size: 12px;
	}
	.notes {
		margin: 0;
		font-size: 15px;
		white-space: pre-wrap;
	}
	.small {
		margin: 0;
		font-size: 14px;
	}
	dl {
		display: grid;
		grid-template-columns: 116px 1fr;
		gap: var(--space-2) var(--space-3);
		margin: 0;
		font-size: 14px;
		line-height: 20px;
	}
	dt {
		color: var(--ink-muted);
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
	}
	.tags span {
		padding: 2px 10px;
		border: var(--border);
		font-size: 12px;
	}
	.add-more {
		display: flex;
		justify-content: space-between;
		padding: var(--space-3);
		border: var(--border);
		border-style: dashed;
		font-size: 14px;
		text-decoration: none;
	}
	.foot {
		margin: 0;
		font-size: 12px;
	}
	.delete {
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

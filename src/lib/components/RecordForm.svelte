<script lang="ts">
	import { goto } from '$app/navigation';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { addPhotos, db, saveWhiskey, usedTypes, type Whiskey } from '#lib/db.ts';
	import { findLikelyDuplicates } from '#lib/search.ts';
	import { resizeImage } from '#lib/images.ts';
	import { createPhotoUrls } from '#lib/photoUrl.svelte.ts';
	import { setUndo } from '#lib/undo.ts';
	import AppHeader from './AppHeader.svelte';
	import StatusToggle from './StatusToggle.svelte';
	import RatingInput from './RatingInput.svelte';

	let {
		initial,
		isNew,
		previous = null,
		draftKey
	}: {
		initial: Whiskey;
		isNew: boolean;
		/** The saved version before this edit, for Undo. Null for new records. */
		previous?: Whiskey | null;
		draftKey: string;
	} = $props();

	// Draft autosave: every change is kept on the phone until Save or Cancel.
	// The form edits a copy; later changes to `initial` are intentionally ignored.
	let w = $state<Whiskey>(untrack(() => structuredClone($state.snapshot(initial))));
	let tagsText = $state(untrack(() => initial.tags.join(', ')));
	let restored = $state(false);
	let types = $state<string[]>([]);
	let others = $state<Whiskey[]>([]);
	const addedPhotoIds: string[] = [];

	onMount(async () => {
		try {
			const raw = localStorage.getItem(draftKey);
			if (raw) {
				const d = JSON.parse(raw) as { w: Whiskey; tagsText: string };
				if (d.w?.id === w.id) {
					w = d.w;
					tagsText = d.tagsText;
					restored = true;
				}
			}
		} catch {
			/* storage unavailable: carry on without a draft */
		}
		types = await usedTypes();
		others = await db.whiskeys.toArray();
	});

	$effect(() => {
		const snapshot = JSON.stringify({ w: $state.snapshot(w), tagsText });
		try {
			localStorage.setItem(draftKey, snapshot);
		} catch {
			/* ignore */
		}
	});

	function clearDraft() {
		try {
			localStorage.removeItem(draftKey);
		} catch {
			/* ignore */
		}
	}

	const duplicates = $derived(isNew ? findLikelyDuplicates(others, w.name, w.id) : []);

	// Photos
	const photos = createPhotoUrls();
	$effect(() => {
		photos.load(w.photoIds);
	});
	onDestroy(photos.release);

	async function addMore(e: Event & { currentTarget: HTMLInputElement }) {
		const files = [...(e.currentTarget.files ?? [])];
		e.currentTarget.value = '';
		const blobs = await Promise.all(files.map((f) => resizeImage(f)));
		const ids = await addPhotos(blobs);
		addedPhotoIds.push(...ids);
		w.photoIds.push(...ids);
	}

	function makeCover(i: number) {
		const [id] = w.photoIds.splice(i, 1);
		w.photoIds.unshift(id);
	}

	function removePhoto(i: number) {
		w.photoIds.splice(i, 1);
	}

	let saving = $state(false);
	const canSave = $derived(w.name.trim().length > 0 && !saving);

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!canSave) return;
		saving = true;
		const record: Whiskey = {
			...$state.snapshot(w),
			name: w.name.trim(),
			type: w.type.trim(),
			tags: tagsText
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean)
		};
		// Photos removed during this edit are deleted once the save succeeds.
		const before = previous?.photoIds ?? [];
		const dropped = [...before, ...addedPhotoIds].filter((id) => !record.photoIds.includes(id));
		await saveWhiskey(record);
		setUndo({ id: record.id, previous, droppedPhotoIds: dropped });
		clearDraft();
		goto(`/record/${record.id}?saved=1`, { replaceState: true });
	}

	async function cancel() {
		clearDraft();
		if (addedPhotoIds.length) await db.photos.bulkDelete(addedPhotoIds);
		goto(isNew ? '/' : `/record/${w.id}`, { replaceState: true });
	}
</script>

<AppHeader>
	{#snippet left()}
		<button type="button" class="btn" onclick={cancel}>Cancel</button>
	{/snippet}
	{#snippet right()}
		<span class="eyebrow">{isNew ? 'New record' : 'Editing'}</span>
	{/snippet}
</AppHeader>

<form class="form" onsubmit={save}>
	{#if restored}
		<p class="notice">Restored your unsaved changes.</p>
	{/if}

	<section class="photos" aria-label="Photos">
		{#each w.photoIds as id, i (id)}
			<div class="photo" class:cover={i === 0}>
				<button
					type="button"
					class="pick"
					onclick={() => makeCover(i)}
					aria-label={i === 0 ? 'Cover photo' : `Make photo ${i + 1} the cover`}
				>
					{#if photos.urls[id]}<img src={photos.urls[id]} alt="" />{/if}
					{#if i === 0}<span class="badge">Cover</span>{/if}
				</button>
				<button
					type="button"
					class="remove"
					onclick={() => removePhoto(i)}
					aria-label="Remove photo {i + 1}">✕</button
				>
			</div>
		{/each}
		<label class="photo add">
			<span aria-hidden="true">+</span>
			<span class="visually-hidden">Add photos</span>
			<input class="visually-hidden" type="file" accept="image/*" multiple onchange={addMore} />
		</label>
	</section>

	<div class="field">
		<label class="eyebrow" for="name">Name</label>
		<input
			id="name"
			required
			autocomplete="off"
			bind:value={w.name}
			placeholder="e.g. Eagle Rare 10 Year"
		/>
	</div>

	{#if duplicates.length}
		<div class="dupes" role="status">
			<p class="eyebrow">Already in your record?</p>
			{#each duplicates as d (d.id)}
				<a class="btn btn-block" href="/record/{d.id}" onclick={clearDraft}>Open “{d.name}”</a>
			{/each}
		</div>
	{/if}

	<div class="field">
		<label class="eyebrow" for="distillery">Distillery</label>
		<input id="distillery" autocomplete="off" bind:value={w.distillery} />
	</div>

	<div class="field">
		<label class="eyebrow" for="type">Type</label>
		<input
			id="type"
			list="type-options"
			autocomplete="off"
			bind:value={w.type}
			placeholder="Bourbon, rye, scotch…"
		/>
		<datalist id="type-options">
			{#each types as t (t)}<option value={t}></option>{/each}
		</datalist>
	</div>

	<div class="pair">
		<div class="field">
			<label class="eyebrow" for="age">Age</label>
			<input id="age" autocomplete="off" bind:value={w.age} placeholder="10 yr" />
		</div>
		<div class="field">
			<label class="eyebrow" for="proof">Proof</label>
			<input
				id="proof"
				inputmode="decimal"
				autocomplete="off"
				bind:value={w.proof}
				placeholder="90"
			/>
		</div>
	</div>

	<div class="field">
		<span class="eyebrow">Status</span>
		<StatusToggle bind:value={w.status} />
	</div>

	{#if w.status === 'tasted'}
		<div class="field">
			<span class="eyebrow">Rating</span>
			<RatingInput bind:value={w.rating} />
		</div>
		<div class="field">
			<label class="eyebrow" for="notes">Tasting notes</label>
			<textarea
				id="notes"
				bind:value={w.notes}
				placeholder="Tip: use your keyboard's mic to dictate."></textarea>
		</div>
	{/if}

	<details class="more">
		<summary>More info</summary>
		<div class="more-body">
			<div class="field">
				<label class="eyebrow" for="price">Price paid</label>
				<input
					id="price"
					inputmode="decimal"
					autocomplete="off"
					bind:value={w.pricePaid}
					placeholder="39.99"
				/>
			</div>
			<div class="field">
				<label class="eyebrow" for="tags">Tags</label>
				<input id="tags" autocomplete="off" bind:value={tagsText} placeholder="gift, bar pour" />
			</div>
		</div>
	</details>

	<div class="savebar">
		<button class="btn btn-primary btn-block" type="submit" disabled={!canSave}>Save</button>
		<p class="muted">Draft autosaved on this phone</p>
	</div>
</form>

<style>
	.form {
		display: grid;
		gap: var(--space-5);
		padding: 0 var(--gutter) 140px;
	}
	.notice {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-left: 4px solid var(--amber);
		background: var(--surface);
		font-size: 14px;
	}
	.photos {
		display: flex;
		gap: var(--space-2);
		overflow-x: auto;
		padding-bottom: var(--space-1);
	}
	.photo {
		position: relative;
		flex: none;
		width: 72px;
		height: 96px;
		border: var(--border);
		background: var(--surface);
	}
	.photo.cover {
		border: 2px solid var(--amber);
	}
	.pick {
		display: block;
		width: 100%;
		height: 100%;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}
	.pick img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.badge {
		position: absolute;
		left: 4px;
		top: 4px;
		padding: 0 4px;
		background: var(--ink);
		color: var(--base);
		font-family: var(--font-label);
		font-size: 9px;
		text-transform: uppercase;
	}
	.remove {
		position: absolute;
		right: -1px;
		top: -1px;
		width: 28px;
		height: 28px;
		border: var(--border);
		background: var(--base);
		cursor: pointer;
		font-size: 12px;
	}
	.add {
		display: grid;
		place-items: center;
		border-style: dashed;
		font-size: 28px;
		cursor: pointer;
	}
	.dupes {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3);
		border: 1px dashed var(--pink);
		background: var(--surface);
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
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
	.more-body {
		display: grid;
		gap: var(--space-4);
		padding: 0 var(--space-3) var(--space-4);
	}
	.more .field input {
		background: var(--base);
	}
	.savebar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		max-width: 480px;
		margin: 0 auto;
		padding: var(--space-3) var(--gutter) calc(var(--space-2) + env(safe-area-inset-bottom));
		background: var(--base);
		border-top: var(--border);
		text-align: center;
	}
	.savebar p {
		margin: var(--space-1) 0 0;
		font-size: 12px;
	}
</style>

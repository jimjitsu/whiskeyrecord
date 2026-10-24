<script lang="ts">
	import { goto } from '$app/navigation';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { addPhotos, db, saveWhiskey, usedTypes, type Whiskey } from '#lib/db.ts';
	import { findLikelyDuplicates } from '#lib/search.ts';
	import { resizeImage } from '#lib/images.ts';
	import { createPhotoUrls } from '#lib/photoUrl.svelte.ts';
	import { setUndo } from '#lib/undo.ts';
	import { AiError, ai, aiReady, readLabel, type LabelReading } from '#lib/ai/openrouter.svelte.ts';
	import AppHeader from './AppHeader.svelte';
	import StatusToggle from './StatusToggle.svelte';
	import RatingInput from './RatingInput.svelte';

	let {
		initial,
		isNew,
		previous = null,
		draftKey,
		autoRead = false
	}: {
		initial: Whiskey;
		isNew: boolean;
		/** The saved version before this edit, for Undo. Null for new records. */
		previous?: Whiskey | null;
		draftKey: string;
		/** Read the label with AI as soon as the form opens (photos just taken). */
		autoRead?: boolean;
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
		if (untrack(() => autoRead) && !restored && w.photoIds.length && aiReady()) runRead();
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

	// --- AI label reading -------------------------------------------------
	type AiField = 'name' | 'distillery' | 'type' | 'age' | 'proof';
	const AI_FIELDS: { key: AiField; label: string }[] = [
		{ key: 'name', label: 'Name' },
		{ key: 'distillery', label: 'Distillery' },
		{ key: 'type', label: 'Type' },
		{ key: 'age', label: 'Age' },
		{ key: 'proof', label: 'Proof' }
	];
	let reading = $state(false);
	let readError = $state('');
	let readNote = $state('');
	/** Fields the AI filled in, shown with a "Filled by AI" note until edited. */
	let aiFilled = $state<Partial<Record<AiField, boolean>>>({});
	/** Fields where the AI read something different from what's already there. */
	let conflicts = $state<{ key: AiField; label: string; ai: string; current: string }[]>([]);
	let readController: AbortController | null = null;

	const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');

	async function photoBlobs(): Promise<Blob[]> {
		const rows = await db.photos.bulkGet(w.photoIds.slice(0, 2));
		return rows.flatMap((r) => (r?.blob ? [r.blob] : []));
	}

	async function runRead() {
		readError = '';
		readNote = '';
		const blobs = await photoBlobs();
		if (!blobs.length) {
			readError = 'Add a photo of the label first.';
			return;
		}
		reading = true;
		readController = new AbortController();
		const timeout = setTimeout(() => readController?.abort(), 45_000);
		try {
			applyReading(await readLabel(blobs, readController.signal));
		} catch (e) {
			if ((e as Error).name === 'AbortError') {
				if (reading) readError = 'The AI took too long. Fill it in yourself, or try again.';
			} else {
				readError =
					e instanceof AiError || e instanceof Error ? e.message : 'Label reading failed.';
			}
		} finally {
			clearTimeout(timeout);
			reading = false;
			readController = null;
		}
	}

	function skipRead() {
		reading = false;
		readController?.abort();
	}

	function applyReading(r: LabelReading) {
		let filled = 0;
		const next: typeof conflicts = [];
		for (const { key, label } of AI_FIELDS) {
			const value = r[key];
			if (!value) continue;
			const current = w[key].trim();
			if (!current) {
				w[key] = value;
				aiFilled[key] = true;
				filled++;
			} else if (norm(current) !== norm(value)) {
				next.push({ key, label, ai: value, current });
			}
		}
		conflicts = next;
		readNote =
			filled || next.length
				? `Read by ${r.model.replace(/:free$/, '')}. Check what it filled in.`
				: "The AI couldn't read anything new from this photo.";
	}

	function pick(key: AiField, value: string, fromAi: boolean) {
		w[key] = value;
		aiFilled[key] = fromAi;
		conflicts = conflicts.filter((c) => c.key !== key);
	}

	function edited(key: AiField) {
		aiFilled[key] = false;
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

	{#if w.photoIds.length}
		{#if ai.key}
			<button class="btn btn-block" type="button" onclick={runRead} disabled={reading}>
				✦ Read label with AI
			</button>
		{:else}
			<p class="muted small">
				Want the app to fill this in from the photo?
				<a href="/settings">Turn on AI label reading</a>
			</p>
		{/if}
	{/if}
	{#if readError}<p class="warn" role="alert">{readError}</p>{/if}
	{#if readNote}<p class="ai-note" role="status">{readNote}</p>{/if}

	{#each conflicts as c (c.key)}
		<div class="conflict" role="group" aria-label="{c.label}: pick one">
			<p class="eyebrow">{c.label}: pick one</p>
			<button type="button" class="btn btn-block choice" onclick={() => pick(c.key, c.ai, true)}>
				<span>{c.ai}</span><span class="tag ai">AI</span>
			</button>
			<button
				type="button"
				class="btn btn-block choice"
				onclick={() => pick(c.key, c.current, false)}
			>
				<span>{c.current}</span><span class="tag">Yours</span>
			</button>
		</div>
	{/each}

	<div class="field">
		<label class="eyebrow" for="name"
			>Name {#if aiFilled.name}<span class="filled">Filled by AI · check it</span>{/if}</label
		>
		<input
			id="name"
			required
			autocomplete="off"
			class:ai={aiFilled.name}
			oninput={() => edited('name')}
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
		<label class="eyebrow" for="distillery"
			>Distillery {#if aiFilled.distillery}<span class="filled">Filled by AI · check it</span
				>{/if}</label
		>
		<input
			id="distillery"
			autocomplete="off"
			class:ai={aiFilled.distillery}
			oninput={() => edited('distillery')}
			bind:value={w.distillery}
		/>
	</div>

	<div class="field">
		<label class="eyebrow" for="type"
			>Type {#if aiFilled.type}<span class="filled">Filled by AI · check it</span>{/if}</label
		>
		<input
			id="type"
			list="type-options"
			autocomplete="off"
			class:ai={aiFilled.type}
			oninput={() => edited('type')}
			bind:value={w.type}
			placeholder="Bourbon, rye, scotch…"
		/>
		<datalist id="type-options">
			{#each types as t (t)}<option value={t}></option>{/each}
		</datalist>
	</div>

	<div class="pair">
		<div class="field">
			<label class="eyebrow" for="age"
				>Age {#if aiFilled.age}<span class="filled">Filled by AI · check it</span>{/if}</label
			>
			<input
				id="age"
				autocomplete="off"
				class:ai={aiFilled.age}
				oninput={() => edited('age')}
				bind:value={w.age}
				placeholder="10 yr"
			/>
		</div>
		<div class="field">
			<label class="eyebrow" for="proof"
				>Proof {#if aiFilled.proof}<span class="filled">Filled by AI · check it</span>{/if}</label
			>
			<input
				id="proof"
				inputmode="decimal"
				autocomplete="off"
				class:ai={aiFilled.proof}
				oninput={() => edited('proof')}
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

	{#if reading}
		<div class="reading" role="dialog" aria-modal="true" aria-label="Reading the label">
			<div class="reading-cover">
				{#if photos.urls[w.photoIds[0]]}<img src={photos.urls[w.photoIds[0]]} alt="" />{/if}
			</div>
			<h2>Reading the label…</h2>
			<div class="bar" aria-hidden="true"><span></span></div>
			<button class="btn btn-block" type="button" onclick={skipRead}>Skip and type it myself</button
			>
			<p class="muted small">Usually a few seconds.</p>
		</div>
	{/if}

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
		bottom: 4px;
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
	.small {
		font-size: 14px;
		margin: 0;
	}
	.warn {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-left: 4px solid var(--red);
		background: var(--surface);
		font-size: 14px;
	}
	.ai-note {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-left: 4px solid var(--pink);
		background: var(--surface);
		font-size: 14px;
	}
	.filled {
		margin-left: var(--space-2);
		color: var(--pink);
		text-transform: none;
		letter-spacing: 0;
		font-family: var(--font-body);
		font-weight: 400;
	}
	input.ai {
		border-color: var(--pink);
		box-shadow: inset 4px 0 0 var(--pink);
	}
	.conflict {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3);
		border: 1px dashed var(--pink);
		background: var(--surface);
	}
	.conflict .eyebrow {
		margin: 0;
	}
	.choice {
		justify-content: space-between;
		font-weight: 400;
		background: var(--base);
		text-align: left;
	}
	.tag {
		flex: none;
		padding: 0 6px;
		border: var(--border);
		font-size: 11px;
		font-family: var(--font-label);
		text-transform: uppercase;
	}
	.tag.ai {
		background: var(--pink);
		border-color: var(--pink);
		color: #1a1a1a;
	}
	.reading {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: grid;
		align-content: center;
		justify-items: center;
		gap: var(--space-4);
		padding: var(--space-5) var(--gutter);
		background: var(--base);
		text-align: center;
	}
	.reading > * {
		width: min(100%, 360px);
	}
	.reading-cover {
		width: 150px;
		height: 200px;
		border: var(--border);
		background: var(--surface);
		overflow: hidden;
	}
	.reading-cover img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.bar {
		height: 6px;
		background: var(--surface);
		overflow: hidden;
	}
	.bar span {
		display: block;
		width: 40%;
		height: 100%;
		background: var(--amber);
		animation: slide 1.2s ease-in-out infinite;
	}
	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(250%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.bar span {
			animation: none;
			width: 100%;
			opacity: 0.6;
		}
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

<script lang="ts">
	import { liveQuery } from 'dexie';
	import { onDestroy } from 'svelte';
	import { db, isRunningLow, type Whiskey } from '#lib/db.ts';
	import { createPhotoUrls } from '#lib/photoUrl.svelte.ts';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import WhiskeyRow from '#lib/components/WhiskeyRow.svelte';
	import SyncStatus from '#lib/components/SyncStatus.svelte';
	import { nav } from '#lib/nav.svelte.ts';

	// The full list: filter by status (or what's on your shelf), sort, newest grouped by month.
	// Filter and sort are remembered for the session, so coming back from a record keeps them.
	type Show = 'all' | 'tasted' | 'want' | 'shelf';
	type Sort = 'newest' | 'rating' | 'az' | 'level';
	const SORTS: { value: Sort; label: string }[] = [
		{ value: 'newest', label: 'Newest' },
		{ value: 'rating', label: 'Rating' },
		{ value: 'az', label: 'A–Z' },
		{ value: 'level', label: 'Level' }
	];
	const onShelf = (w: Whiskey) => w.bottle === 'unopened' || w.bottle === 'open';
	// Unopened counts as full; an open bottle with no level set as half.
	const fill = (w: Whiskey) => (w.bottle === 'unopened' ? 1 : (w.level ?? 0.5));

	function setShow(value: Show) {
		nav.show = value;
		if (value === 'shelf') nav.sort = 'level';
		else if (nav.sort === 'level') nav.sort = 'newest';
	}

	let whiskeys = $state<Whiskey[]>([]);
	let loaded = $state(false);
	const sub = liveQuery(() => db.whiskeys.toArray()).subscribe((rows) => {
		whiskeys = rows;
		loaded = true;
	});
	onDestroy(() => sub.unsubscribe());

	nav.back = '/whiskeys';
	const show = $derived(nav.show as Show);
	const sort = $derived(nav.sort as Sort);

	const counts = $derived({
		all: whiskeys.length,
		tasted: whiskeys.filter((w) => w.status === 'tasted').length,
		want: whiskeys.filter((w) => w.status === 'want').length,
		shelf: whiskeys.filter(onShelf).length
	});
	const low = $derived(whiskeys.filter(isRunningLow).length);

	const added = (w: Whiskey) => w.createdAt || w.updatedAt;
	const sorted = $derived.by(() => {
		const list =
			show === 'all'
				? [...whiskeys]
				: show === 'shelf'
					? whiskeys.filter(onShelf)
					: whiskeys.filter((w) => w.status === show);
		if (sort === 'level')
			return list.sort((a, b) => fill(a) - fill(b) || a.name.localeCompare(b.name));
		if (sort === 'az') return list.sort((a, b) => a.name.localeCompare(b.name));
		if (sort === 'rating')
			return list.sort(
				(a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.name.localeCompare(b.name)
			);
		return list.sort((a, b) => added(b).localeCompare(added(a)));
	});

	const monthName = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
	const groups = $derived.by(() => {
		if (sort !== 'newest') return [{ label: '', items: sorted }];
		const out: { label: string; items: Whiskey[] }[] = [];
		for (const w of sorted) {
			const d = new Date(added(w));
			const label = isNaN(d.getTime()) ? 'Undated' : monthName.format(d);
			if (out.at(-1)?.label !== label) out.push({ label, items: [] });
			out.at(-1)!.items.push(w);
		}
		return out;
	});

	const photos = createPhotoUrls();
	onDestroy(photos.release);
</script>

<AppHeader>
	{#snippet left()}<a class="btn" href="/">‹ Home</a>{/snippet}
	{#snippet right()}
		<div class="header-actions">
			<SyncStatus />
			<a class="btn" href="/settings">Settings</a>
		</div>
	{/snippet}
</AppHeader>

<main>
	<h1>My whiskeys</h1>

	<div class="filters" role="group" aria-label="Show">
		{#each [['all', 'All'], ['tasted', 'Tasted'], ['want', 'Want'], ['shelf', 'Shelf']] as const as [value, label] (value)}
			<button
				type="button"
				class:on={show === value}
				aria-pressed={show === value}
				onclick={() => setShow(value)}>{label} <span class="n">{counts[value]}</span></button
			>
		{/each}
	</div>

	{#if low || show === 'shelf'}
		<a class="banner" class:quiet={!low} href="/shopping">
			<span>{low ? `${low} running low` : 'Shopping list'}</span>
			<strong>{low ? 'Shopping list ›' : '›'}</strong>
		</a>
	{/if}

	<div class="sortbar">
		<label for="sort" class="muted">Sort</label>
		<select id="sort" value={sort} onchange={(e) => (nav.sort = e.currentTarget.value)}>
			{#each SORTS.filter((s) => s.value !== 'level' || show === 'shelf') as s (s.value)}<option
					value={s.value}>{s.label}</option
				>{/each}
		</select>
	</div>

	{#if loaded && !sorted.length}
		<p class="muted">
			{show === 'all'
				? 'Nothing here yet.'
				: show === 'tasted'
					? 'Nothing marked tasted yet.'
					: show === 'want'
						? 'Nothing on your want-to-try list yet.'
						: 'No bottles on your shelf yet. Set “Your bottle” on a record to Unopened or Open.'}
		</p>
	{/if}

	{#each groups as g (g.label)}
		<section>
			{#if g.label}<h2 class="eyebrow">{g.label}</h2>{/if}
			<ul>
				{#each g.items as w (w.id)}
					<li>
						<WhiskeyRow
							whiskey={w}
							cover={photos.urls[w.photoIds[0]]}
							onvisible={() => w.photoIds[0] && photos.load([w.photoIds[0]])}
							show={show === 'shelf' ? 'level' : 'rating'}
						/>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</main>

<style>
	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	main {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-2) var(--gutter) var(--space-6);
	}
	.filters {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		border: var(--border);
	}
	.filters button {
		min-height: 44px;
		border: 0;
		background: transparent;
		font-size: 14px;
		cursor: pointer;
	}
	.filters button + button {
		border-left: var(--border);
	}
	.filters .on {
		background: var(--ink);
		color: var(--base);
		font-weight: 700;
	}
	.n {
		font-weight: 400;
		opacity: 0.8;
	}
	.banner {
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: var(--tap);
		padding: 0 var(--space-3);
		border: var(--border);
		border-left: 4px solid var(--red);
		font-size: 14px;
		font-weight: 700;
		text-decoration: none;
	}
	.banner.quiet {
		border-left-width: 1px;
		font-weight: 400;
	}
	.sortbar {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: var(--space-2);
		font-size: 14px;
	}
	select {
		min-height: 40px;
		padding: 0 var(--space-2);
		border: var(--border);
		background: var(--surface);
		border-radius: 0;
		font-size: 14px;
		font-weight: 700;
	}
	section {
		display: grid;
		gap: var(--space-2);
	}
	h2 {
		margin: var(--space-2) 0 0;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2);
	}
	p {
		margin: 0;
	}
</style>

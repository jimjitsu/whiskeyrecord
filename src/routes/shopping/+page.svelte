<script lang="ts">
	import { liveQuery } from 'dexie';
	import { onDestroy } from 'svelte';
	import { db, isRunningLow, patchWhiskey, type Whiskey } from '#lib/db.ts';
	import { createPhotoUrls } from '#lib/photoUrl.svelte.ts';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import WhiskeyRow from '#lib/components/WhiskeyRow.svelte';
	import Toast from '#lib/components/Toast.svelte';
	import { nav } from '#lib/nav.svelte.ts';

	// Bottles you'd buy again that are low or gone, plus your want-to-try list.
	// Ticking one off marks it bought: you now own an unopened bottle.
	let whiskeys = $state<Whiskey[]>([]);
	let loaded = $state(false);
	const sub = liveQuery(() => db.whiskeys.orderBy('name').toArray()).subscribe((rows) => {
		whiskeys = rows;
		loaded = true;
	});
	onDestroy(() => sub.unsubscribe());
	nav.back = '/shopping';

	const restock = $derived(whiskeys.filter(isRunningLow));
	// Want-to-try bottles you already own aren't on the list.
	const toTry = $derived(
		whiskeys.filter((w) => w.status === 'want' && w.bottle !== 'unopened' && w.bottle !== 'open')
	);

	const money = (v: string) => (v && /^\d/.test(v) ? `$${v}` : v);
	const detail = (w: Whiskey, kind: 'restock' | 'try') =>
		[
			kind === 'restock'
				? w.pricePaid && `Paid ${money(w.pricePaid)}`
				: w.retail && `Retail ${money(w.retail)}`,
			w.boughtAt
		]
			.filter(Boolean)
			.join(' · ') || undefined;

	let bought = $state<{ w: Whiskey } | null>(null);
	async function markBought(w: Whiskey) {
		bought = { w: $state.snapshot(w) as Whiskey };
		await patchWhiskey(w.id, { bottle: 'unopened', level: null });
	}
	async function undoBought() {
		if (!bought) return;
		const { w } = bought;
		bought = null;
		await patchWhiskey(w.id, { bottle: w.bottle, level: w.level });
	}

	async function share() {
		const line = (w: Whiskey, kind: 'restock' | 'try') =>
			`- ${w.name}${w.distillery ? ` (${w.distillery})` : ''}${detail(w, kind) ? ` · ${detail(w, kind)}` : ''}`;
		const parts: string[] = [];
		if (restock.length)
			parts.push(['Restock:', ...restock.map((w) => line(w, 'restock'))].join('\n'));
		if (toTry.length) parts.push(['Want to try:', ...toTry.map((w) => line(w, 'try'))].join('\n'));
		const text = parts.join('\n\n');
		try {
			if (navigator.share) await navigator.share({ title: 'Whiskey shopping list', text });
			else {
				await navigator.clipboard.writeText(text);
				copied = true;
			}
		} catch {
			/* share sheet dismissed */
		}
	}
	let copied = $state(false);

	const photos = createPhotoUrls();
	onDestroy(photos.release);
</script>

<AppHeader>
	{#snippet left()}<a class="btn" href="/whiskeys">‹ Back</a>{/snippet}
	{#snippet right()}
		{#if restock.length || toTry.length}
			<button class="btn" type="button" onclick={share}>{copied ? 'Copied' : 'Share'}</button>
		{/if}
	{/snippet}
</AppHeader>

<main>
	<h1>Shopping list</h1>

	{#if loaded && !restock.length && !toTry.length}
		<p class="muted">
			Nothing to buy. Bottles you'd buy again show up here when they're down to 1/4 or finished,
			along with your want-to-try list.
		</p>
	{/if}

	{#each [{ kind: 'restock' as const, title: 'Running low · buy again', items: restock }, { kind: 'try' as const, title: 'Want to try', items: toTry }] as group (group.kind)}
		{#if group.items.length}
			<section>
				<h2 class="eyebrow">{group.title} ({group.items.length})</h2>
				<ul>
					{#each group.items as w (w.id)}
						<li>
							<WhiskeyRow
								whiskey={w}
								cover={photos.urls[w.photoIds[0]]}
								onvisible={() => w.photoIds[0] && photos.load([w.photoIds[0]])}
								detail={detail(w, group.kind)}
								show={group.kind === 'restock' ? 'level' : 'rating'}
							/>
							<button
								class="tick"
								type="button"
								onclick={() => markBought(w)}
								aria-label="Mark {w.name} bought"
							></button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/each}

	{#if restock.length || toTry.length}
		<p class="muted small">
			Tick one when you buy it: it becomes an unopened bottle on your shelf.
		</p>
	{/if}
</main>

{#if bought}
	<Toast
		message="Marked “{bought.w.name}” bought"
		actionLabel="Undo"
		onaction={undoBought}
		ondismiss={() => (bought = null)}
	/>
{/if}

<style>
	main {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-2) var(--gutter) var(--space-6);
	}
	section {
		display: grid;
		gap: var(--space-2);
	}
	h2 {
		margin: 0;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2);
	}
	li {
		display: grid;
		grid-template-columns: 1fr var(--tap);
		gap: var(--space-2);
		align-items: center;
	}
	.tick {
		width: var(--tap);
		height: var(--tap);
		border: var(--border);
		background: var(--base);
		cursor: pointer;
	}
	.tick:hover {
		background: var(--surface);
	}
	p {
		margin: 0;
	}
	.small {
		font-size: 13px;
	}
</style>

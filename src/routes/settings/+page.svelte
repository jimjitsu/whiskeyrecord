<script lang="ts">
	import { db } from '#lib/db.ts';
	import AppHeader from '#lib/components/AppHeader.svelte';

	const COLUMNS = [
		'id',
		'name',
		'distillery',
		'type',
		'age',
		'proof',
		'status',
		'rating',
		'notes',
		'tags',
		'pricePaid',
		'createdAt',
		'updatedAt'
	] as const;

	function csvCell(v: unknown): string {
		const s = Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v);
		return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
	}

	async function exportCsv() {
		const rows = await db.whiskeys.orderBy('name').toArray();
		const lines = [
			COLUMNS.join(','),
			...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(','))
		];
		const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `whiskey-record-${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();
		URL.revokeObjectURL(a.href);
	}
</script>

<AppHeader>
	{#snippet left()}<a class="btn" href="/">‹ Search</a>{/snippet}
</AppHeader>

<main>
	<h1>Settings</h1>

	<section>
		<p class="eyebrow">Google Sheet</p>
		<p class="muted">
			Not connected yet. For now your record is kept on this device only. Google sync is the next
			step.
		</p>
	</section>

	<section>
		<p class="eyebrow">AI label reading</p>
		<p class="muted">Not connected. Coming soon: connect your OpenRouter account.</p>
	</section>

	<section>
		<p class="eyebrow">Your data</p>
		<button class="btn btn-block" type="button" onclick={exportCsv}>Export CSV</button>
	</section>
</main>

<style>
	main {
		display: grid;
		gap: var(--space-5);
		padding: 0 var(--gutter) var(--space-6);
	}
	section {
		display: grid;
		gap: var(--space-2);
	}
	section p {
		margin: 0;
	}
</style>

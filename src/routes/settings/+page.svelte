<script lang="ts">
	import { db } from '#lib/db.ts';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import { signIn, signOut } from '#lib/google/auth.svelte.ts';
	import {
		connectSheet,
		disconnectSheet,
		replaceMissingSheet,
		sync,
		syncNow
	} from '#lib/sync.svelte.ts';

	let busy = $state(false);
	let error = $state('');

	// Each of these starts from a tap, so Google's sign-in popup is allowed to open.
	async function run(fn: () => Promise<unknown>) {
		error = '';
		busy = true;
		try {
			await fn();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Something went wrong.';
		} finally {
			busy = false;
		}
	}

	const connect = () =>
		run(async () => {
			await connectSheet(await signIn('consent'));
			await syncNow();
		});

	const syncTap = () =>
		run(async () => {
			if (sync.status === 'needs-auth') await signIn('');
			await syncNow();
		});

	const replace = () =>
		run(async () => {
			await replaceMissingSheet(await signIn(''));
			await syncNow();
		});

	async function disconnect() {
		if (
			!confirm(
				'Disconnect Google Drive on this device? Your sheet stays in Drive, and your record stays on this device.'
			)
		)
			return;
		disconnectSheet();
		await signOut();
	}

	const lastSynced = $derived(
		sync.lastSyncedAt
			? new Date(sync.lastSyncedAt).toLocaleTimeString([], { timeStyle: 'short' })
			: null
	);

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
		{#if !sync.config}
			<p class="muted">
				Not connected. Your record is kept on this device only. Connect to keep it in a Google Sheet
				you own and use it on other devices.
			</p>
			<button class="btn btn-primary btn-block" type="button" onclick={connect} disabled={busy}>
				{busy ? 'Connecting…' : 'Connect Google Drive'}
			</button>
		{:else if sync.status === 'missing'}
			<p class="warn" role="alert">{sync.message}</p>
			<button class="btn btn-primary btn-block" type="button" onclick={replace} disabled={busy}>
				Create a new sheet
			</button>
			<p class="muted small">
				Restored it from the Drive trash? Tap Sync instead and it will reconnect.
			</p>
			<button class="btn btn-block" type="button" onclick={syncTap} disabled={busy}>Sync</button>
		{:else}
			<p>
				Connected ·
				<a href={sync.config.sheetUrl} target="_blank" rel="noopener">Open your sheet</a>
			</p>
			<p class="muted small">
				{#if sync.status === 'syncing'}Syncing…
				{:else if sync.status === 'needs-auth'}Google sign-in has expired. Tap Sync to renew it.
				{:else if sync.status === 'offline'}Offline. Changes will sync when you're back online.
				{:else if sync.status === 'error'}Last sync failed: {sync.message}
				{:else if lastSynced}Last synced at {lastSynced}.{/if}
				{#if sync.unsynced}{sync.unsynced} change{sync.unsynced === 1 ? '' : 's'} waiting.{/if}
			</p>
			<button
				class="btn btn-block"
				type="button"
				onclick={syncTap}
				disabled={busy || sync.status === 'syncing'}
			>
				Sync now
			</button>
			<button class="btn btn-block" type="button" onclick={disconnect}>Disconnect</button>
		{/if}
		{#if error}<p class="warn" role="alert">{error}</p>{/if}
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
	.small {
		font-size: 14px;
	}
	.warn {
		padding: var(--space-2) var(--space-3);
		border-left: 4px solid var(--red);
		background: var(--surface);
		font-size: 14px;
	}
</style>

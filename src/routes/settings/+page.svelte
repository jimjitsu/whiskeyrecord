<script lang="ts">
	import { db } from '#lib/db.ts';
	import { HEADERS, toRow } from '#lib/sheetRow.ts';
	import { version } from '$app/env';
	import { PUBLIC_FEEDBACK_EMAIL } from '$app/env/public';
	import { liveQuery } from 'dexie';
	import { onDestroy } from 'svelte';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import { setTheme, theme, type ThemeChoice } from '#lib/theme.svelte.ts';
	import { signIn, signOut } from '#lib/google/auth.svelte.ts';
	import {
		connectSheet,
		disconnectSheet,
		replaceMissingSheet,
		resetDeviceCopy,
		sync,
		syncNow
	} from '#lib/sync.svelte.ts';
	import {
		AUTO,
		ai,
		connectOpenRouter,
		disconnectOpenRouter,
		PAID_SHORTLIST,
		costLabel,
		listVisionModels,
		setModel,
		type VisionModel
	} from '#lib/ai/openrouter.svelte.ts';

	const THEMES: { value: ThemeChoice; label: string }[] = [
		{ value: 'system', label: 'System' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];

	let models = $state<VisionModel[]>([]);
	let modelsError = $state('');
	async function loadModels() {
		try {
			models = await listVisionModels();
		} catch {
			modelsError = "Couldn't load the model list. Auto still works.";
		}
	}
	$effect(() => {
		if (ai.key && !models.length && !modelsError) loadModels();
	});
	const freeModels = $derived(models.filter((m) => m.free));
	const paidModels = $derived(models.filter((m) => !m.free));
	// A short list of good paid models; the rest only on request.
	let showAllPaid = $state(false);
	const shortlist = $derived(
		PAID_SHORTLIST.flatMap((s) => {
			const m = paidModels.find((p) => p.id === s.id);
			return m ? [{ ...m, ...s }] : [];
		})
	);
	const otherPaid = $derived(paidModels.filter((m) => !PAID_SHORTLIST.some((s) => s.id === m.id)));
	const recommended = $derived(shortlist.find((m) => m.recommended));
	const selected = $derived(models.find((m) => m.id === ai.model));
	const shortName = (name: string) => name.replace(/^[^:]+:\s*/, '');

	function disconnectAi() {
		if (!confirm('Disconnect OpenRouter on this device? You can reconnect any time.')) return;
		disconnectOpenRouter();
	}

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

	function csvCell(v: unknown): string {
		const s = Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v);
		return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
	}

	// --- Support ------------------------------------------------------------
	let recordCount = $state(0);
	const countSub = liveQuery(() => db.whiskeys.count()).subscribe((n) => (recordCount = n));
	onDestroy(() => countSub.unsubscribe());
	// The build timestamp is the version; shown as a date and time testers can quote.
	const built = new Date(Number(version));
	const versionLabel = isNaN(built.getTime())
		? version
		: built.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
	const diagnostics = $derived(
		[
			`Version ${versionLabel}`,
			`${recordCount} record${recordCount === 1 ? '' : 's'}`,
			sync.config
				? `last sync ${sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleString() : 'not yet this session'}`
				: 'not connected to Google',
			sync.unsynced ? `${sync.unsynced} waiting` : '',
			sync.status === 'error' ? `sync error: ${sync.message}` : ''
		]
			.filter(Boolean)
			.join(' · ')
	);
	const feedbackHref = $derived(
		PUBLIC_FEEDBACK_EMAIL
			? `mailto:${PUBLIC_FEEDBACK_EMAIL}?subject=${encodeURIComponent('Whiskey Record feedback')}&body=${encodeURIComponent(`\n\n—\n${diagnostics}\n${navigator.userAgent}`)}`
			: ''
	);

	let resetting = $state(false);
	let resetNote = $state('');
	async function resetDevice() {
		if (
			!confirm(
				'Clear the copy on this phone and download everything again from your Google Sheet? It syncs first, so nothing is lost.'
			)
		)
			return;
		resetting = true;
		resetNote = '';
		try {
			const result = await resetDeviceCopy();
			resetNote =
				result === 'done'
					? 'Done. Your record was downloaded again from the sheet; photos load as you open them.'
					: "Couldn't sync first, so nothing was cleared. Check the Google Sheet status above and try again.";
		} finally {
			resetting = false;
		}
	}

	async function exportCsv() {
		const rows = await db.whiskeys.orderBy('name').toArray();
		// Same columns as the sheet, minus the photo links.
		const keep = HEADERS.map((_, i) => i).filter((i) => HEADERS[i] !== 'Photos');
		const lines = [
			keep.map((i) => csvCell(HEADERS[i])).join(','),
			...rows.map((r) => {
				const row = toRow(r, []);
				return keep.map((i) => csvCell(row[i])).join(',');
			})
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
	{#snippet left()}<a class="btn" href="/">‹ Home</a>{/snippet}
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
		{#if !ai.key}
			<p class="muted">
				Connect a free OpenRouter account and the app fills in name, distillery, type, age and proof
				from your photo. Your key stays on this device.
			</p>
			<button
				class="btn btn-primary btn-block"
				type="button"
				onclick={() => connectOpenRouter('/settings')}
			>
				Connect OpenRouter
			</button>
			<p class="muted small">
				New to OpenRouter? You'll create a free account on the next screen.
				<a href="https://openrouter.ai" target="_blank" rel="noopener">About OpenRouter</a>
			</p>
		{:else}
			<p>Connected</p>
			<div class="field">
				<label class="eyebrow" for="model">Model</label>
				<select id="model" value={ai.model} onchange={(e) => setModel(e.currentTarget.value)}>
					<option value={AUTO}>Auto (best free model that reads images)</option>
					{#if freeModels.length}
						<optgroup label="Free">
							{#each freeModels as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
						</optgroup>
					{/if}
					{#if shortlist.length}
						<optgroup label="Paid (uses your OpenRouter credit)">
							{#each shortlist as m (m.id)}<option value={m.id}
									>{shortName(m.name)}{m.recommended ? ' · recommended' : ''}</option
								>{/each}
						</optgroup>
					{/if}
					{#if showAllPaid && otherPaid.length}
						<optgroup label="Other paid models">
							{#each otherPaid as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
						</optgroup>
					{:else if selected && !selected.free && !shortlist.some((m) => m.id === selected.id)}
						<option value={selected.id}>{selected.name}</option>
					{/if}
					{#if ai.model !== AUTO && !models.some((m) => m.id === ai.model)}
						<option value={ai.model}>{ai.model}</option>
					{/if}
				</select>
			</div>
			{#if modelsError}
				<p class="muted small">{modelsError}</p>
			{:else if selected && !selected.free}
				<p class="muted small">
					Uses your OpenRouter credit: {costLabel(selected.perBottle)}. No daily limit.
				</p>
			{:else}
				<p class="muted small">
					Free models allow about 50 AI requests a day. Each bottle uses two (the label, then the
					bottle details), so that's about 25 bottles a day. If one model is busy, another free one
					is used.
				</p>
			{/if}
			{#if recommended && !(selected && !selected.free)}
				<div class="reco">
					<p class="eyebrow">Want more?</p>
					<p class="small">
						Pick <strong>{shortName(recommended.name)}</strong> under Paid. It reads labels the most
						accurately for the price, at {costLabel(recommended.perBottle)}, with no daily limit.
						Add credit at
						<a href="https://openrouter.ai/settings/credits" target="_blank" rel="noopener"
							>openrouter.ai</a
						>. Any purchase of $10 or more also raises the free limit to about 500 bottles a day.
					</p>
				</div>
			{/if}
			{#if models.length && otherPaid.length}
				<button class="linkbtn" type="button" onclick={() => (showAllPaid = !showAllPaid)}>
					{showAllPaid
						? 'Show the short list of paid models'
						: `Show all ${paidModels.length} paid models`}
				</button>
			{/if}
			<button class="btn btn-block" type="button" onclick={disconnectAi}
				>Disconnect OpenRouter</button
			>
		{/if}
	</section>

	<section>
		<p class="eyebrow" id="theme-label">Theme</p>
		<div class="segmented" role="radiogroup" aria-labelledby="theme-label">
			{#each THEMES as t (t.value)}
				<button
					type="button"
					role="radio"
					aria-checked={theme.choice === t.value}
					class:on={theme.choice === t.value}
					onclick={() => setTheme(t.value)}>{t.label}</button
				>
			{/each}
		</div>
		<p class="muted small">
			{theme.choice === 'system'
				? "Follows your phone's light or dark setting."
				: `Always ${theme.choice} on this phone.`}
		</p>
	</section>

	<section>
		<p class="eyebrow">Your data</p>
		<button class="btn btn-block" type="button" onclick={exportCsv}>Export CSV</button>
		{#if sync.config}
			<button class="btn btn-block" type="button" onclick={resetDevice} disabled={resetting}>
				{resetting ? 'Re-downloading…' : 'Re-download from the sheet'}
			</button>
			<p class="muted small">
				Clears the copy on this phone and downloads it again. Use it if something looks out of step
				with your sheet.
			</p>
			{#if resetNote}<p class="small" role="status">{resetNote}</p>{/if}
		{/if}
	</section>

	<section>
		<p class="eyebrow">Help</p>
		<p class="muted small diag">{diagnostics}</p>
		{#if feedbackHref}
			<a class="btn btn-block" href={feedbackHref}>Send feedback</a>
		{/if}
		<a class="small" href="/privacy">Privacy</a>
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
	.segmented {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border: var(--border);
	}
	.segmented button {
		min-height: var(--tap);
		border: 0;
		background: transparent;
		color: var(--ink);
		cursor: pointer;
	}
	.segmented button + button {
		border-left: var(--border);
	}
	.segmented .on {
		font-weight: 700;
		background: var(--ink);
		color: var(--base);
	}
	.small {
		font-size: 14px;
	}
	select {
		width: 100%;
		min-height: var(--tap);
		padding: 0 var(--space-3);
		border: var(--border);
		background: var(--surface);
		border-radius: 0;
	}
	.warn {
		padding: var(--space-2) var(--space-3);
		border-left: 4px solid var(--red);
		background: var(--surface);
		font-size: 14px;
	}
	.diag {
		overflow-wrap: anywhere;
	}
	.reco {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-3);
		border: var(--border);
		border-left: 4px solid var(--teal);
	}
	.reco p {
		margin: 0;
	}
	.linkbtn {
		justify-self: start;
		padding: 0;
		border: 0;
		background: none;
		font-size: 14px;
		text-decoration: underline;
		cursor: pointer;
	}
</style>

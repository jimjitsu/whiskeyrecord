<script lang="ts">
	import { signIn } from '#lib/google/auth.svelte.ts';
	import { sync, syncNow } from '#lib/sync.svelte.ts';

	// Small status chip for the home header. Tapping it syncs; when Google's
	// hour-long sign-in has run out, the tap also renews it.
	let error = $state('');

	const label = $derived.by(() => {
		switch (sync.status) {
			case 'syncing':
				return 'Syncing…';
			case 'needs-auth':
				return sync.unsynced ? `${sync.unsynced} to sync · Tap` : 'Tap to sync';
			case 'offline':
				return sync.unsynced ? `Offline · ${sync.unsynced} waiting` : 'Offline';
			case 'missing':
				return 'Sheet missing';
			case 'error':
				return 'Sync failed · Retry';
			default:
				return sync.unsynced ? `${sync.unsynced} to sync` : 'Synced';
		}
	});

	async function tap() {
		error = '';
		if (sync.status === 'missing') {
			location.href = '/settings';
			return;
		}
		try {
			if (sync.status === 'needs-auth') await signIn('');
			await syncNow();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Sign-in failed';
		}
	}
</script>

{#if sync.status !== 'off'}
	<button
		type="button"
		class="chip {sync.status}"
		onclick={tap}
		disabled={sync.status === 'syncing'}
		title={error || sync.message || undefined}
		aria-live="polite"
	>
		<span class="dot" aria-hidden="true"></span>{label}
	</button>
{/if}

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 40px;
		padding: 0 var(--space-3);
		border: var(--border);
		background: var(--surface);
		font-size: 12px;
		cursor: pointer;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--teal);
	}
	.needs-auth .dot,
	.offline .dot {
		background: var(--amber);
	}
	.missing .dot,
	.error .dot {
		background: var(--red);
	}
	.syncing .dot {
		animation: pulse 1s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.2;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.syncing .dot {
			animation: none;
		}
	}
</style>

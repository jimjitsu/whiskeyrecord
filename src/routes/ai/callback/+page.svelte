<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { finishConnect } from '#lib/ai/openrouter.svelte.ts';

	// OpenRouter sends the user back here with a one-time code.
	let error = $state('');
	let done = $state(false);

	onMount(async () => {
		const code = page.url.searchParams.get('code');
		if (!code) {
			error = 'OpenRouter didn’t finish connecting. You can try again from Settings.';
			return;
		}
		try {
			const next = await finishConnect(code, page.url.searchParams.get('state'));
			done = true;
			goto(next, { replaceState: true });
		} catch (e) {
			error = e instanceof Error ? e.message : 'Connecting OpenRouter failed.';
		}
	});
</script>

<main>
	{#if error}
		<h1>Not connected</h1>
		<p class="warn" role="alert">{error}</p>
		<a class="btn btn-block" href="/settings">Back to Settings</a>
	{:else if done}
		<h1>Connected</h1>
		<p class="muted">AI label reading is on. Taking you back…</p>
	{:else}
		<h1>Connecting…</h1>
		<p class="muted">Finishing your OpenRouter connection.</p>
	{/if}
</main>

<style>
	main {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-6) var(--gutter);
	}
	p {
		margin: 0;
	}
	.warn {
		padding: var(--space-2) var(--space-3);
		border-left: 4px solid var(--red);
		background: var(--surface);
	}
</style>

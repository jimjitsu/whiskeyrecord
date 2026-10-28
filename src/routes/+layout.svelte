<script lang="ts">
	import '@fontsource/sancreek/latin-400.css';
	import '@fontsource/orbitron/latin-600.css';
	import '@fontsource/jetbrains-mono/latin-400.css';
	import '@fontsource/jetbrains-mono/latin-700.css';
	import '../app.css';
	import { onMount } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { page, updated } from '$app/state';
	import { loadGis } from '#lib/google/auth.svelte.ts';
	import { startAutoSync } from '#lib/sync.svelte.ts';
	import { isOnboarded } from '#lib/onboarding.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// After a deploy, the open app's code may point at files that no longer
	// exist. Once a new version is detected, the next tap loads the page fresh.
	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url) location.href = to.url.href;
	});

	// Check for a new version as soon as the app opens (SvelteKit also checks
	// when it comes back to the foreground, and every 5 minutes). Not on the
	// camera, where a reload would lose the photos just taken.
	const showUpdate = $derived(updated.current && page.url.pathname !== '/camera');

	onMount(() => {
		updated.check().catch(() => {});
		// The privacy page has to be readable without setting anything up.
		if (!isOnboarded() && !['/welcome', '/privacy'].includes(page.url.pathname))
			goto('/welcome', { replaceState: true });
		// Load Google's sign-in early so a tap can open it without the browser blocking the popup.
		if (navigator.onLine) loadGis().catch(() => {});
		return startAutoSync();
	});
</script>

<div class="app">
	{#if showUpdate}
		<div class="update" role="status">
			<span>The app was updated.</span>
			<button type="button" onclick={() => location.reload()}>Reload</button>
		</div>
	{/if}
	{@render children()}
</div>

<style>
	.update {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: env(safe-area-inset-top) var(--space-2) 0 var(--gutter);
		background: var(--ink);
		color: var(--base);
		font-size: 14px;
	}
	.update button {
		min-height: var(--tap);
		padding: 0 var(--space-3);
		border: 0;
		background: none;
		color: var(--amber);
		font-weight: 700;
		text-decoration: underline;
		white-space: nowrap;
		cursor: pointer;
	}
	.app {
		max-width: 480px;
		margin: 0 auto;
		min-height: 100dvh;
		padding-bottom: env(safe-area-inset-bottom);
	}
</style>

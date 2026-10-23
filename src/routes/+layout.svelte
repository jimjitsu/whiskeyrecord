<script lang="ts">
	import '@fontsource/sancreek/latin-400.css';
	import '@fontsource/orbitron/latin-600.css';
	import '@fontsource/jetbrains-mono/latin-400.css';
	import '@fontsource/jetbrains-mono/latin-700.css';
	import '../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { loadGis } from '#lib/google/auth.svelte.ts';
	import { startAutoSync } from '#lib/sync.svelte.ts';
	import { isOnboarded } from '#lib/onboarding.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	onMount(() => {
		if (!isOnboarded() && page.url.pathname !== '/welcome')
			goto('/welcome', { replaceState: true });
		// Load Google's sign-in early so a tap can open it without the browser blocking the popup.
		if (navigator.onLine) loadGis().catch(() => {});
		return startAutoSync();
	});
</script>

<div class="app">
	{@render children()}
</div>

<style>
	.app {
		max-width: 480px;
		margin: 0 auto;
		min-height: 100dvh;
		padding-bottom: env(safe-area-inset-bottom);
	}
</style>

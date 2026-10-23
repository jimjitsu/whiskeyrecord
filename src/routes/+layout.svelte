<script lang="ts">
	import '@fontsource/sancreek/latin-400.css';
	import '@fontsource/orbitron/latin-600.css';
	import '@fontsource/jetbrains-mono/latin-400.css';
	import '@fontsource/jetbrains-mono/latin-700.css';
	import '../app.css';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
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

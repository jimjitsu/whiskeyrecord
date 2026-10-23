<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Top bar: a back/cancel link on the left, an optional action on the right. */
	let { left, right }: { left?: Snippet; right?: Snippet } = $props();
</script>

<header>
	<div>
		{#if left}{@render left()}{:else}<a class="logo" href="/" aria-label="Whiskey Record home"
				><img src="/icon.svg" alt="" width="40" height="40" /></a
			>{/if}
	</div>
	<div>
		{#if right}{@render right()}{/if}
	</div>
</header>

<style>
	header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 64px;
		padding: var(--space-2) var(--gutter);
		background: var(--base);
	}
	.logo {
		display: block;
		width: 40px;
		height: 40px;
		border: var(--border);
	}
	.logo img {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>

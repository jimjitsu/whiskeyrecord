<script lang="ts">
	import { onDestroy, untrack } from 'svelte';

	let {
		message,
		actionLabel,
		onaction,
		ondismiss,
		duration = 5000
	}: {
		message: string;
		actionLabel?: string;
		onaction?: () => void;
		ondismiss: () => void;
		duration?: number;
	} = $props();

	const timer = setTimeout(
		() => ondismiss(),
		untrack(() => duration)
	);
	onDestroy(() => clearTimeout(timer));
</script>

<div class="toast" role="status">
	<span>{message}</span>
	{#if actionLabel}
		<button type="button" onclick={() => onaction?.()}>{actionLabel}</button>
	{/if}
</div>

<style>
	.toast {
		position: fixed;
		left: var(--gutter);
		right: var(--gutter);
		bottom: calc(var(--gutter) + env(safe-area-inset-bottom));
		max-width: 448px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
		background: var(--ink);
		color: var(--base);
		z-index: 20;
	}
	button {
		min-height: var(--tap);
		padding: 0 var(--space-3);
		background: none;
		border: 0;
		color: var(--amber);
		font-weight: 700;
		text-decoration: underline;
		cursor: pointer;
	}
</style>

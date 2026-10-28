<script lang="ts">
	import { page } from '$app/state';
	import AppHeader from '#lib/components/AppHeader.svelte';

	const notFound = $derived(page.status === 404);
</script>

<AppHeader />

<main>
	<h1>{notFound ? 'Page not found' : 'Something went wrong'}</h1>
	<p>
		{notFound
			? "There's nothing at this address."
			: 'Your record is safe on this phone. Going back and trying again usually fixes it.'}
	</p>
	{#if !notFound && page.error?.message}
		<p class="muted small">Details: {page.error.message} ({page.status})</p>
	{/if}
	<a class="btn btn-primary btn-block" href="/">Back to home</a>
	{#if !notFound}
		<button class="btn btn-block" type="button" onclick={() => location.reload()}>Reload</button>
	{/if}
</main>

<style>
	main {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-4) var(--gutter);
	}
	p {
		margin: 0;
	}
	.small {
		font-size: 13px;
		overflow-wrap: anywhere;
	}
</style>

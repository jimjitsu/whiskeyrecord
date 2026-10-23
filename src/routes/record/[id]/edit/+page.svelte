<script lang="ts">
	import { page } from '$app/state';
	import { db } from '#lib/db.ts';
	import RecordForm from '#lib/components/RecordForm.svelte';

	const id = page.params.id!;
	const record = db.whiskeys.get(id);
</script>

{#await record then w}
	{#if w}
		<RecordForm initial={w} previous={w} isNew={false} draftKey="whiskey-record:draft:{w.id}" />
	{:else}
		<p style="padding: 16px">That record wasn't found. <a href="/">Back to search</a></p>
	{/if}
{/await}

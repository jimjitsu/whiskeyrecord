<script lang="ts">
	import type { Status } from '#lib/db.ts';

	let { value = $bindable('want'), onchange }: { value: Status; onchange?: (s: Status) => void } =
		$props();

	const options: { value: Status; label: string }[] = [
		{ value: 'tasted', label: 'Tasted' },
		{ value: 'want', label: 'Want to try' }
	];

	function select(s: Status) {
		if (s === value) return;
		value = s;
		onchange?.(s);
	}
</script>

<div class="segmented" role="radiogroup" aria-label="Status">
	{#each options as o (o.value)}
		<button
			type="button"
			role="radio"
			aria-checked={value === o.value}
			class:on={value === o.value}
			class={o.value}
			onclick={() => select(o.value)}>{o.label}</button
		>
	{/each}
</div>

<style>
	.segmented {
		display: grid;
		grid-template-columns: 1fr 1fr;
		border: var(--border);
	}
	button {
		min-height: var(--tap);
		border: 0;
		background: transparent;
		cursor: pointer;
	}
	button + button {
		border-left: var(--border);
	}
	.on {
		font-weight: 700;
		color: var(--on-accent);
	}
	.on.tasted {
		background: var(--teal);
	}
	.on.want {
		background: var(--red);
	}
</style>

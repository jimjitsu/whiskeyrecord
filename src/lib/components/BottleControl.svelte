<script lang="ts">
	import { LEVELS, type BottleState } from '#lib/db.ts';

	/** "Your bottle": None / Unopened / Open / Finished, plus a rough level when open. */
	let {
		bottle,
		level,
		onchange
	}: {
		bottle: BottleState;
		level: number | null;
		onchange: (bottle: BottleState, level: number | null) => void;
	} = $props();

	const STATES: { value: Exclude<BottleState, ''>; label: string }[] = [
		{ value: 'none', label: 'None' },
		{ value: 'unopened', label: 'Unopened' },
		{ value: 'open', label: 'Open' },
		{ value: 'finished', label: 'Finished' }
	];

	function pick(s: Exclude<BottleState, ''>) {
		// Tapping the current state again clears it.
		if (s === bottle) onchange('', null);
		else onchange(s, s === 'open' ? (level ?? 0.75) : null);
	}
</script>

<div class="states" role="group" aria-label="Your bottle">
	{#each STATES as s (s.value)}
		<button
			type="button"
			class:on={bottle === s.value}
			aria-pressed={bottle === s.value}
			onclick={() => pick(s.value)}>{s.label}</button
		>
	{/each}
</div>

{#if bottle === 'open'}
	<div class="levels" role="group" aria-label="How much is left">
		{#each LEVELS as l (l.value)}
			<button
				type="button"
				class:on={level === l.value}
				aria-pressed={level === l.value}
				onclick={() => onchange('open', l.value)}
			>
				<span class="bar" aria-hidden="true"><span style:width="{l.value * 100}%"></span></span>
				{l.label}
			</button>
		{/each}
	</div>
{/if}

<style>
	.states,
	.levels {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		border: var(--border);
	}
	button {
		min-height: 44px;
		border: 0;
		background: transparent;
		font-size: 13px;
		cursor: pointer;
	}
	button + button {
		border-left: var(--border);
	}
	.states .on {
		background: var(--ink);
		color: var(--base);
		font-weight: 700;
	}
	.levels button {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 52px;
	}
	.levels .on {
		background: var(--amber);
		color: #1a1a1a;
		font-weight: 700;
	}
	.bar {
		display: block;
		width: 36px;
		height: 8px;
		border: 1px solid currentColor;
		background: var(--base);
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--amber);
	}
	.levels .on .bar span {
		background: #1a1a1a;
	}
</style>

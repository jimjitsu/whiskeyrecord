<script lang="ts">
	/** Tap a star for a whole number, then fine-tune with the slider (0.1 steps). */
	let { value = $bindable(null) }: { value: number | null } = $props();

	function pick(n: number) {
		value = n;
	}
</script>

<div class="rating">
	<div class="top">
		<div class="buttons" role="group" aria-label="Rating">
			{#each [1, 2, 3, 4, 5] as n (n)}
				<button
					type="button"
					class="star"
					class:on={(value ?? 0) >= n - 0.05}
					aria-label="{n} star{n > 1 ? 's' : ''}"
					aria-pressed={value != null && Math.round(value) === n}
					onclick={() => pick(n)}>★</button
				>
			{/each}
		</div>
		<output class="value">{value == null ? '–' : value.toFixed(1)}</output>
	</div>
	<label class="visually-hidden" for="rating-slider">Fine-tune rating</label>
	<input
		id="rating-slider"
		type="range"
		min="0"
		max="5"
		step="0.1"
		value={value ?? 0}
		oninput={(e) => (value = Number(e.currentTarget.value))}
	/>
</div>

<style>
	.rating {
		display: grid;
		gap: var(--space-2);
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.buttons {
		display: flex;
	}
	.star {
		width: var(--tap);
		height: var(--tap);
		border: 0;
		background: none;
		font-size: 34px;
		line-height: 1;
		color: transparent;
		-webkit-text-stroke: 1.5px var(--ink-muted);
		cursor: pointer;
		padding: 0;
	}
	.star.on {
		color: var(--amber);
		-webkit-text-stroke: 1.5px var(--amber);
	}
	.value {
		font-size: 24px;
		font-weight: 700;
		min-width: 3ch;
		text-align: right;
	}
	input[type='range'] {
		width: 100%;
		accent-color: var(--amber);
		height: var(--tap);
	}
</style>

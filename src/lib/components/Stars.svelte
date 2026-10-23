<script lang="ts">
	/** Read-only star display with fractional fill (e.g. 4.3). */
	let { value, size = 20 }: { value: number | null; size?: number } = $props();
	const pct = $derived(((value ?? 0) / 5) * 100);
</script>

<span
	class="stars"
	style:--size="{size}px"
	role="img"
	aria-label={value == null ? 'Not rated' : `${value.toFixed(1)} out of 5`}
>
	<span class="row empty" aria-hidden="true">★★★★★</span>
	<span class="row full" aria-hidden="true" style:width="{pct}%">★★★★★</span>
</span>

<style>
	.stars {
		position: relative;
		display: inline-block;
		font-size: var(--size);
		line-height: 1;
		letter-spacing: 2px;
		white-space: nowrap;
	}
	.row {
		display: block;
	}
	.empty {
		color: transparent;
		-webkit-text-stroke: 1px var(--ink-muted);
	}
	.full {
		position: absolute;
		inset: 0 auto 0 0;
		overflow: hidden;
		color: var(--amber);
	}
</style>

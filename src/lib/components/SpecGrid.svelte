<script lang="ts">
	import { EMPTY } from '$lib/utils/format';

	interface Spec {
		label: string;
		value: string;
		/** Shown under the value — used for caveats, not decoration. */
		note?: string;
	}

	interface Props {
		specs: Spec[];
		columns?: 2 | 3 | 4;
		/**
		 * When false (the default) rows with no data are still rendered as an em
		 * dash. Showing the gap is more honest than hiding the row and implying
		 * the spec does not apply.
		 */
		hideEmpty?: boolean;
	}

	let { specs, columns = 2, hideEmpty = false }: Props = $props();

	const visible = $derived(hideEmpty ? specs.filter((s) => s.value !== EMPTY) : specs);
	const gridClass = $derived(
		columns === 4
			? 'grid-cols-2 md:grid-cols-4'
			: columns === 3
				? 'grid-cols-2 md:grid-cols-3'
				: 'grid-cols-2'
	);
</script>

<dl class="grid {gridClass} bg-graphite gap-px overflow-hidden rounded-lg">
	{#each visible as spec (spec.label)}
		<div class="bg-charcoal px-4 py-3">
			<dt class="stencil">{spec.label}</dt>
			<dd
				class="numeral mt-1 text-base {spec.value === EMPTY ? 'text-dim' : 'text-bone'}"
				title={spec.value === EMPTY ? 'Not published by the data source' : undefined}
			>
				{spec.value}
			</dd>
			{#if spec.note}
				<p class="text-dim mt-1 text-[11px] leading-snug">{spec.note}</p>
			{/if}
		</div>
	{/each}
</dl>

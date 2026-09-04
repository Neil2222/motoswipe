<script lang="ts">
	/**
	 * Step controls for a card that carries several photographs: a dot per
	 * image along the top edge and a chevron on each side.
	 *
	 * Overlaid on whatever shows the photograph, so the swipe deck, the
	 * comparison arena and the results page share one behaviour. Renders
	 * nothing for a single image. The chevrons are real buttons, which the
	 * swipe deck deliberately leaves alone when a drag starts on one.
	 */
	interface Props {
		count: number;
		active: number;
		onstep: (delta: 1 | -1) => void;
		/** Accessible name of the thing being paged, e.g. "Kawasaki Z900". */
		label: string;
	}

	let { count, active, onstep, label }: Props = $props();
</script>

{#if count > 1}
	<div
		class="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center gap-1 px-10 pt-2"
		aria-hidden="true"
	>
		{#each { length: count } as _, index (index)}
			<span
				class="h-0.5 flex-1 rounded-full transition-colors duration-200 {index === active
					? 'bg-bone'
					: 'bg-white/30'}"
				style="max-width: 3rem"
			></span>
		{/each}
	</div>

	<button
		type="button"
		class="text-bone absolute top-1/2 left-2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-lg transition-colors hover:bg-black/70"
		onclick={(event) => {
			event.stopPropagation();
			onstep(-1);
		}}
		aria-label="Previous photograph of {label}"
	>
		‹
	</button>
	<button
		type="button"
		class="text-bone absolute top-1/2 right-2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-lg transition-colors hover:bg-black/70"
		onclick={(event) => {
			event.stopPropagation();
			onstep(1);
		}}
		aria-label="Next photograph of {label}"
	>
		›
	</button>

	<span
		class="numeral text-bone absolute top-3 right-3 z-10 rounded-full bg-black/50 px-2 py-0.5 text-[11px]"
	>
		{active + 1}/{count}
	</span>
{/if}

<script lang="ts">
	/**
	 * Step controls for a card that carries several photographs: a dot per
	 * image along the top edge, a counter, and the whole left and right edge
	 * of the photograph as previous / next zones.
	 *
	 * The zones are the full height of the card and about a fifth of its
	 * width each, so on a phone a thumb finds them without aiming. Tapping the
	 * middle of the photograph does nothing here: on the swipe deck a tap must
	 * not mean "next photo" while on the comparison page it means "pick this",
	 * and one gesture with two meanings is a habit nobody should learn.
	 *
	 * Renders nothing for a single image. With `passive` the zones are drawn
	 * but do not take pointer events — the swipe deck needs every pixel of the
	 * card for its drag and resolves taps on the zones itself by position.
	 */
	interface Props {
		count: number;
		active: number;
		onstep: (delta: 1 | -1) => void;
		/** Accessible name of the thing being paged, e.g. "Kawasaki Z900". */
		label: string;
		/** Draw the zones only; a parent handles the taps. */
		passive?: boolean;
	}

	let { count, active, onstep, label, passive = false }: Props = $props();

	/** Fraction of the width each edge zone takes. Mirrored in SwipeDeck. */
	const EDGE_ZONE = 0.22;
	const glyph =
		'text-bone flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-base';
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

	{#if passive}
		<div
			class="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-2"
			style="width: {EDGE_ZONE * 100}%"
			aria-hidden="true"
		>
			<span class={glyph}>‹</span>
		</div>
		<div
			class="pointer-events-none absolute inset-y-0 right-0 z-10 flex items-center justify-end pr-2"
			style="width: {EDGE_ZONE * 100}%"
			aria-hidden="true"
		>
			<span class={glyph}>›</span>
		</div>
	{:else}
		<button
			type="button"
			class="group absolute inset-y-0 left-0 z-10 flex items-center pl-2 hover:bg-gradient-to-r hover:from-black/35 hover:to-transparent"
			style="width: {EDGE_ZONE * 100}%"
			onclick={(event) => {
				event.stopPropagation();
				onstep(-1);
			}}
			aria-label="Previous photograph of {label}"
		>
			<span class="{glyph} transition-colors group-hover:bg-black/70">‹</span>
		</button>
		<button
			type="button"
			class="group absolute inset-y-0 right-0 z-10 flex items-center justify-end pr-2 hover:bg-gradient-to-l hover:from-black/35 hover:to-transparent"
			style="width: {EDGE_ZONE * 100}%"
			onclick={(event) => {
				event.stopPropagation();
				onstep(1);
			}}
			aria-label="Next photograph of {label}"
		>
			<span class="{glyph} transition-colors group-hover:bg-black/70">›</span>
		</button>
	{/if}

	<span
		class="numeral text-bone pointer-events-none absolute top-3 right-3 z-10 rounded-full bg-black/60 px-2 py-0.5 text-[11px]"
	>
		{active + 1}/{count}
	</span>
{/if}

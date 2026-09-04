<script lang="ts">
	import { CATEGORY_LABELS, type MotorcycleCategory } from '$lib/domain/enums';
	import { describeYears, type CardBike } from '$lib/domain/view-types';
	import BikePhoto from './BikePhoto.svelte';

	/**
	 * One card in the swipe deck.
	 *
	 * The image is the product. Text is limited to what you would read off the
	 * side of the bike — make, model, year, category — because the premise is
	 * reacting to how it looks before reading a spec sheet. Details sit behind
	 * the info button, one tap away and no closer.
	 */
	interface Props {
		bike: CardBike;
		/** Index in the stack: 0 is the live card, 1 and 2 sit behind it. */
		depth?: number;
		/** Eager-load the top two so a swipe never reveals a blank. */
		priority?: boolean;
		oninfo?: () => void;
	}

	let { bike, depth = 0, priority = false, oninfo }: Props = $props();

	const imageUrl = $derived(bike.images[0]?.url);
	/** Our own generated artwork is portrait and designed to bleed to the edges. */
	const isPlaceholder = $derived(Boolean(imageUrl?.startsWith('/img/placeholder/')));
	const years = $derived(describeYears(bike));
	const categoryLabel = $derived(
		CATEGORY_LABELS[bike.category as MotorcycleCategory] ?? bike.category
	);
</script>

<article
	class="panel bg-ink relative flex h-full w-full flex-col overflow-hidden select-none"
	aria-label="{bike.manufacturer.name} {bike.model}"
>
	<!-- Generated placeholders are drawn portrait and are meant to fill the card;
	     real photographs are landscape and must not be cropped. -->
	<BikePhoto
		url={imageUrl}
		alt="{bike.manufacturer.name} {bike.model}"
		{priority}
		fill={isPlaceholder}
		class="absolute inset-0"
	/>
	<!-- Readability scrim. Two stops so the top stays dark enough for the chips
	     without washing out the middle of the bike. -->
	<div
		class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/45"
		aria-hidden="true"
	></div>

	<div class="relative flex items-start justify-between p-4">
		<span class="chip bg-black/50 backdrop-blur-sm">{categoryLabel}</span>
		{#if depth === 0 && oninfo}
			<button
				type="button"
				class="border-graphite text-ash hover:text-bone hover:border-chrome flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-black/50 font-serif text-base font-bold italic backdrop-blur-sm transition-colors"
				onclick={oninfo}
				aria-label="Show specifications"
			>
				i
			</button>
		{/if}
	</div>

	<div class="relative mt-auto p-5 pb-6">
		<p class="stencil text-sodium/90 mb-1.5">{bike.manufacturer.name}</p>
		<h2 class="display text-bone text-[clamp(1.9rem,7vw,2.75rem)] leading-[0.9]">
			{bike.model}
		</h2>
		{#if bike.variant}
			<p class="display text-ash mt-1 text-lg">{bike.variant}</p>
		{/if}
		{#if years}
			<p class="numeral text-dim mt-2 text-sm tracking-widest">{years}</p>
		{/if}
	</div>
</article>

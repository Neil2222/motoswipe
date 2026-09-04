<script lang="ts">
	/**
	 * A motorcycle photograph, shown whole.
	 *
	 * The problem this solves: imported photographs are overwhelmingly landscape
	 * (968 of 1,029 from Wikimedia, averaging 4:3), and a swipe card is portrait —
	 * about 0.53:1 on a phone. Filling that card with `object-fit: cover` throws
	 * away roughly 60% of the width, so you get a fuel tank and half an engine
	 * instead of a motorcycle. For an app whose entire premise is reacting to how
	 * a bike looks, that is not a cosmetic problem.
	 *
	 * So the photo is `contain`ed — always whole, never cropped — over a blurred,
	 * scaled copy of itself that fills the frame. Same technique as album art in
	 * a music player, and for the same reason: it keeps the subject intact while
	 * still filling an awkward aspect ratio.
	 *
	 * Both layers use the same `src`, so the browser fetches it once.
	 *
	 * The caller supplies the positioning — `absolute inset-0` to fill a card, or
	 * `relative aspect-4/5` to sit in normal flow. This component deliberately
	 * sets no `position` of its own: doing so put `relative` and the caller's
	 * `absolute` in the same class list, Tailwind emits `.relative` last, and the
	 * element collapsed to zero height with the photograph invisible.
	 */
	interface Props {
		url: string | undefined;
		alt: string;
		/** Eager-load for cards the user is about to see. */
		priority?: boolean;
		/**
		 * Portrait placeholders are drawn to fill the frame, so they should cover
		 * rather than letterbox inside their own generated background.
		 */
		fill?: boolean;
		class?: string;
	}

	let { url, alt, priority = false, fill = false, class: className = '' }: Props = $props();

	let loaded = $state(false);
	let failed = $state(false);
</script>

<div class="bg-ink overflow-hidden {className}">
	{#if !loaded && !failed}
		<div class="skeleton absolute inset-0 rounded-none" aria-hidden="true"></div>
	{/if}

	{#if url && !failed}
		{#if !fill}
			<!-- Backdrop.
			     Scaled well past the edges so the blur never reveals a hard border,
			     and saturated because most of these are dark photographs of dark
			     motorcycles — at low opacity they turn to black and the card reads
			     as broken letterboxing rather than a deliberate frame. -->
			<img
				src={url}
				alt=""
				aria-hidden="true"
				class="absolute inset-0 h-full w-full scale-150 object-cover opacity-80 blur-3xl saturate-150 transition-opacity duration-500"
				class:opacity-0={!loaded}
				draggable="false"
				loading={priority ? 'eager' : 'lazy'}
				decoding="async"
			/>
		{/if}

		<img
			src={url}
			{alt}
			class="absolute inset-0 h-full w-full transition-opacity duration-300 {fill
				? 'object-cover'
				: 'object-contain'}"
			class:opacity-0={!loaded}
			draggable="false"
			loading={priority ? 'eager' : 'lazy'}
			fetchpriority={priority ? 'high' : 'auto'}
			decoding="async"
			onload={() => (loaded = true)}
			onerror={() => {
				failed = true;
				loaded = true;
			}}
		/>
	{/if}

	{#if failed || !url}
		<div class="text-dim absolute inset-0 flex items-center justify-center text-xs">
			No photograph
		</div>
	{/if}
</div>

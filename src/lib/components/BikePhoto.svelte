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
	 * The backdrop is promoted to its own compositor layer (`will-change`) so
	 * the blur is rasterised once and then merely moved while a card is dragged
	 * or rotated. Nothing on a card uses `backdrop-filter`: that has to resample
	 * whatever is underneath on every frame, which on a phone is the difference
	 * between a swipe that follows the thumb and one that stutters.
	 *
	 * Pinch to zoom is built in: two fingers on the photograph zoom it, lifting
	 * them springs it back, and the click that a lifted finger would otherwise
	 * fire on the surrounding link or button is swallowed. One finger still
	 * scrolls the page (`touch-action: pan-y`). The swipe deck switches this off
	 * and runs its own pinch, because there the second finger also has to
	 * cancel a drag in progress.
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
		/** Two-finger zoom. Off where a parent handles the gesture itself. */
		pinch?: boolean;
		/**
		 * The blurred, scaled copy behind a letterboxed photograph. Right for
		 * one card on screen; off in a grid, where forty of them — each a
		 * full-size image blurred by 40 px on its own compositor layer — made
		 * scrolling the browse page stall a fast desktop.
		 */
		backdrop?: boolean;
		class?: string;
	}

	let {
		url,
		alt,
		priority = false,
		fill = false,
		pinch = true,
		backdrop = true,
		class: className = ''
	}: Props = $props();

	let loaded = $state(false);
	let failed = $state(false);

	// --- Pinch ---------------------------------------------------------------
	const MAX_ZOOM = 4;
	// Plain bookkeeping of touch points, read only inside event handlers;
	// nothing renders from it, so it must not be reactive state.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const pointers = new Map<number, { x: number; y: number }>();
	let zoom = $state<{ scale: number; x: number; y: number; ox: number; oy: number } | null>(null);
	let start: { dist: number; mx: number; my: number } | null = null;
	/** Set for a moment after a pinch so the release does not count as a click. */
	let swallowClick = false;

	function geometry() {
		const [a, b] = [...pointers.values()];
		return { dist: Math.hypot(b.x - a.x, b.y - a.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
	}

	function onpointerdown(event: PointerEvent) {
		if (!pinch || event.pointerType !== 'touch') return;
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pointers.size !== 2) return;
		const el = event.currentTarget as HTMLElement;
		for (const id of pointers.keys()) {
			try {
				el.setPointerCapture(id);
			} catch {
				/* a pointer that is already gone */
			}
		}
		const rect = el.getBoundingClientRect();
		start = geometry();
		zoom = { scale: 1, x: 0, y: 0, ox: start.mx - rect.left, oy: start.my - rect.top };
	}

	function onpointermove(event: PointerEvent) {
		if (!pointers.has(event.pointerId)) return;
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (!start || !zoom || pointers.size < 2) return;
		const now = geometry();
		zoom = {
			...zoom,
			scale: Math.min(MAX_ZOOM, Math.max(1, now.dist / Math.max(start.dist, 1))),
			x: now.mx - start.mx,
			y: now.my - start.my
		};
		event.preventDefault();
	}

	function onpointerup(event: PointerEvent) {
		pointers.delete(event.pointerId);
		if (!start) return;
		start = null;
		zoom = null;
		swallowClick = true;
		setTimeout(() => (swallowClick = false), 400);
	}

	function onclickcapture(event: MouseEvent) {
		if (!swallowClick) return;
		event.preventDefault();
		event.stopPropagation();
	}
</script>

<!-- The pointer handlers are a zoom enhancement on a picture, not a control:
     nothing can be done here that cannot be done without them, so there is no
     role to announce. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="bg-ink overflow-hidden {className}"
	style:touch-action={pinch ? 'pan-y' : undefined}
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	onpointercancel={onpointerup}
	{onclickcapture}
>
	{#if !loaded && !failed}
		<div class="skeleton absolute inset-0 rounded-none" aria-hidden="true"></div>
	{/if}

	{#if url && !failed}
		<div
			class="absolute inset-0"
			style:transform={zoom
				? `translate3d(${zoom.x}px, ${zoom.y}px, 0) scale(${zoom.scale})`
				: 'none'}
			style:transform-origin={zoom ? `${zoom.ox}px ${zoom.oy}px` : undefined}
			style:transition={zoom ? 'none' : 'transform 0.28s var(--ease-mech)'}
		>
			{#if !fill && backdrop}
				<!-- Backdrop.
				     Scaled well past the edges so the blur never reveals a hard border,
				     and saturated because most of these are dark photographs of dark
				     motorcycles — at low opacity they turn to black and the card reads
				     as broken letterboxing rather than a deliberate frame. -->
				<img
					src={url}
					alt=""
					aria-hidden="true"
					class="absolute inset-0 h-full w-full scale-150 object-cover opacity-80 blur-2xl saturate-150 transition-opacity duration-500 will-change-transform"
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
		</div>
	{/if}

	{#if failed || !url}
		<div class="text-dim absolute inset-0 flex items-center justify-center text-xs">
			No photograph
		</div>
	{/if}
</div>

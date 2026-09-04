<script lang="ts" generics="T extends CardBike">
	import MotorcycleCard from './MotorcycleCard.svelte';
	import type { SwipeDecision } from '$lib/domain/enums';
	import type { CardBike } from '$lib/domain/view-types';

	/**
	 * The swipe deck.
	 *
	 * Constraints that shaped this:
	 *
	 *  - The gesture must feel physical. The card follows the pointer 1:1 and
	 *    rotates proportionally to horizontal travel, which reads as a hinge
	 *    rather than a slide.
	 *  - Nothing waits on the network. A decision animates out immediately; the
	 *    parent fires the request and reconciles.
	 *  - Pointer Events only. Separate mouse and touch paths duplicate state and
	 *    disagree on hybrid devices.
	 *  - The gesture locks to an axis after ~12 px. Without that, a slightly
	 *    diagonal swipe flickers between LIKE and SUPERLIKE.
	 */
	interface Props {
		cards: T[];
		onDecision: (bike: T, decision: SwipeDecision) => void;
		oninfo?: (bike: T) => void;
		/** Blocks input while the queue refills. */
		busy?: boolean;
	}

	let { cards, onDecision, oninfo, busy = false }: Props = $props();

	/** Fraction of card width past which a release commits. */
	const COMMIT_RATIO = 0.28;
	/** Vertical travel that commits a superlike (up) or skip (down). */
	const VERTICAL_COMMIT = 110;
	/** A fast flick commits regardless of distance, in px/ms. */
	const VELOCITY_COMMIT = 0.6;

	let container = $state<HTMLDivElement | null>(null);

	let dragging = $state(false);
	let dx = $state(0);
	let dy = $state(0);
	let axis = $state<'x' | 'y' | null>(null);
	/** Non-null while a card animates off-screen. */
	let flying = $state<SwipeDecision | null>(null);
	let width = $state(340);

	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	let startTime = 0;
	let lastX = 0;
	let lastY = 0;
	let lastTime = 0;
	let velocityX = 0;
	let velocityY = 0;

	const visible = $derived(cards.slice(0, 3));
	const top = $derived(visible[0] ?? null);

	/**
	 * Which photograph each card shows, by bike id. Kept here rather than in
	 * the card so the choice survives the card being re-rendered as it moves
	 * up the stack. A tap on the left or right half of the live card steps;
	 * so do the chevrons and the keyboard.
	 */
	let imageIndex = $state<Record<string, number>>({});

	export function stepImage(delta: 1 | -1) {
		if (!top || top.images.length < 2) return;
		const n = top.images.length;
		imageIndex[top.id] = ((((imageIndex[top.id] ?? 0) + delta) % n) + n) % n;
	}

	/** A press that never became a drag: short, and barely moved. */
	const TAP_DISTANCE = 8;
	const TAP_TIME = 350;

	/**
	 * Pinch to zoom.
	 *
	 * The first thing a thumb does with a photograph on a phone is spread to
	 * look closer, and on a swipe deck that used to throw the card sideways.
	 * A second finger now cancels whatever drag was in progress and zooms the
	 * photograph instead — a peek, not a mode: lifting the fingers springs it
	 * back, and the finger left behind is ignored until it lifts too, so the
	 * end of a pinch can never register as a swipe.
	 */
	const MAX_ZOOM = 4;
	// Plain bookkeeping of touch points, read only inside event handlers;
	// nothing renders from it, so it must not be reactive state.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const pointers = new Map<number, { x: number; y: number }>();
	let zoom = $state<{ scale: number; x: number; y: number; ox: number; oy: number } | null>(null);
	let pinchStart: { dist: number; mx: number; my: number } | null = null;
	/** After a pinch, the remaining finger must not start a swipe. */
	let pinchTail = false;

	function pinchGeometry() {
		const [a, b] = [...pointers.values()];
		return {
			dist: Math.hypot(b.x - a.x, b.y - a.y),
			mx: (a.x + b.x) / 2,
			my: (a.y + b.y) / 2
		};
	}

	// Stamp opacities. Clamped, and zeroed on the locked-out axis so only one
	// stamp is ever visible.
	const commitDistance = $derived(Math.max(width * COMMIT_RATIO, 60));
	const likeStrength = $derived(axis === 'y' ? 0 : clamp(dx / commitDistance));
	const nopeStrength = $derived(axis === 'y' ? 0 : clamp(-dx / commitDistance));
	const superStrength = $derived(axis === 'x' ? 0 : clamp(-dy / VERTICAL_COMMIT));
	const skipStrength = $derived(axis === 'x' ? 0 : clamp(dy / VERTICAL_COMMIT));

	function clamp(value: number): number {
		return Math.max(0, Math.min(1, value));
	}

	/**
	 * Transform for the live card. Rotation of 0.045deg per pixel puts the card
	 * at roughly 14 degrees when it reaches the commit threshold.
	 */
	const topTransform = $derived(
		`translate3d(${dx}px, ${dy}px, 0) rotate(${(dx * 0.045).toFixed(3)}deg)`
	);

	const topTransition = $derived(
		dragging
			? 'none'
			: flying
				? 'transform 0.34s cubic-bezier(0.32, 0, 0.67, 0), opacity 0.3s linear'
				: 'transform 0.42s var(--ease-snap)'
	);

	$effect(() => {
		if (!container) return;
		const observer = new ResizeObserver(() => {
			width = container?.clientWidth ?? 340;
		});
		observer.observe(container);
		width = container.clientWidth;
		return () => observer.disconnect();
	});

	function onpointerdown(event: PointerEvent) {
		if (busy || flying || !top) return;
		if (event.button !== 0) return;

		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pointers.size === 2) {
			// Second finger: the drag, if any, is abandoned and the pinch begins.
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
			dragging = false;
			pointerId = null;
			reset();
			const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
			const start = pinchGeometry();
			pinchStart = start;
			zoom = { scale: 1, x: 0, y: 0, ox: start.mx - rect.left, oy: start.my - rect.top };
			return;
		}
		if (pointers.size > 2 || pinchTail) return;

		// Let the info button receive its own click.
		if ((event.target as HTMLElement).closest('button')) return;

		pointerId = event.pointerId;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

		dragging = true;
		axis = null;
		startX = lastX = event.clientX;
		startY = lastY = event.clientY;
		startTime = lastTime = event.timeStamp;
		velocityX = 0;
		velocityY = 0;
	}

	function onpointermove(event: PointerEvent) {
		if (pointers.has(event.pointerId)) {
			pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		}
		if (pinchStart && zoom && pointers.size >= 2) {
			const now = pinchGeometry();
			zoom = {
				...zoom,
				scale: Math.min(MAX_ZOOM, Math.max(1, now.dist / Math.max(pinchStart.dist, 1))),
				x: now.mx - pinchStart.mx,
				y: now.my - pinchStart.my
			};
			return;
		}
		if (!dragging || event.pointerId !== pointerId) return;

		const rawDx = event.clientX - startX;
		const rawDy = event.clientY - startY;

		if (axis === null && (Math.abs(rawDx) > 12 || Math.abs(rawDy) > 12)) {
			axis = Math.abs(rawDx) > Math.abs(rawDy) ? 'x' : 'y';
		}

		dx = axis === 'y' ? 0 : rawDx;
		dy = axis === 'x' ? 0 : rawDy;

		const dt = event.timeStamp - lastTime;
		if (dt > 0) {
			velocityX = (event.clientX - lastX) / dt;
			velocityY = (event.clientY - lastY) / dt;
			lastX = event.clientX;
			lastY = event.clientY;
			lastTime = event.timeStamp;
		}
	}

	function onpointerup(event: PointerEvent) {
		pointers.delete(event.pointerId);

		if (pinchStart) {
			// First finger up ends the pinch; the photograph springs back and
			// the other finger is inert until it lifts.
			pinchStart = null;
			zoom = null;
			pinchTail = pointers.size > 0;
			return;
		}
		if (pinchTail) {
			if (pointers.size === 0) pinchTail = false;
			return;
		}

		if (!dragging || event.pointerId !== pointerId) return;
		dragging = false;
		pointerId = null;

		// A flick shorter than 60 ms is usually a tap with jitter, not a swipe.
		const flicked = event.timeStamp - startTime > 40;

		const horizontal =
			Math.abs(dx) > commitDistance || (flicked && Math.abs(velocityX) > VELOCITY_COMMIT);
		const vertical =
			Math.abs(dy) > VERTICAL_COMMIT || (flicked && Math.abs(velocityY) > VELOCITY_COMMIT);

		if (axis === 'x' && horizontal) commit(dx > 0 ? 'LIKE' : 'DISLIKE');
		else if (axis === 'y' && vertical) commit(dy < 0 ? 'SUPERLIKE' : 'SKIP');
		else {
			const travelled = Math.hypot(event.clientX - startX, event.clientY - startY);
			if (travelled < TAP_DISTANCE && event.timeStamp - startTime < TAP_TIME) {
				// Tinder convention: tap the right half for the next photograph,
				// the left half for the previous one.
				const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
				stepImage(event.clientX - rect.left > rect.width / 2 ? 1 : -1);
			}
			reset();
		}
	}

	function reset() {
		dx = 0;
		dy = 0;
		axis = null;
	}

	function commit(decision: SwipeDecision) {
		if (!top || flying) return;

		const bike = top;
		flying = decision;

		// Throw the card clear of the viewport in the decision's direction.
		const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
		switch (decision) {
			case 'LIKE':
				dx = width * 1.7;
				dy = dy - 40;
				break;
			case 'DISLIKE':
				dx = -width * 1.7;
				dy = dy - 40;
				break;
			case 'SUPERLIKE':
				dy = -viewportHeight;
				break;
			default:
				dy = viewportHeight;
				break;
		}

		// Hand the decision up once the card has cleared the frame. The parent
		// removes it from `cards`, at which point the next card is already in
		// place underneath and the transform resets for the recycled node.
		setTimeout(() => {
			onDecision(bike, decision);
			flying = null;
			reset();
		}, 260);
	}

	/** Invoked by the action buttons and keyboard shortcuts. */
	export function decide(decision: SwipeDecision) {
		if (busy || flying || !top) return;
		// Seed a small offset so a button press departs like a drag rather than
		// teleporting.
		axis = decision === 'LIKE' || decision === 'DISLIKE' ? 'x' : 'y';
		dx = decision === 'LIKE' ? 40 : decision === 'DISLIKE' ? -40 : 0;
		dy = decision === 'SUPERLIKE' ? -40 : decision === 'SKIP' ? 40 : 0;
		commit(decision);
	}

	export function isBusy(): boolean {
		return flying !== null;
	}
</script>

<div
	bind:this={container}
	class="no-touch-pan relative h-full w-full"
	role="group"
	aria-roledescription="Swipe deck"
	aria-label="Motorcycle deck"
>
	{#each visible as bike, index (bike.id)}
		{@const isTop = index === 0}
		<div
			class="absolute inset-0"
			role="group"
			aria-roledescription="Draggable motorcycle card"
			aria-label="{bike.manufacturer.name} {bike.model}"
			aria-hidden={isTop ? undefined : 'true'}
			style:z-index={10 - index}
			style:transform={isTop
				? topTransform
				: `translate3d(0, ${index * 12}px, 0) scale(${1 - index * 0.045})`}
			style:transition={isTop ? topTransition : 'transform 0.35s var(--ease-mech), opacity 0.35s'}
			style:opacity={isTop ? (flying ? 0 : 1) : index === 1 ? 0.9 : 0.55}
			style:pointer-events={isTop && !flying ? 'auto' : 'none'}
			style:will-change={isTop ? 'transform' : undefined}
			onpointerdown={isTop ? onpointerdown : undefined}
			onpointermove={isTop ? onpointermove : undefined}
			onpointerup={isTop ? onpointerup : undefined}
			onpointercancel={isTop ? onpointerup : undefined}
		>
			<MotorcycleCard
				{bike}
				depth={index}
				priority={index < 2}
				oninfo={isTop && oninfo ? () => oninfo(bike) : undefined}
				activeImage={imageIndex[bike.id] ?? 0}
				onstep={isTop ? stepImage : undefined}
				zoom={isTop ? zoom : null}
			/>

			{#if isTop}
				<!-- Decision stamps: rotated, outlined, readable at a glance mid-drag. -->
				<div
					class="pointer-events-none absolute top-8 left-5"
					style:opacity={likeStrength}
					style:transform="rotate(-12deg) scale({0.86 + likeStrength * 0.14})"
					aria-hidden="true"
				>
					<span
						class="display border-like text-like block rounded-lg border-4 px-4 py-1.5 text-3xl tracking-wider"
					>
						Like
					</span>
				</div>

				<div
					class="pointer-events-none absolute top-8 right-5"
					style:opacity={nopeStrength}
					style:transform="rotate(12deg) scale({0.86 + nopeStrength * 0.14})"
					aria-hidden="true"
				>
					<span
						class="display border-nope text-nope block rounded-lg border-4 px-4 py-1.5 text-3xl tracking-wider"
					>
						Nope
					</span>
				</div>

				<div
					class="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center"
					style:opacity={superStrength}
					style:transform="scale({0.86 + superStrength * 0.14})"
					aria-hidden="true"
				>
					<span
						class="display border-superlike text-superlike block rounded-lg border-4 px-5 py-1.5 text-2xl tracking-wider"
					>
						Superlike
					</span>
				</div>

				<div
					class="pointer-events-none absolute inset-x-0 top-1/2 flex justify-center"
					style:opacity={skipStrength}
					aria-hidden="true"
				>
					<span
						class="display border-skip text-skip block rounded-lg border-4 px-5 py-1.5 text-2xl tracking-wider"
					>
						Skip
					</span>
				</div>
			{/if}
		</div>
	{/each}
</div>

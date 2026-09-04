<script lang="ts">
	import { fade } from 'svelte/transition';
	import SwipeDeck from '$lib/components/SwipeDeck.svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import { CATEGORY_LABELS, type MotorcycleCategory, type SwipeDecision } from '$lib/domain/enums';
	import type { CardBikeDetail, SwipeProgress } from '$lib/domain/view-types';
	import { money, progressWidth, unit } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/**
	 * Local deck state.
	 *
	 * The server load seeds it once; from then on the page owns it and never
	 * re-runs the load, because a load would rebuild the deck under the user's
	 * thumb. Every decision is fired at the API and the response carries fresh
	 * progress plus a top-up when we are running low.
	 */
	// svelte-ignore state_referenced_locally
	let cards = $state<CardBikeDetail[]>([...data.cards]);
	// svelte-ignore state_referenced_locally
	let progress = $state<SwipeProgress>({ ...data.progress });
	// svelte-ignore state_referenced_locally
	let seededRound = $state(data.round.id);

	/** Ids in flight: reported to the server but not yet reflected in a top-up. */
	let inFlight = $state<string[]>([]);
	let refilling = $state(false);
	let deck = $state<ReturnType<typeof SwipeDeck> | null>(null);

	/** Last decision, for undo. */
	let lastDecision = $state<{ bike: CardBikeDetail; decision: SwipeDecision } | null>(null);

	let showInfo = $state<CardBikeDetail | null>(null);
	let showHelp = $state(false);

	const REFILL_THRESHOLD = 4;
	const finished = $derived(cards.length === 0 && !refilling);

	/**
	 * Client-side navigation between two swipe pages reuses this component, so
	 * the local deck has to be re-seeded when the round changes. Without this,
	 * opening a second round would show the first round's cards.
	 */
	$effect(() => {
		if (data.round.id === seededRound) return;
		seededRound = data.round.id;
		cards = [...data.cards];
		progress = { ...data.progress };
		lastDecision = null;
		inFlight = [];
		showInfo = null;
	});

	/**
	 * Preload the images for the next few cards. Without this a fast swiper hits
	 * a blank card while the browser fetches — the single most damaging thing
	 * that can happen to the feel of the deck.
	 */
	$effect(() => {
		for (const card of cards.slice(1, 5)) {
			const url = card.images[0]?.url;
			if (!url) continue;
			const img = new Image();
			img.decoding = 'async';
			img.src = url;
		}
	});

	async function onDecision(bike: CardBikeDetail, decision: SwipeDecision) {
		// Optimistic: drop the card and update the counters immediately, then
		// reconcile with whatever the server says.
		cards = cards.filter((c) => c.id !== bike.id);
		inFlight = [...inFlight, bike.id];
		lastDecision = { bike, decision };

		progress = {
			...progress,
			swiped: progress.swiped + 1,
			remaining: Math.max(progress.remaining - 1, 0),
			likes: progress.likes + (decision === 'LIKE' ? 1 : 0),
			superlikes: progress.superlikes + (decision === 'SUPERLIKE' ? 1 : 0),
			dislikes: progress.dislikes + (decision === 'DISLIKE' ? 1 : 0),
			skips: progress.skips + (decision === 'SKIP' ? 1 : 0),
			shortlist: progress.shortlist + (decision === 'LIKE' || decision === 'SUPERLIKE' ? 1 : 0)
		};

		if (decision === 'SUPERLIKE') {
			toasts.push(`Superliked ${bike.manufacturer.name} ${bike.model}`, 'superlike');
		}

		const needed = cards.length <= REFILL_THRESHOLD ? data.batchSize : 0;
		if (needed > 0) refilling = true;

		try {
			const exclude = [...cards.map((c) => c.id), ...inFlight, bike.id].join(',');
			const response = await fetch(
				`/api/rounds/${data.round.id}/swipes?more=${needed}&exclude=${encodeURIComponent(exclude)}`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ motorcycleId: bike.id, decision })
				}
			);

			if (!response.ok) throw new Error(await responseMessage(response));

			const result = (await response.json()) as {
				progress: SwipeProgress;
				cards: CardBikeDetail[];
			};

			progress = result.progress;
			if (result.cards.length) appendCards(result.cards);
		} catch (error) {
			// Put the card back rather than silently losing the decision.
			cards = [bike, ...cards];
			progress = { ...data.progress, ...progress, swiped: progress.swiped - 1 };
			lastDecision = null;
			toasts.error(
				error instanceof Error ? error.message : 'Could not save that swipe. Try again.'
			);
			await refreshProgress();
		} finally {
			inFlight = inFlight.filter((id) => id !== bike.id);
			refilling = false;
		}

		// A refill may still be needed if the response carried nothing.
		if (cards.length <= REFILL_THRESHOLD) void topUp();
	}

	function appendCards(incoming: CardBikeDetail[]) {
		const known = new Set(cards.map((c) => c.id));
		cards = [...cards, ...incoming.filter((c) => !known.has(c.id))];
	}

	async function topUp() {
		if (refilling) return;
		refilling = true;
		try {
			const exclude = [...cards.map((c) => c.id), ...inFlight].join(',');
			const response = await fetch(
				`/api/rounds/${data.round.id}/deck?limit=${data.batchSize}&exclude=${encodeURIComponent(exclude)}`
			);
			if (!response.ok) return;
			const result = (await response.json()) as { cards: CardBikeDetail[] };
			appendCards(result.cards);
		} catch {
			// Non-fatal: the deck simply stays as it is and the user can retry.
		} finally {
			refilling = false;
		}
	}

	async function refreshProgress() {
		try {
			const response = await fetch(`/api/rounds/${data.round.id}/progress`);
			if (!response.ok) return;
			progress = (await response.json()) as SwipeProgress;
		} catch {
			/* leave the optimistic counters in place */
		}
	}

	async function undo() {
		if (!lastDecision) return;
		const { bike } = lastDecision;
		lastDecision = null;

		try {
			const response = await fetch(`/api/rounds/${data.round.id}/swipes`, {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ motorcycleId: bike.id })
			});
			if (!response.ok) throw new Error('Undo failed');

			const result = (await response.json()) as { progress: SwipeProgress };
			progress = result.progress;
			cards = [bike, ...cards.filter((c) => c.id !== bike.id)];
			toasts.info('Put back on the deck');
		} catch {
			toasts.error('Could not undo that.');
		}
	}

	async function responseMessage(response: Response): Promise<string> {
		try {
			const body = await response.json();
			return body?.message ?? `Request failed (${response.status})`;
		} catch {
			return `Request failed (${response.status})`;
		}
	}

	function onkeydown(event: KeyboardEvent) {
		if (showInfo || showHelp) {
			if (event.key === 'Escape') {
				showInfo = null;
				showHelp = false;
			}
			return;
		}
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if ((event.target as HTMLElement)?.tagName === 'INPUT') return;

		switch (event.key) {
			case 'ArrowLeft':
				event.preventDefault();
				deck?.decide('DISLIKE');
				break;
			case 'ArrowRight':
				event.preventDefault();
				deck?.decide('LIKE');
				break;
			case 'ArrowUp':
				event.preventDefault();
				deck?.decide('SUPERLIKE');
				break;
			case 'ArrowDown':
				event.preventDefault();
				deck?.decide('SKIP');
				break;
			case 'i':
				if (cards[0]) showInfo = cards[0];
				break;
			case 'z':
				void undo();
				break;
			case '?':
				showHelp = true;
				break;
		}
	}

	/**
	 * The shortcut list is opt-in, via the link under the action bar or the `?`
	 * key.
	 *
	 * An earlier version opened it automatically on a first visit. That put a
	 * modal in front of the one screen the whole product exists for, and — worse —
	 * it swallowed the arrow keys of anyone who simply started swiping, because
	 * the dialog takes over the keyboard. The inline hint under the buttons
	 * already names the keys.
	 */
</script>

<svelte:head><title>{data.round.name} — swiping</title></svelte:head>
<svelte:window on:keydown={onkeydown} />

<div class="flex h-dvh flex-col overflow-hidden">
	<!-- ============ Header: progress and counters ============ -->
	<header class="pt-safe shrink-0 px-4 pt-3">
		<div class="mx-auto flex max-w-lg items-center gap-3">
			<a
				href="/rounds/{data.round.id}"
				class="text-ash hover:text-bone shrink-0 text-sm transition-colors"
				aria-label="Back to round"
			>
				←
			</a>
			<div class="min-w-0 flex-1">
				<p class="text-ash truncate text-xs">{data.round.name}</p>
			</div>
			<span class="numeral text-bone shrink-0 text-sm">
				{progress.swiped}<span class="text-dim">/{progress.total}</span>
			</span>
		</div>

		<div class="mx-auto mt-2 max-w-lg">
			<div class="bg-graphite h-1 overflow-hidden rounded-full">
				<div
					class="bg-sodium h-full rounded-full transition-all duration-500"
					style:width={progressWidth(progress.swiped, progress.total)}
				></div>
			</div>

			<div class="text-dim mt-2 flex items-center justify-center gap-4 text-xs">
				<span class="numeral text-like">{progress.likes} likes</span>
				<span class="numeral text-superlike">{progress.superlikes} super</span>
				<span class="numeral">{progress.dislikes} nope</span>
				{#if progress.skips > 0}<span class="numeral">{progress.skips} skip</span>{/if}
			</div>
		</div>
	</header>

	<!-- ============ Deck ============ -->
	<div class="relative flex min-h-0 flex-1 items-center px-4 py-3">
		<!--
			The card is capped at 4:5 rather than filling the whole column.

			Imported photographs are overwhelmingly landscape (about 4:3), and they
			are shown whole rather than cropped. In a full-height card that left the
			photo occupying barely 40% of the frame with the rest blurred backdrop;
			at 4:5 it fills around 60% and the card reads as a photograph rather
			than as a small picture floating in a large box.
		-->
		<div class="relative mx-auto max-h-full w-full max-w-lg" style="aspect-ratio: 4 / 5;">
			{#if finished}
				<div
					class="panel flex h-full flex-col items-center justify-center p-8 text-center"
					transition:fade={{ duration: 200 }}
				>
					<p class="stencil text-sodium">Deck complete</p>
					<h2 class="display text-bone mt-3 text-3xl">
						{progress.shortlist > 0 ? 'That is the lot' : 'Nothing left'}
					</h2>
					<p class="text-ash mt-4 max-w-sm text-sm leading-relaxed">
						{#if progress.shortlist >= 2}
							You have {progress.shortlist} motorcycles on your shortlist. Put them head to head and find
							out which one you actually want.
						{:else if progress.shortlist === 1}
							One motorcycle made the shortlist. You need at least two to run comparisons — but the
							results page is worth a look.
						{:else}
							You went through {progress.swiped} motorcycles and liked none of them. That is a result
							too. Try a round with different filters.
						{/if}
					</p>

					<div class="mt-7 flex flex-wrap justify-center gap-3">
						{#if progress.shortlist >= 2}
							<a href="/rounds/{data.round.id}/compare" class="btn btn-primary btn-lg">
								Start comparing
							</a>
						{/if}
						{#if progress.shortlist > 0}
							<a href="/rounds/{data.round.id}/likes" class="btn btn-secondary">View shortlist</a>
						{/if}
						<a href="/rounds/{data.round.id}/results" class="btn btn-ghost">Results</a>
					</div>

					{#if lastDecision}
						<button class="btn btn-ghost btn-sm mt-6" onclick={undo}> Undo last swipe </button>
					{/if}
				</div>
			{:else if cards.length === 0}
				<!-- Refilling: a skeleton card rather than an empty frame, so the
				     layout never jumps. -->
				<div class="skeleton h-full w-full rounded-[0.875rem]" aria-busy="true"></div>
			{:else}
				<SwipeDeck
					bind:this={deck}
					{cards}
					{onDecision}
					oninfo={(bike) => (showInfo = bike)}
					busy={false}
				/>
			{/if}
		</div>
	</div>

	<!-- ============ Action bar ============ -->
	{#if !finished}
		<footer class="pb-safe shrink-0 px-4 pt-1 pb-4">
			<div class="mx-auto flex max-w-lg items-center justify-center gap-3 sm:gap-4">
				<button
					class="border-graphite hover:border-chrome text-ash hover:text-bone flex h-11 w-11 items-center justify-center rounded-full border bg-black/40 text-lg transition-colors disabled:opacity-30"
					onclick={undo}
					disabled={!lastDecision}
					aria-label="Undo last swipe"
					title="Undo (Z)"
				>
					↺
				</button>

				<button
					class="border-nope/50 text-nope hover:bg-nope/12 hover:border-nope flex h-16 w-16 items-center justify-center rounded-full border-2 bg-black/40 text-2xl transition-all active:scale-95"
					onclick={() => deck?.decide('DISLIKE')}
					aria-label="Dislike"
					title="Nope (←)"
				>
					✕
				</button>

				<button
					class="border-superlike/50 text-superlike hover:bg-superlike/12 hover:border-superlike flex h-12 w-12 items-center justify-center rounded-full border-2 bg-black/40 text-xl transition-all active:scale-95"
					onclick={() => deck?.decide('SUPERLIKE')}
					aria-label="Superlike"
					title="Superlike (↑)"
				>
					★
				</button>

				<button
					class="border-like/50 text-like hover:bg-like/12 hover:border-like flex h-16 w-16 items-center justify-center rounded-full border-2 bg-black/40 text-2xl transition-all active:scale-95"
					onclick={() => deck?.decide('LIKE')}
					aria-label="Like"
					title="Like (→)"
				>
					♥
				</button>

				<button
					class="border-graphite hover:border-chrome text-ash hover:text-bone flex h-11 w-11 items-center justify-center rounded-full border bg-black/40 text-lg transition-colors"
					onclick={() => deck?.decide('SKIP')}
					aria-label="Skip"
					title="Skip (↓)"
				>
					⤓
				</button>
			</div>

			<p class="text-dim mt-3 hidden text-center text-[11px] sm:block">
				Drag the card, or use ← → ↑ ↓ &middot;
				<button class="hover:text-ash underline" onclick={() => (showHelp = true)}>
					shortcuts
				</button>
			</p>
		</footer>
	{/if}
</div>

<!-- ============ Spec sheet ============ -->
{#if showInfo}
	{@const bike = showInfo}
	<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
		<button
			class="absolute inset-0 cursor-default bg-black/80 backdrop-blur-sm"
			onclick={() => (showInfo = null)}
			aria-label="Close specifications"
			tabindex="-1"
			transition:fade={{ duration: 150 }}
		></button>

		<div
			class="panel pb-safe relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-b-none p-6 sm:rounded-b-2xl"
			role="dialog"
			aria-modal="true"
			aria-label="Specifications"
			transition:fade={{ duration: 180 }}
		>
			<div class="flex items-start justify-between gap-4">
				<div class="min-w-0">
					<p class="stencil text-sodium">{bike.manufacturer.name}</p>
					<h2 class="display text-bone mt-1 text-2xl">{bike.model}</h2>
					{#if bike.variant}<p class="text-ash text-sm">{bike.variant}</p>{/if}
				</div>
				<button
					class="text-dim hover:text-bone shrink-0 text-2xl leading-none"
					onclick={() => (showInfo = null)}
					aria-label="Close"
				>
					&times;
				</button>
			</div>

			<dl class="bg-graphite mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg">
				{#each [{ l: 'Engine', v: unit(bike.displacementCc, 'cc') }, { l: 'Power', v: unit(bike.powerHp, 'hp') }, { l: 'Weight', v: unit(bike.wetWeightKg, 'kg') }, { l: 'Seat height', v: unit(bike.seatHeightMm, 'mm') }, { l: 'Category', v: CATEGORY_LABELS[bike.category as MotorcycleCategory] ?? String(bike.category) }, { l: 'Price', v: money(bike.msrpAmount, bike.msrpCurrency) }] as spec (spec.l)}
					<div class="bg-charcoal px-4 py-3">
						<dt class="stencil">{spec.l}</dt>
						<dd class="numeral text-bone mt-1">{spec.v}</dd>
					</div>
				{/each}
				<div class="bg-charcoal col-span-2 px-4 py-3">
					<dt class="stencil">Passenger</dt>
					<dd class="text-bone mt-1 text-sm">
						{#if bike.passengerAllowed === true}
							Supported by the manufacturer
						{:else if bike.passengerAllowed === false}
							Not supported as standard
						{:else}
							<span class="text-dim">Not published</span>
						{/if}
					</dd>
				</div>
			</dl>

			<div class="mt-5 flex gap-2">
				<a
					href="/motorcycles/{bike.id}"
					class="btn btn-secondary flex-1"
					target="_blank"
					rel="noopener"
				>
					Full details
				</a>
				<button class="btn btn-primary flex-1" onclick={() => (showInfo = null)}>
					Back to swiping
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- ============ Shortcuts ============ -->
{#if showHelp}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button
			class="absolute inset-0 cursor-default bg-black/80 backdrop-blur-sm"
			onclick={() => (showHelp = false)}
			aria-label="Close"
			tabindex="-1"
		></button>
		<div class="panel relative w-full max-w-sm p-6" role="dialog" aria-modal="true">
			<h2 class="display text-bone text-xl">Shortcuts</h2>
			<dl class="mt-5 space-y-2.5 text-sm">
				{#each [['←', 'Nope'], ['→', 'Like'], ['↑', 'Superlike'], ['↓', 'Skip'], ['I', 'Specifications'], ['Z', 'Undo']] as [key, label] (key)}
					<div class="flex items-center gap-3">
						<kbd
							class="border-graphite bg-gunmetal text-bone numeral inline-flex h-7 min-w-8 items-center justify-center rounded border px-2 text-xs"
						>
							{key}
						</kbd>
						<span class="text-ash">{label}</span>
					</div>
				{/each}
			</dl>
			<p class="text-dim mt-5 text-xs leading-relaxed">
				You can also drag the card with a mouse or your thumb. Everything is saved as you go — close
				the tab whenever you like.
			</p>
			<button class="btn btn-primary mt-5 w-full" onclick={() => (showHelp = false)}>
				Got it
			</button>
		</div>
	</div>
{/if}

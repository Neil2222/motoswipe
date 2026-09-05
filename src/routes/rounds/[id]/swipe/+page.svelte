<script lang="ts">
	import { fade } from 'svelte/transition';
	import { goto, onNavigate } from '$app/navigation';
	import SwipeDeck from '$lib/components/SwipeDeck.svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import { CATEGORY_LABELS, type MotorcycleCategory, type SwipeDecision } from '$lib/domain/enums';
	import type { CardBikeDetail, SwipeProgress } from '$lib/domain/view-types';
	import { money, progressWidth, unit } from '$lib/utils/format';
	import { fitToViewport } from '$lib/utils/viewport';
	import { motorcycleHref } from '$lib/utils/motorcycle-navigation';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/**
	 * Local deck state.
	 *
	 * The server load seeds it once; from then on the page owns it and never
	 * re-runs the load, because a load would rebuild the deck under the user's
	 * thumb. Decisions save in order; refills follow the saved choices when
	 * the buffer is running low. A failed refill cannot undo a saved swipe.
	 */
	// svelte-ignore state_referenced_locally
	let cards = $state<CardBikeDetail[]>([...data.cards]);
	// svelte-ignore state_referenced_locally
	let savedProgress = $state<SwipeProgress>({ ...data.progress });
	// svelte-ignore state_referenced_locally
	let seededRound = $state(data.round.id);

	/** Save in order, while gestures and image preloading remain immediate. */
	let pending = $state<{ bike: CardBikeDetail; decision: SwipeDecision }[]>([]);
	const inFlight = $derived(pending.map(({ bike }) => bike.id));
	const progress = $derived(
		pending.reduce<SwipeProgress>(
			(counts, { decision }) => ({
				...counts,
				swiped: counts.swiped + 1,
				remaining: Math.max(counts.remaining - 1, 0),
				likes: counts.likes + Number(decision === 'LIKE'),
				superlikes: counts.superlikes + Number(decision === 'SUPERLIKE'),
				dislikes: counts.dislikes + Number(decision === 'DISLIKE'),
				skips: counts.skips + Number(decision === 'SKIP'),
				shortlist: counts.shortlist + Number(decision === 'LIKE' || decision === 'SUPERLIKE')
			}),
			savedProgress
		)
	);
	let saving = $state(false);
	let saveTask: Promise<void> | null = null;
	// Finish queued choices before opening a shortlist or switching rounds.
	onNavigate(() => saveTask ?? undefined);
	async function openRoundPage(event: MouseEvent) {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
			return;
		event.preventDefault();
		const destination = (event.currentTarget as HTMLAnchorElement).href;
		await saveTask;
		// Load after saving; hover preloading may hold a stale shortlist.
		await goto(destination, { invalidateAll: true });
	}
	let undoing = $state(false);
	let refilling = $state(false);
	let loadError = $state(false);
	// svelte-ignore state_referenced_locally
	let exhausted = $state(data.cards.length === 0);
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- request bookkeeping only
	const seen = new Set<string>();
	let deck = $state<ReturnType<typeof SwipeDeck> | null>(null);

	/** Last decision, for undo. */
	let lastDecision = $state<{ bike: CardBikeDetail; decision: SwipeDecision } | null>(null);

	let showInfo = $state<CardBikeDetail | null>(null);
	let showHelp = $state(false);

	const REFILL_THRESHOLD = 2;
	const finished = $derived(
		cards.length === 0 && exhausted && !refilling && !saving && !undoing && pending.length === 0
	);

	/**
	 * Client-side navigation between two swipe pages reuses this component, so
	 * the local deck has to be re-seeded when the round changes. Without this,
	 * opening a second round would show the first round's cards.
	 */
	$effect(() => {
		if (data.round.id === seededRound) return;
		seededRound = data.round.id;
		cards = [...data.cards];
		savedProgress = { ...data.progress };
		lastDecision = null;
		pending = [];
		seen.clear();
		saving = false;
		undoing = false;
		refilling = false;
		loadError = false;
		exhausted = data.cards.length === 0;
		showInfo = null;
		showHelp = false;
	});

	/**
	 * Preload the images for the next few cards. Without this a fast swiper hits
	 * a blank card while the browser fetches — the single most damaging thing
	 * that can happen to the feel of the deck.
	 */
	$effect(() => {
		// The live card's other photographs too, so stepping through them
		// does not show a blank.
		const urls = [
			...cards.slice(1, 5).map((card) => card.images[0]?.url),
			...(cards[0]?.images.slice(1) ?? []).map((image) => image.url)
		];
		for (const url of urls) {
			if (!url) continue;
			const img = new Image();
			img.decoding = 'async';
			img.src = url;
		}
	});

	function onDecision(bike: CardBikeDetail, decision: SwipeDecision) {
		cards = cards.filter((c) => c.id !== bike.id);
		pending = [...pending, { bike, decision }];
		lastDecision = { bike, decision };
		if (decision === 'SUPERLIKE') {
			toasts.push(`Superliked ${bike.manufacturer.name} ${bike.model}`, 'superlike');
		}
		saveTask ??= savePending().finally(() => {
			saveTask = null;
		});
	}

	async function savePending() {
		if (saving) return;
		saving = true;
		const roundId = seededRound;
		while (pending.length && roundId === seededRound) {
			const { bike, decision } = pending[0];
			try {
				const response = await fetch(`/api/rounds/${roundId}/swipes`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ motorcycleId: bike.id, decision })
				});
				if (!response.ok) throw new Error(await responseMessage(response));
				const result = (await response.json()) as {
					progress: SwipeProgress;
				};
				if (roundId !== seededRound) return;
				seen.add(bike.id);
				savedProgress = result.progress;
				pending = pending.slice(1);
			} catch (error) {
				if (roundId !== seededRound) return;
				pending = pending.slice(1);
				cards = [bike, ...cards.filter((c) => c.id !== bike.id)];
				exhausted = false;
				if (lastDecision?.bike.id === bike.id) lastDecision = null;
				toasts.error(
					error instanceof Error ? error.message : 'Could not save that swipe. Try again.'
				);
			}
		}
		if (roundId !== seededRound) return;
		saving = false;
		if (cards.length <= REFILL_THRESHOLD && !exhausted && !loadError) void topUp();
	}

	function appendCards(incoming: CardBikeDetail[]) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local deduplication only
		const known = new Set([...cards.map((c) => c.id), ...inFlight, ...seen]);
		cards = [
			...cards,
			...incoming.filter((c) => {
				if (known.has(c.id)) return false;
				known.add(c.id);
				return true;
			})
		];
	}

	async function topUp() {
		if (refilling || saving || undoing) return;
		const roundId = seededRound;
		refilling = true;
		loadError = false;
		try {
			const exclude = [...cards.map((c) => c.id), ...inFlight].join(',');
			const response = await fetch(
				`/api/rounds/${roundId}/deck?limit=${Math.max(1, data.batchSize - cards.length)}&exclude=${encodeURIComponent(exclude)}`
			);
			if (!response.ok) throw new Error('Could not load motorcycles');
			const result = (await response.json()) as { cards: CardBikeDetail[] };
			if (roundId !== seededRound) return;
			appendCards(result.cards);
			exhausted = result.cards.length === 0;
		} catch {
			if (roundId === seededRound) loadError = true;
		} finally {
			if (roundId === seededRound) refilling = false;
		}
	}

	async function undo() {
		if (!lastDecision || saving || refilling || undoing || deck?.isBusy()) return;
		const { bike } = lastDecision;
		const roundId = seededRound;
		undoing = true;

		try {
			const response = await fetch(`/api/rounds/${roundId}/swipes`, {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ motorcycleId: bike.id })
			});
			if (!response.ok) throw new Error('Undo failed');

			const result = (await response.json()) as { progress: SwipeProgress };
			if (roundId !== seededRound) return;
			savedProgress = result.progress;
			seen.delete(bike.id);
			lastDecision = null;
			exhausted = false;
			cards = [bike, ...cards.filter((c) => c.id !== bike.id)];
			toasts.info('Put back on the deck');
		} catch {
			if (roundId === seededRound) toasts.error('Could not undo that. Try again.');
		} finally {
			if (roundId === seededRound) undoing = false;
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
		if ((event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable="true"]'))
			return;
		if (event.key === ' ' && (event.target as HTMLElement)?.closest('button, a')) return;

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
			case ' ':
			case '.':
				event.preventDefault();
				deck?.stepImage(1);
				break;
			case ',':
				deck?.stepImage(-1);
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

<div class="flex h-dvh flex-col overflow-hidden" use:fitToViewport>
	<!-- ============ Header: progress and counters ============ -->
	<header class="pt-safe shrink-0 px-4 pt-3" data-sveltekit-preload-data="off">
		<div class="mx-auto flex max-w-lg items-center gap-3">
			<a
				href="/rounds/{data.round.id}"
				onclick={openRoundPage}
				class="text-ash hover:text-bone flex size-11 shrink-0 items-center justify-center text-sm transition-colors"
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
			<a
				href="/rounds/{data.round.id}/likes"
				onclick={openRoundPage}
				class="text-like shrink-0 py-3 text-xs"
			>
				Shortlist {progress.shortlist}
			</a>
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
			{:else if cards.length === 0 && loadError}
				<div
					class="panel flex h-full flex-col items-center justify-center gap-4 p-6 text-center"
					role="status"
				>
					<h2 class="display text-bone text-2xl">Let's get the next bikes</h2>
					<p class="text-ash text-sm">
						The next motorcycles could not load. Check your connection and try again.
					</p>
					<button class="btn btn-primary" onclick={topUp} disabled={saving || refilling}
						>Try again</button
					>
				</div>
			{:else if cards.length === 0}
				<!-- Refilling: a skeleton card rather than an empty frame, so the
				     layout never jumps. -->
				<div
					class="skeleton flex h-full w-full items-center justify-center rounded-[0.875rem]"
					aria-busy="true"
					role="status"
				>
					<span class="text-ash text-sm"
						>{saving ? 'Saving your choices…' : 'Finding your next motorcycles…'}</span
					>
				</div>
			{:else}
				<SwipeDeck
					bind:this={deck}
					{cards}
					{onDecision}
					oninfo={(bike) => (showInfo = bike)}
					busy={undoing || showInfo !== null || showHelp}
				/>
			{/if}
		</div>
	</div>

	<!-- ============ Action bar ============ -->
	{#if !finished}
		<footer class="pb-safe-nav shrink-0 px-4 pt-1">
			<div
				class="mx-auto grid max-w-lg grid-cols-[44px_56px_44px_56px_44px] items-center justify-center gap-x-2 gap-y-1.5 sm:grid-cols-[44px_64px_48px_64px_44px] sm:gap-x-4"
			>
				<button
					class="border-graphite hover:border-chrome text-ash hover:text-bone flex h-11 w-11 items-center justify-center rounded-full border bg-black/40 text-lg transition-colors disabled:opacity-30"
					onclick={undo}
					disabled={!lastDecision || saving || refilling || undoing}
					aria-label="Undo last swipe"
					title="Undo (Z)"
				>
					↺
				</button>

				<button
					class="border-nope/50 text-nope hover:bg-nope/12 hover:border-nope flex h-14 w-14 items-center justify-center rounded-full border-2 bg-black/40 text-2xl transition-all active:scale-95 disabled:opacity-30 sm:h-16 sm:w-16"
					onclick={() => deck?.decide('DISLIKE')}
					disabled={cards.length === 0 || undoing}
					aria-label="Dislike"
					title="Nope (←)"
				>
					✕
				</button>

				<button
					class="border-superlike/50 text-superlike hover:bg-superlike/12 hover:border-superlike flex h-11 w-11 items-center justify-center rounded-full border-2 bg-black/40 text-xl transition-all active:scale-95 disabled:opacity-30 sm:h-12 sm:w-12"
					onclick={() => deck?.decide('SUPERLIKE')}
					disabled={cards.length === 0 || undoing}
					aria-label="Superlike"
					title="Superlike (↑)"
				>
					★
				</button>

				<button
					class="border-like/50 text-like hover:bg-like/12 hover:border-like flex h-14 w-14 items-center justify-center rounded-full border-2 bg-black/40 text-2xl transition-all active:scale-95 disabled:opacity-30 sm:h-16 sm:w-16"
					onclick={() => deck?.decide('LIKE')}
					disabled={cards.length === 0 || undoing}
					aria-label="Like"
					title="Like (→)"
				>
					♥
				</button>

				<button
					class="border-graphite hover:border-chrome text-ash hover:text-bone flex h-11 w-11 items-center justify-center rounded-full border bg-black/40 text-lg transition-colors disabled:opacity-30"
					onclick={() => deck?.decide('SKIP')}
					disabled={cards.length === 0 || undoing}
					aria-label="Skip"
					title="Skip (↓)"
				>
					⤓
				</button>
				{#each ['Undo', 'Nope', 'Superlike', 'Like', 'Skip'] as label (label)}
					<span class="text-ash text-center text-[10px]" aria-hidden="true">{label}</span>
				{/each}
			</div>
			<p class="text-ash mx-auto mt-3 max-w-lg text-center text-[11px]">
				{#if loadError}
					Next bikes could not load. <button class="underline" onclick={topUp}>Try again</button>
				{:else}
					Your next picks learn from this round. Skip stays neutral.
				{/if}
			</p>

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
					href={motorcycleHref(bike.id, `/rounds/${data.round.id}/swipe?resume=${bike.id}`)}
					class="btn btn-secondary flex-1"
					data-sveltekit-preload-data="off"
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
				{#each [['←', 'Nope'], ['→', 'Like'], ['↑', 'Superlike'], ['↓', 'Skip'], ['Space', 'Next photograph'], ['I', 'Specifications'], ['Z', 'Undo']] as [key, label] (key)}
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
				You can also drag the card. Progress is saved as you go.
			</p>
			<button class="btn btn-primary mt-5 w-full" onclick={() => (showHelp = false)}>
				Got it
			</button>
		</div>
	</div>
{/if}

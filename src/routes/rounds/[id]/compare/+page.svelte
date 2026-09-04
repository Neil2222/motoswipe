<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { CATEGORY_LABELS, type MotorcycleCategory } from '$lib/domain/enums';
	import { money, unit, progressWidth } from '$lib/utils/format';
	import { toasts } from '$lib/stores/toast.svelte';
	import { fitToViewport } from '$lib/utils/viewport';
	import BikePhoto from '$lib/components/BikePhoto.svelte';
	import GalleryControls from '$lib/components/GalleryControls.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Comparison = NonNullable<typeof data.comparison>;

	// svelte-ignore state_referenced_locally
	let comparison = $state<Comparison | null>(data.comparison);
	let submitting = $state(false);
	let chosen = $state<string | null>(null);
	/** Bumped on each vote so the transition keys change and the pair animates. */
	let round = $state(0);

	/** Which photograph each card shows, by bike id. */
	let gallery = $state<Record<string, number>>({});

	function stepImage(bike: { id: string; images: { url: string }[] }, delta: 1 | -1) {
		const n = bike.images.length;
		if (n < 2) return;
		gallery[bike.id] = ((((gallery[bike.id] ?? 0) + delta) % n) + n) % n;
	}

	const votes = $derived(comparison?.votes ?? 0);
	const suggested = $derived(comparison?.suggested ?? 0);
	const enough = $derived(suggested > 0 && votes >= suggested);

	/**
	 * Preload the next pair's images while the user is deciding on this one, so
	 * the arena never flashes empty between votes.
	 */
	$effect(() => {
		if (!comparison) return;
		for (const bike of [comparison.a, comparison.b]) {
			for (const image of bike.images) {
				const img = new Image();
				img.decoding = 'async';
				img.src = image.url;
			}
		}
	});

	async function vote(winnerId: string) {
		if (!comparison || submitting) return;
		submitting = true;
		chosen = winnerId;

		try {
			const response = await fetch(`/api/rounds/${data.round.id}/compare`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					motorcycleAId: comparison.a.id,
					motorcycleBId: comparison.b.id,
					winnerMotorcycleId: winnerId
				})
			});

			if (!response.ok) {
				const body = await response.json().catch(() => null);
				throw new Error(body?.message ?? 'Could not save that vote.');
			}

			const result = (await response.json()) as { next: Comparison | null };
			// Hold the highlight briefly so the choice registers visually.
			await new Promise((resolve) => setTimeout(resolve, 260));

			// The demo's knockout has a final; once it is decided there is
			// nothing left to ask and the result is the next screen. A real
			// round keeps the arena open for as long as wanted.
			if (data.isDemo && result.next === null) {
				await goto(`/rounds/${data.round.id}/results`);
				return;
			}

			comparison = result.next;
			round++;
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Could not save that vote.');
		} finally {
			submitting = false;
			chosen = null;
		}
	}

	async function skipPair() {
		if (submitting) return;
		submitting = true;
		try {
			const response = await fetch(`/api/rounds/${data.round.id}/compare`);
			if (response.ok) {
				const result = (await response.json()) as { next: Comparison | null };
				comparison = result.next;
				round++;
			}
		} finally {
			submitting = false;
		}
	}

	function onkeydown(event: KeyboardEvent) {
		if (!comparison || submitting) return;
		if (event.key === 'ArrowLeft' || event.key === '1') {
			event.preventDefault();
			void vote(comparison.a.id);
		} else if (event.key === 'ArrowRight' || event.key === '2') {
			event.preventDefault();
			void vote(comparison.b.id);
		} else if (event.key === 'ArrowDown' || event.key === 's') {
			event.preventDefault();
			void skipPair();
		}
	}
</script>

<svelte:head><title>Compare — {data.round.name}</title></svelte:head>
<svelte:window on:keydown={onkeydown} />

<!-- Mobile stacks the two cards and may scroll; from `sm` up the arena is
     pinned to the viewport so both cards are visible without scrolling. -->
<div class="pb-safe-nav flex h-dvh flex-col overflow-hidden" use:fitToViewport>
	<!-- Header -->
	<header class="pt-safe shrink-0 px-4 pt-4">
		<div class="mx-auto max-w-5xl">
			<div class="flex items-center gap-3">
				<a
					href="/rounds/{data.round.id}"
					class="text-ash hover:text-bone text-sm transition-colors"
				>
					←
				</a>
				<p class="text-ash truncate text-xs">{data.round.name}</p>
				<span class="numeral text-bone ml-auto text-sm">
					{votes}<span class="text-dim">/{suggested}</span>
				</span>
			</div>
			<div class="bg-graphite mt-2 h-1 overflow-hidden rounded-full">
				<div
					class="h-full rounded-full transition-all duration-500 {enough ? 'bg-cyan' : 'bg-sodium'}"
					style:width={progressWidth(votes, Math.max(suggested, 1))}
				></div>
			</div>
		</div>
	</header>

	{#if !comparison && data.isDemo && data.progress.shortlist >= 2}
		<div class="flex flex-1 items-center justify-center px-4">
			<div class="panel max-w-md p-8 text-center">
				<p class="stencil text-cyan">Decided</p>
				<h1 class="display text-bone mt-3 text-2xl">You have a winner</h1>
				<p class="text-ash mt-3 text-sm leading-relaxed">
					Every match in your knockout has been played. The last bike standing is on the results
					page, with the rest ranked behind it.
				</p>
				<a href="/rounds/{data.round.id}/results" class="btn btn-primary mt-6">See your result</a>
			</div>
		</div>
	{:else if !comparison}
		<div class="flex flex-1 items-center justify-center px-4">
			<div class="panel max-w-md p-8 text-center">
				<p class="stencil text-sodium">Nothing left to compare</p>
				<h1 class="display text-bone mt-3 text-2xl">Not enough shortlisted</h1>
				<p class="text-ash mt-3 text-sm leading-relaxed">
					You need at least two liked motorcycles in this round before head-to-head comparisons mean
					anything.
				</p>
				<a href="/rounds/{data.round.id}" class="btn btn-primary mt-6">Back to the round</a>
			</div>
		</div>
	{:else}
		<div class="flex min-h-0 flex-1 flex-col px-3 py-2 sm:px-4 sm:py-4">
			<div class="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col">
				<h1 class="display text-bone text-center text-lg sm:text-3xl">
					Which would you rather own?
				</h1>
				<p class="text-dim mt-1 text-center text-[11px] sm:mt-2 sm:text-xs">
					No wrong answers. Trust the first reaction.
					{#if data.isDemo && suggested > votes}
						{suggested - votes === 1
							? 'The final.'
							: `${suggested - votes} to go, then your result.`}
					{/if}
				</p>

				{#key round}
					<!-- The arena has to fit the viewport: two cards side by side on
					     desktop, stacked and sharing the height on a phone, so both
					     bikes are on screen without scrolling. `min-h-0` on every flex
					     ancestor is what stops the images forcing the page taller. -->
					<div
						class="mt-2 grid min-h-0 flex-1 grid-cols-1 grid-rows-[1fr_auto_1fr] items-stretch gap-2 sm:mt-5 sm:grid-cols-[1fr_auto_1fr] sm:grid-rows-1 sm:gap-4"
						in:fade={{ duration: 220 }}
					>
						{#each [comparison.a, comparison.b] as bike, index (bike.id)}
							{#if index === 1}
								<!-- VS divider. Horizontal rule on mobile, a badge between the
								     two columns on desktop. -->
								<div class="flex items-center justify-center sm:flex-col">
									<div class="hairline flex-1 sm:hidden"></div>
									<span
										class="display text-chrome border-graphite bg-charcoal mx-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs sm:mx-0 sm:h-11 sm:w-11 sm:text-sm"
									>
										VS
									</span>
									<div class="hairline flex-1 sm:hidden"></div>
								</div>
							{/if}

							<!-- The card is a group of two vote buttons — the photograph and
							     the spec strip — with the gallery controls floating above the
							     photograph, because a button cannot contain buttons. -->
							<div
								class="panel group relative flex min-h-0 flex-col overflow-hidden text-left transition-all duration-200 hover:-translate-y-1
									{chosen === bike.id ? 'border-sodium ring-sodium/40 ring-2' : 'hover:border-chrome'}
									{chosen && chosen !== bike.id ? 'scale-97 opacity-40' : ''}"
								in:fly={{ y: 16, duration: 260, delay: index * 60 }}
							>
								<!-- The photograph itself takes the vote on click, so that a pinch
								     on it reaches the photograph; an overlay button would sit in
								     the way of the fingers. Keyboard users vote through the spec
								     strip button below, which is why no key handler lives here. -->
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="bg-ink relative min-h-0 w-full flex-1 cursor-pointer overflow-hidden"
									onclick={() => !submitting && vote(bike.id)}
								>
									<BikePhoto
										url={bike.images[gallery[bike.id] ?? 0]?.url}
										alt="{bike.manufacturer.name} {bike.model}"
										class="absolute inset-0"
										priority
									/>
									<div
										class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/95 via-black/10 to-black/30"
									></div>

									<GalleryControls
										count={bike.images.length}
										active={gallery[bike.id] ?? 0}
										onstep={(delta) => stepImage(bike, delta)}
										label="{bike.manufacturer.name} {bike.model}"
									/>

									<span
										class="chip pointer-events-none absolute left-3 bg-black/50 backdrop-blur-sm {bike
											.images.length > 1
											? 'top-5'
											: 'top-3'}"
									>
										{CATEGORY_LABELS[bike.category as MotorcycleCategory]}
									</span>

									<div class="pointer-events-none absolute inset-x-0 bottom-0 p-3 sm:p-4">
										<p class="stencil text-sodium/90">{bike.manufacturer.name}</p>
										<h2 class="display text-bone mt-0.5 text-xl leading-tight sm:mt-1 sm:text-3xl">
											{bike.model}
										</h2>
										{#if bike.variant}
											<p class="text-ash text-sm">{bike.variant}</p>
										{/if}
									</div>
								</div>

								<button
									type="button"
									class="flex w-full flex-col text-left disabled:cursor-wait"
									onclick={() => vote(bike.id)}
									disabled={submitting}
									aria-label="Pick the {bike.manufacturer.name} {bike.model}"
								>
									<!-- A minimal spec strip. Enough to break a tie, not enough to
									     turn this back into a spec-sheet comparison. -->
									<dl
										class="text-ash flex w-full items-center justify-between gap-3 px-3 py-1.5 text-[11px] sm:grid sm:grid-cols-3 sm:gap-2 sm:px-4 sm:py-3 sm:text-xs"
									>
										<div class="flex gap-1 sm:block">
											<dt class="text-dim">Engine</dt>
											<dd class="numeral">{unit(bike.displacementCc, 'cc')}</dd>
										</div>
										<div class="flex gap-1 sm:block">
											<dt class="text-dim">Power</dt>
											<dd class="numeral">{unit(bike.powerHp, 'hp')}</dd>
										</div>
										<div class="flex gap-1 sm:block">
											<dt class="text-dim">Price</dt>
											<dd class="numeral">{money(bike.msrpAmount, bike.msrpCurrency)}</dd>
										</div>
									</dl>

									<span
										class="stencil border-graphite hidden w-full border-t px-4 py-2 text-center sm:block"
									>
										{index === 0 ? 'Pick this  ·  ←' : 'Pick this  ·  →'}
									</span>
								</button>
							</div>
						{/each}
					</div>
				{/key}

				<div
					class="mt-2 flex shrink-0 flex-wrap items-center justify-center gap-2 pb-1 sm:mt-5 sm:gap-3 sm:pb-6"
				>
					{#if !data.isDemo}
						<!-- A knockout cannot skip a match; a real round can. -->
						<button class="btn btn-ghost btn-sm" onclick={skipPair} disabled={submitting}>
							Skip this pairing
						</button>
					{/if}
					<a href="/rounds/{data.round.id}/results" class="btn btn-secondary btn-sm">
						{enough ? 'See the ranking' : 'Ranking so far'}
					</a>
				</div>

				{#if enough}
					<p class="text-cyan hidden text-center text-xs sm:mb-6 sm:block">
						You have done enough comparisons for a stable top few. Keep going if you want to sharpen
						the middle of the table.
					</p>
				{/if}
			</div>
		</div>
	{/if}
</div>

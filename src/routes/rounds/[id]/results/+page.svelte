<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { CATEGORY_LABELS, type MotorcycleCategory } from '$lib/domain/enums';
	import { describeFilters, type RoundFilters } from '$lib/domain/filters';
	import { EMPTY, money, num, percent, unit, year } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const winner = $derived(data.ranked[0] ?? null);
	const rest = $derived(data.ranked.slice(1));
	const stats = $derived(data.statistics);

	const manufacturerNames = $derived(
		new Map(data.manufacturers.map((m) => [m.id, m.name] as const))
	);
	const filterChips = $derived(
		describeFilters((data.round.filters ?? {}) as RoundFilters, manufacturerNames)
	);

	/** Top group rows, significant ones first, capped so the page stays readable. */
	function topGroups<T extends { shown: number; significant: boolean }>(rows: T[], limit = 8) {
		return [...rows].sort((a, b) => Number(b.significant) - Number(a.significant)).slice(0, limit);
	}
</script>

<svelte:head><title>Results — {data.round.name}</title></svelte:head>

<div class="mx-auto max-w-5xl px-4 py-10">
	<a href="/rounds/{data.round.id}" class="text-dim hover:text-ash text-sm transition-colors">
		← {data.round.name}
	</a>

	<div class="mt-4">
		<p class="stencil text-sodium mb-2">Results</p>
		<h1 class="display text-bone text-4xl">{data.round.name}</h1>
		{#if data.round.goal}
			<p class="text-ash mt-3 max-w-2xl text-sm leading-relaxed">{data.round.goal}</p>
		{/if}
		<div class="mt-4 flex flex-wrap gap-1.5">
			{#if filterChips.length === 0}
				<span class="chip">Everything</span>
			{:else}
				{#each filterChips as chip (chip)}<span class="chip">{chip}</span>{/each}
			{/if}
		</div>
	</div>

	<!-- ================= Winner ================= -->
	{#if winner}
		<section class="relative mt-10 overflow-hidden rounded-2xl">
			<div class="panel relative overflow-hidden p-0">
				<div class="grid sm:grid-cols-[minmax(0,22rem)_1fr]">
					<div class="bg-ink relative aspect-4/5 sm:aspect-auto sm:min-h-80">
						{#if winner.motorcycle.images[0]}
							<img
								src={winner.motorcycle.images[0].url}
								alt="{winner.motorcycle.manufacturer.name} {winner.motorcycle.model}"
								class="absolute inset-0 h-full w-full object-cover"
							/>
						{/if}
						<div
							class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent sm:bg-gradient-to-r sm:from-transparent sm:to-black/70"
						></div>
					</div>

					<div class="relative flex flex-col justify-center p-6 sm:p-8">
						<!-- Sodium wash behind the winner block -->
						<div
							class="pointer-events-none absolute inset-0 -z-10"
							style="background: radial-gradient(30rem 20rem at 80% 20%, rgb(255 106 31 / 0.16), transparent 65%)"
							aria-hidden="true"
						></div>

						<p class="stencil text-sodium">Your #1</p>
						<p class="text-ash mt-3 text-sm">{winner.motorcycle.manufacturer.name}</p>
						<h2 class="display text-bone mt-1 text-[clamp(2rem,6vw,3.25rem)] leading-[0.92]">
							{winner.motorcycle.model}
						</h2>
						{#if winner.motorcycle.variant}
							<p class="display text-ash mt-1 text-lg">{winner.motorcycle.variant}</p>
						{/if}

						<div class="mt-5 flex flex-wrap items-center gap-4">
							<div>
								<p class="stencil">Elo</p>
								<p class="numeral text-sodium text-2xl">{num(winner.eloScore, 0)}</p>
							</div>
							<div>
								<p class="stencil">Record</p>
								<p class="numeral text-bone text-2xl">
									{winner.wins}–{winner.losses}
								</p>
							</div>
							<div>
								<p class="stencil">Category</p>
								<p class="text-bone text-sm">
									{CATEGORY_LABELS[winner.motorcycle.category as MotorcycleCategory]}
								</p>
							</div>
						</div>

						<div class="mt-6 flex flex-wrap gap-2">
							<a href="/motorcycles/{winner.motorcycle.id}" class="btn btn-primary">
								See the full details
							</a>
							{#if data.comparisons < data.suggestedComparisons}
								<a href="/rounds/{data.round.id}/compare" class="btn btn-secondary">
									Keep comparing
								</a>
							{/if}
						</div>

						{#if data.comparisons < data.suggestedComparisons}
							<p class="text-dim mt-4 text-xs leading-relaxed">
								Based on {data.comparisons} comparison{data.comparisons === 1 ? '' : 's'}. Around
								{data.suggestedComparisons} makes the top of the table settle down.
							</p>
						{/if}
					</div>
				</div>
			</div>
		</section>
	{:else if data.progress.shortlist >= 2}
		<div class="panel mt-10">
			<EmptyState
				glyph="⚔"
				title="No head-to-head results yet"
				body="You have {data.progress
					.shortlist} motorcycles on the shortlist. Put them against each other and MotoSwipe will work out an order — and a winner."
			>
				<a href="/rounds/{data.round.id}/compare" class="btn btn-primary btn-lg">
					Start comparing
				</a>
			</EmptyState>
		</div>
	{/if}

	<!-- ================= Swipe totals ================= -->
	<section class="mt-10">
		<h2 class="display text-bone text-xl">The swipe phase</h2>
		<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
			{#each [{ l: 'Seen', v: String(stats.totals.seen), t: 'text-bone' }, { l: 'Likes', v: String(stats.totals.likes), t: 'text-like' }, { l: 'Superlikes', v: String(stats.totals.superlikes), t: 'text-superlike' }, { l: 'Nope', v: String(stats.totals.dislikes), t: 'text-ash' }, { l: 'Like rate', v: percent(stats.totals.likeRate), t: 'text-bone' }, { l: 'Superlike rate', v: percent(stats.totals.superlikeRate), t: 'text-superlike' }] as stat (stat.l)}
				<div class="panel px-4 py-4">
					<p class="numeral text-2xl {stat.t}">{stat.v}</p>
					<p class="stencil mt-1">{stat.l}</p>
				</div>
			{/each}
		</div>
		{#if stats.totals.skips > 0}
			<p class="text-dim mt-3 text-xs">
				{stats.totals.skips} skipped. Skips are excluded from the like rate — "not now" is not the same
				as "no".
			</p>
		{/if}
	</section>

	<!-- ================= Ranking ================= -->
	{#if data.ranked.length > 1}
		<section class="mt-10">
			<h2 class="display text-bone text-xl">Full ranking</h2>
			<p class="text-ash mt-2 text-sm">
				Elo starts at 1500. Superliked motorcycles start 40 points up, which a few losses erase.
			</p>

			<ol class="panel divide-graphite mt-4 divide-y overflow-hidden">
				{#each rest as row, index (row.motorcycle.id)}
					<li>
						<a
							href="/motorcycles/{row.motorcycle.id}"
							class="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-white/3"
						>
							<span class="numeral text-dim w-7 shrink-0 text-right text-sm">
								{index + 2}
							</span>

							<div class="bg-ink h-12 w-12 shrink-0 overflow-hidden rounded-md">
								{#if row.motorcycle.images[0]}
									<img
										src={row.motorcycle.images[0].url}
										alt=""
										class="h-full w-full object-cover"
										loading="lazy"
									/>
								{/if}
							</div>

							<div class="min-w-0 flex-1">
								<p class="text-dim text-xs">{row.motorcycle.manufacturer.name}</p>
								<p class="text-bone truncate text-sm">
									{row.motorcycle.model}
									{#if row.motorcycle.variant}
										<span class="text-ash">{row.motorcycle.variant}</span>
									{/if}
								</p>
							</div>

							<div class="hidden text-right sm:block">
								<p class="numeral text-ash text-xs">{row.wins}–{row.losses}</p>
								<p class="stencil text-[9px]">W–L</p>
							</div>

							<span class="numeral text-bone w-16 shrink-0 text-right text-sm">
								{num(row.eloScore, 0)}
							</span>
						</a>
					</li>
				{/each}
			</ol>

			{#if data.ranking.length > data.ranked.length}
				<p class="text-dim mt-3 text-xs">
					{data.ranking.length - data.ranked.length} shortlisted motorcycle{data.ranking.length -
						data.ranked.length ===
					1
						? ' has'
						: 's have'} not been in a comparison yet, so {data.ranking.length -
						data.ranked.length ===
					1
						? 'it is'
						: 'they are'} not ranked.
				</p>
			{/if}
		</section>
	{/if}

	<!-- ================= Taste statistics ================= -->
	{#if stats.totals.seen > 0}
		<section class="mt-12">
			<h2 class="display text-bone text-xl">What your taste looks like</h2>
			<p class="text-ash mt-2 max-w-2xl text-sm leading-relaxed">
				Plain counting, no inference. A row marked provisional is one where you have seen fewer than {data.minSample}
				motorcycles — the percentage is real but it does not mean much yet.
			</p>

			<div class="mt-5 grid gap-5 lg:grid-cols-2">
				<!-- Manufacturers -->
				<div class="panel p-5">
					<h3 class="display text-bone text-base">Manufacturers</h3>
					<ul class="mt-4 space-y-3">
						{#each topGroups(stats.manufacturers) as row (row.key)}
							<li>
								<div class="mb-1 flex items-baseline justify-between gap-3">
									<span class="text-bone truncate text-sm">
										{row.key}
										{#if !row.significant}
											<span class="text-dim ml-1 text-[10px] tracking-wider uppercase">
												provisional
											</span>
										{/if}
									</span>
									<span class="numeral text-ash shrink-0 text-xs">
										{percent(row.likeRate)}
										<span class="text-dim">
											· {row.liked + row.superliked}/{row.shown - row.skipped}
										</span>
									</span>
								</div>
								<div class="bg-graphite h-1.5 overflow-hidden rounded-full">
									<div
										class="h-full rounded-full {row.significant ? 'bg-sodium' : 'bg-steel'}"
										style:width="{Math.round(row.likeRate * 100)}%"
									></div>
								</div>
							</li>
						{/each}
					</ul>
				</div>

				<!-- Categories -->
				<div class="panel p-5">
					<h3 class="display text-bone text-base">Categories</h3>
					<ul class="mt-4 space-y-3">
						{#each topGroups(stats.categories) as row (row.key)}
							<li>
								<div class="mb-1 flex items-baseline justify-between gap-3">
									<span class="text-bone truncate text-sm">
										{CATEGORY_LABELS[row.key as MotorcycleCategory] ?? row.key}
										{#if !row.significant}
											<span class="text-dim ml-1 text-[10px] tracking-wider uppercase">
												provisional
											</span>
										{/if}
									</span>
									<span class="numeral text-ash shrink-0 text-xs">
										{percent(row.likeRate)}
										<span class="text-dim">
											· {row.liked + row.superliked}/{row.shown - row.skipped}
										</span>
									</span>
								</div>
								<div class="bg-graphite h-1.5 overflow-hidden rounded-full">
									<div
										class="h-full rounded-full {row.significant ? 'bg-cyan' : 'bg-steel'}"
										style:width="{Math.round(row.likeRate * 100)}%"
									></div>
								</div>
							</li>
						{/each}
					</ul>
				</div>
			</div>

			<!-- Averages -->
			<div class="panel mt-5 p-5">
				<h3 class="display text-bone text-base">The average bike you liked</h3>
				<dl
					class="bg-graphite mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg sm:grid-cols-4"
				>
					{#each [{ l: 'Displacement', v: unit(stats.likedAverages.displacementCc, 'cc'), c: unit(stats.dislikedAverages.displacementCc, 'cc') }, { l: 'Power', v: unit(stats.likedAverages.powerHp, 'hp'), c: unit(stats.dislikedAverages.powerHp, 'hp') }, { l: 'Weight', v: unit(stats.likedAverages.wetWeightKg, 'kg'), c: null }, { l: 'Seat height', v: unit(stats.likedAverages.seatHeightMm, 'mm'), c: unit(stats.dislikedAverages.seatHeightMm, 'mm') }, { l: 'Torque', v: unit(stats.likedAverages.torqueNm, 'Nm'), c: null }, { l: 'Model year', v: year(stats.likedAverages.modelYear), c: null }, { l: 'Price', v: money(stats.likedAverages.price?.amount ?? null, stats.likedAverages.price?.currency ?? null), c: null }, { l: 'Passenger capable', v: percent(stats.likedAverages.passengerCapableRatio), c: null }] as row (row.l)}
						<div class="bg-charcoal px-4 py-3">
							<dt class="stencil">{row.l}</dt>
							<dd class="numeral text-bone mt-1 text-base">{row.v}</dd>
							{#if row.c && row.c !== EMPTY}
								<dd class="text-dim mt-0.5 text-[11px]">rejected: {row.c}</dd>
							{/if}
						</div>
					{/each}
				</dl>
				<p class="text-dim mt-3 text-xs leading-relaxed">
					Averages ignore motorcycles with no published figure, so each is over a different number
					of bikes. Price is averaged only within your most common currency.
				</p>
			</div>
		</section>
	{/if}

	<!-- ================= Next ================= -->
	<section class="panel mt-10 flex flex-wrap items-center justify-between gap-4 p-6">
		<div>
			<h2 class="display text-bone text-base">Done with this round?</h2>
			<p class="text-ash mt-1 text-sm">
				Duplicate it from the dashboard to run the same brief again with a clean deck.
			</p>
		</div>
		<div class="flex gap-2">
			<a href="/rounds/{data.round.id}/likes" class="btn btn-secondary">Shortlist</a>
			<a href="/dashboard" class="btn btn-ghost">Dashboard</a>
		</div>
	</section>
</div>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import BikePhoto from '$lib/components/BikePhoto.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FitBadge from '$lib/components/FitBadge.svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import { CATEGORY_LABELS, type MotorcycleCategory } from '$lib/domain/enums';
	import { money, queryString, unit } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type View = 'grid' | 'list';
	let view = $state<View>('grid');

	// Remember the layout choice; a per-viewer convenience, nothing more.
	$effect(() => {
		try {
			localStorage.setItem('motoswipe:shortlist-view', view);
		} catch {
			/* private mode */
		}
	});
	$effect(() => {
		try {
			const saved = localStorage.getItem('motoswipe:shortlist-view');
			if (saved === 'grid' || saved === 'list') view = saved;
		} catch {
			/* private mode */
		}
	});

	let decisionForm = $state<HTMLFormElement | null>(null);
	let pending = $state({ motorcycleId: '', decision: '' });

	function change(motorcycleId: string, decision: string, label: string) {
		pending = { motorcycleId, decision };
		queueMicrotask(() => {
			decisionForm?.requestSubmit();
			toasts.info(label);
		});
	}

	const sorts = [
		['recent', 'Recent'],
		['name', 'Name'],
		['power', 'Power'],
		['displacement', 'Displacement'],
		['price', 'Price'],
		['seatHeight', 'Seat height'],
		['year', 'Year']
	] as const;

	function sortHref(value: string) {
		return queryString({ sort: value, only: data.only });
	}
</script>

<svelte:head><title>Shortlist — {data.round.name}</title></svelte:head>

<div class="mx-auto max-w-6xl px-4 py-10">
	<a href="/rounds/{data.round.id}" class="text-dim hover:text-ash text-sm transition-colors">
		← {data.round.name}
	</a>

	<div class="mt-4 flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="stencil text-sodium mb-2">Shortlist</p>
			<h1 class="display text-bone text-4xl">
				{data.entries.length}
				{data.only === 'superlikes' ? 'superliked' : 'liked'}
			</h1>
		</div>

		{#if data.progress.shortlist >= 2}
			<a href="/rounds/{data.round.id}/compare" class="btn btn-primary">Compare head-to-head</a>
		{/if}
	</div>

	<!-- Filters and layout -->
	<div class="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
		<div class="flex gap-2">
			<a
				href={queryString({ sort: data.sort })}
				class="chip {!data.only ? 'chip-active' : ''}"
				aria-current={!data.only ? 'true' : undefined}
			>
				All ({data.progress.shortlist})
			</a>
			<a
				href={queryString({ sort: data.sort, only: 'superlikes' })}
				class="chip {data.only === 'superlikes' ? 'chip-active' : ''}"
			>
				Superlikes ({data.progress.superlikes})
			</a>
		</div>

		<div class="flex items-center gap-2">
			<span class="stencil">Sort</span>
			<div class="flex flex-wrap gap-1.5">
				{#each sorts as [value, label] (value)}
					<a
						href={sortHref(value)}
						class="chip {data.sort === value ? 'chip-active' : ''}"
						data-sveltekit-noscroll
					>
						{label}
					</a>
				{/each}
			</div>
		</div>

		<div class="ml-auto flex gap-1.5">
			<button
				class="chip {view === 'grid' ? 'chip-active' : ''}"
				onclick={() => (view = 'grid')}
				aria-pressed={view === 'grid'}
			>
				Grid
			</button>
			<button
				class="chip {view === 'list' ? 'chip-active' : ''}"
				onclick={() => (view = 'list')}
				aria-pressed={view === 'list'}
			>
				List
			</button>
		</div>
	</div>

	{#if data.entries.length === 0}
		<div class="panel mt-8">
			<EmptyState
				glyph="♡"
				title={data.only === 'superlikes' ? 'No superlikes yet' : 'Nothing on the shortlist yet'}
				body={data.only === 'superlikes'
					? 'Superlike is for the ones that genuinely stop you. Swipe up on a card, or press the up arrow.'
					: 'Swipe right on a motorcycle and it lands here.'}
			>
				{#if data.progress.remaining > 0}
					<a href="/rounds/{data.round.id}/swipe" class="btn btn-primary">
						{data.progress.swiped > 0 ? 'Resume swiping' : 'Start swiping'}
					</a>
				{/if}
			</EmptyState>
		</div>
	{:else if view === 'grid'}
		<div class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.entries as entry (entry.motorcycle.id)}
				{@const bike = entry.motorcycle}
				<article class="panel overflow-hidden">
					<a href="/motorcycles/{bike.id}" class="block">
						<div class="bg-ink relative aspect-4/5 overflow-hidden">
							<BikePhoto
								url={bike.images[0]?.url}
								alt="{bike.manufacturer.name} {bike.model}"
								class="absolute inset-0"
							/>
							<div
								class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent"
							></div>

							{#if entry.decision === 'SUPERLIKE'}
								<span
									class="border-superlike/60 text-superlike absolute top-3 right-3 rounded-full border bg-black/60 px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase"
								>
									Superlike
								</span>
							{/if}

							<div class="absolute inset-x-0 bottom-0 p-4">
								<p class="stencil text-sodium/90">{bike.manufacturer.name}</p>
								<h3 class="display text-bone mt-0.5 text-lg leading-tight">{bike.model}</h3>
								{#if bike.variant}<p class="text-ash text-xs">{bike.variant}</p>{/if}
							</div>
						</div>
					</a>

					<div class="p-4">
						<dl class="text-ash grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
							<div class="flex justify-between">
								<dt class="text-dim">Engine</dt>
								<dd class="numeral">{unit(bike.displacementCc, 'cc')}</dd>
							</div>
							<div class="flex justify-between">
								<dt class="text-dim">Power</dt>
								<dd class="numeral">{unit(bike.powerHp, 'hp')}</dd>
							</div>
							<div class="flex justify-between">
								<dt class="text-dim">Weight</dt>
								<dd class="numeral">{unit(bike.wetWeightKg, 'kg')}</dd>
							</div>
							<div class="flex justify-between">
								<dt class="text-dim">Seat</dt>
								<dd class="numeral">{unit(bike.seatHeightMm, 'mm')}</dd>
							</div>
						</dl>

						{#if data.hasMeasurements}
							<div class="mt-3">
								<FitBadge fit={entry.fit} disclaimer={data.fitDisclaimer} compact />
							</div>
						{/if}

						<div class="mt-3 flex flex-wrap gap-1.5">
							{#if entry.decision !== 'SUPERLIKE'}
								<button
									class="btn btn-sm btn-ghost text-superlike"
									onclick={() =>
										change(
											bike.id,
											'SUPERLIKE',
											`Superliked ${bike.manufacturer.name} ${bike.model}`
										)}
								>
									★ Superlike
								</button>
							{:else}
								<button
									class="btn btn-sm btn-ghost"
									onclick={() => change(bike.id, 'LIKE', 'Downgraded to a like')}
								>
									Make it a like
								</button>
							{/if}
							<button
								class="btn btn-sm btn-ghost text-dim"
								onclick={() =>
									change(bike.id, 'DISLIKE', `Removed ${bike.manufacturer.name} ${bike.model}`)}
							>
								Remove
							</button>
						</div>
					</div>
				</article>
			{/each}
		</div>
	{:else}
		<div class="panel mt-8 overflow-x-auto">
			<table class="w-full min-w-3xl text-left text-sm">
				<thead class="border-graphite text-dim border-b">
					<tr>
						<th class="stencil px-4 py-3">Motorcycle</th>
						<th class="stencil px-4 py-3">Category</th>
						<th class="stencil px-4 py-3 text-right">Engine</th>
						<th class="stencil px-4 py-3 text-right">Power</th>
						<th class="stencil px-4 py-3 text-right">Weight</th>
						<th class="stencil px-4 py-3 text-right">Seat</th>
						<th class="stencil px-4 py-3 text-right">Price</th>
						<th class="stencil px-4 py-3"></th>
					</tr>
				</thead>
				<tbody>
					{#each data.entries as entry (entry.motorcycle.id)}
						{@const bike = entry.motorcycle}
						<tr class="border-graphite/60 border-b last:border-0 hover:bg-white/3">
							<td class="px-4 py-3">
								<a href="/motorcycles/{bike.id}" class="hover:text-sodium">
									<span class="text-dim block text-xs">{bike.manufacturer.name}</span>
									<span class="text-bone">{bike.model}</span>
									{#if bike.variant}<span class="text-ash"> {bike.variant}</span>{/if}
								</a>
								{#if entry.decision === 'SUPERLIKE'}
									<span class="text-superlike text-[10px] tracking-widest uppercase">
										Superlike
									</span>
								{/if}
							</td>
							<td class="text-ash px-4 py-3">
								{CATEGORY_LABELS[bike.category as MotorcycleCategory]}
							</td>
							<td class="numeral text-ash px-4 py-3 text-right">
								{unit(bike.displacementCc, 'cc')}
							</td>
							<td class="numeral text-ash px-4 py-3 text-right">{unit(bike.powerHp, 'hp')}</td>
							<td class="numeral text-ash px-4 py-3 text-right">{unit(bike.wetWeightKg, 'kg')}</td>
							<td class="numeral text-ash px-4 py-3 text-right">
								{unit(bike.seatHeightMm, 'mm')}
							</td>
							<td class="numeral text-ash px-4 py-3 text-right">
								{money(bike.msrpAmount, bike.msrpCurrency)}
							</td>
							<td class="px-4 py-3 text-right whitespace-nowrap">
								{#if entry.decision !== 'SUPERLIKE'}
									<button
										class="btn btn-sm btn-ghost text-superlike"
										onclick={() => change(bike.id, 'SUPERLIKE', 'Superliked')}
										aria-label="Superlike {bike.model}"
									>
										★
									</button>
								{/if}
								<button
									class="btn btn-sm btn-ghost text-dim"
									onclick={() => change(bike.id, 'DISLIKE', 'Removed from shortlist')}
									aria-label="Remove {bike.model}"
								>
									✕
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<form
	bind:this={decisionForm}
	method="POST"
	action="?/setDecision"
	class="hidden"
	use:enhance={() =>
		async ({ result }) => {
			if (result.type === 'success') await invalidateAll();
			else toasts.error('Could not change that decision');
		}}
>
	<input type="hidden" name="motorcycleId" value={pending.motorcycleId} />
	<input type="hidden" name="decision" value={pending.decision} />
</form>

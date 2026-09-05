<script lang="ts">
	import { page } from '$app/state';
	import { motorcycleHref } from '$lib/utils/motorcycle-navigation';
	import { goto } from '$app/navigation';
	import BikePhoto from '$lib/components/BikePhoto.svelte';
	import HeartButton from '$lib/components/HeartButton.svelte';
	import { BROWSE_SORT_LABELS, BrowseSort, browseHref } from '$lib/domain/browse';
	import { CATEGORY_LABELS, type MotorcycleCategory } from '$lib/domain/enums';
	import { describeYears } from '$lib/domain/view-types';
	import { money, num } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/**
	 * The search box is debounced and navigates rather than filtering in place,
	 * so the URL always describes what is on screen. That is what makes a search
	 * shareable, and what makes the back button do the obvious thing.
	 */
	let timer: ReturnType<typeof setTimeout>;

	function search(value: string) {
		clearTimeout(timer);
		timer = setTimeout(() => {
			// Any change to the query starts again at page one; staying on page 4
			// of the old results is never what anybody meant.
			goto(browseHref(data.query, { q: value || undefined, page: 1 }), {
				keepFocus: true,
				noScroll: true
			});
		}, 300);
	}

	let showFilters = $state(false);

	const activeFilters = $derived(
		[
			data.query.category && CATEGORY_LABELS[data.query.category],
			data.query.manufacturer &&
				data.manufacturers.find((m) => m.id === data.query.manufacturer)?.name,
			data.query.yearFrom && `${data.query.yearFrom} and newer`,
			data.query.priceMax !== undefined && `up to €${data.query.priceMax.toLocaleString('en-US')}`,
			!data.query.withPhotos && 'including bikes with no photo'
		].filter(Boolean) as string[]
	);
</script>

<svelte:head><title>Browse motorcycles — MotoSwipe</title></svelte:head>

<div class="mx-auto max-w-6xl px-4 py-8">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="stencil text-sodium mb-2">The catalogue</p>
			<h1 class="display text-bone text-3xl sm:text-4xl">Browse motorcycles</h1>
			<p class="text-ash mt-2 max-w-xl text-sm leading-relaxed">
				Look one up and keep the ones you like. Saved bikes go to your garage.
			</p>
		</div>
		{#if data.canSave}
			<a href="/garage" class="btn btn-secondary btn-sm">Your garage</a>
		{:else}
			<a href="/login" class="btn btn-secondary btn-sm">Sign in to save bikes</a>
		{/if}
	</div>

	<!-- ============ Search ============ -->
	<div class="panel mt-6 p-4">
		<div class="flex flex-wrap items-center gap-3">
			<div class="min-w-56 flex-1">
				<label class="sr-only" for="q">Search motorcycles</label>
				<!--
					Not bound: the URL is the state. Rendering `value` from the loaded
					query means "clear" and the back button both put the box back to
					what the page is actually showing, which a mirrored copy in local
					state would quietly get wrong.
				-->
				<input
					id="q"
					class="field"
					type="search"
					placeholder="Kawasaki Z900, Africa Twin, Vespa…"
					value={data.query.q ?? ''}
					oninput={(event) => search(event.currentTarget.value)}
					autocomplete="off"
				/>
			</div>

			<label class="sr-only" for="sort">Sort</label>
			<select
				id="sort"
				class="field w-auto"
				value={data.query.sort ?? 'popular'}
				onchange={(event) =>
					goto(
						browseHref(data.query, {
							sort: event.currentTarget.value as BrowseSort,
							page: 1
						})
					)}
			>
				{#each Object.values(BrowseSort) as option (option)}
					<option value={option}>{BROWSE_SORT_LABELS[option]}</option>
				{/each}
			</select>

			<button
				type="button"
				class="btn btn-secondary btn-sm"
				onclick={() => (showFilters = !showFilters)}
				aria-expanded={showFilters}
			>
				Filters{activeFilters.length ? ` (${activeFilters.length})` : ''}
			</button>
		</div>

		{#if showFilters}
			<div class="border-graphite mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
				<div>
					<span class="label">Category</span>
					<select
						class="field"
						value={data.query.category ?? ''}
						onchange={(event) =>
							goto(
								browseHref(data.query, {
									category: (event.currentTarget.value || undefined) as
										MotorcycleCategory | undefined,
									page: 1
								})
							)}
					>
						<option value="">Any</option>
						{#each Object.entries(CATEGORY_LABELS) as [value, label] (value)}
							<option {value}>{label}</option>
						{/each}
					</select>
				</div>

				<div>
					<span class="label">Manufacturer</span>
					<select
						class="field"
						value={data.query.manufacturer ?? ''}
						onchange={(event) =>
							goto(
								browseHref(data.query, {
									manufacturer: event.currentTarget.value || undefined,
									page: 1
								})
							)}
					>
						<option value="">Any</option>
						{#each data.manufacturers as make (make.id)}
							<option value={make.id}>{make.name} ({make.count})</option>
						{/each}
					</select>
				</div>

				<div>
					<label class="label" for="yearFrom">From year</label>
					<input
						id="yearFrom"
						class="field"
						type="number"
						min="1900"
						max="2100"
						placeholder="Any"
						value={data.query.yearFrom ?? ''}
						onchange={(event) =>
							goto(
								browseHref(data.query, {
									yearFrom: event.currentTarget.value
										? Number(event.currentTarget.value)
										: undefined,
									page: 1
								})
							)}
					/>
				</div>

				<div>
					<label class="label" for="priceMax">Max price (€)</label>
					<input
						id="priceMax"
						class="field"
						type="number"
						min="0"
						placeholder="Any"
						value={data.query.priceMax ?? ''}
						onchange={(event) =>
							goto(
								browseHref(data.query, {
									priceMax: event.currentTarget.value
										? Number(event.currentTarget.value)
										: undefined,
									page: 1
								})
							)}
					/>
				</div>

				<label class="flex cursor-pointer items-center gap-2 sm:col-span-2 lg:col-span-4">
					<input
						type="checkbox"
						class="accent-sodium h-4 w-4"
						checked={!data.query.withPhotos}
						onchange={(event) =>
							goto(
								browseHref(data.query, {
									withPhotos: !event.currentTarget.checked,
									page: 1
								})
							)}
					/>
					<span class="text-ash text-sm"> Include motorcycles without a photograph </span>
				</label>
			</div>
		{/if}

		<p class="text-dim mt-3 text-xs">
			{num(data.total)}
			{data.total === 1 ? 'motorcycle' : 'motorcycles'}{activeFilters.length
				? ` · ${activeFilters.join(' · ')}`
				: ''}
			{#if activeFilters.length || data.query.q}
				· <a href="/motorcycles" class="text-sodium hover:underline">clear</a>
			{/if}
		</p>
	</div>

	<!-- ============ Results ============ -->
	{#if data.bikes.length === 0}
		<div class="panel mt-6 p-10 text-center">
			<p class="display text-bone text-lg">Nothing matches that</p>
			<p class="text-ash mx-auto mt-2 max-w-md text-sm leading-relaxed">
				Try a shorter search — "z900" rather than "kawasaki z900 2019" — or include motorcycles
				without a photograph.
			</p>
		</div>
	{:else}
		<ul class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
			{#each data.bikes as bike (bike.id)}
				<!-- Plain photographs, and tiles off screen are not laid out or painted:
				     a page of forty blurred backdrops on their own layers was enough
				     to stall scrolling on a fast desktop. -->
				<li
					class="panel group relative overflow-hidden [contain-intrinsic-size:auto_18rem] [content-visibility:auto]"
				>
					<a href={motorcycleHref(bike.id, page.url.pathname + page.url.search)} class="block">
						<div class="relative w-full" style="aspect-ratio: 4 / 3;">
							<BikePhoto
								url={bike.images[0]?.url}
								alt="{bike.manufacturer.name} {bike.model}"
								class="absolute inset-0"
								backdrop={false}
								pinch={false}
							/>
						</div>

						<div class="p-3">
							<p class="stencil text-sodium truncate text-[0.65rem]">
								{bike.manufacturer.name}
							</p>
							<p class="text-bone mt-0.5 truncate text-sm font-medium">{bike.model}</p>
							<p class="text-dim numeral mt-1 flex flex-wrap gap-x-2 text-xs">
								{#if describeYears(bike)}<span>{describeYears(bike)}</span>{/if}
								{#if bike.msrpAmount}
									<span>{money(bike.msrpAmount, bike.msrpCurrency)}</span>
								{/if}
							</p>
							{#if bike.registrationCount}
								<p class="text-dim mt-1 text-[0.65rem]">
									{num(bike.registrationCount)} on the road in NL
								</p>
							{/if}
						</div>
					</a>

					{#if data.canSave}
						<HeartButton
							motorcycleId={bike.id}
							favorited={bike.favorited}
							label="{bike.manufacturer.name} {bike.model}"
							size="sm"
							class="absolute top-2 right-2"
						/>
					{/if}
				</li>
			{/each}
		</ul>

		{#if data.pageCount > 1}
			<nav class="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
				{#if data.page > 1}
					<a
						href={browseHref(data.query, { page: data.page - 1 })}
						class="btn btn-secondary btn-sm"
					>
						Previous
					</a>
				{/if}
				<span class="numeral text-dim text-sm">
					{data.page} / {data.pageCount}
				</span>
				{#if data.page < data.pageCount}
					<a
						href={browseHref(data.query, { page: data.page + 1 })}
						class="btn btn-secondary btn-sm"
					>
						Next
					</a>
				{/if}
			</nav>
		{/if}
	{/if}
</div>

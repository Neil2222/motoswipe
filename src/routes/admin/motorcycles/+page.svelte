<script lang="ts">
	import { CATEGORY_LABELS, type MotorcycleCategory } from '$lib/domain/enums';
	import { EMPTY, queryString, shortDate } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	function pageHref(n: number) {
		return queryString({ q: data.query, source: data.source, page: n });
	}
</script>

<svelte:head><title>Motorcycles — Admin</title></svelte:head>

<form method="GET" class="flex flex-wrap items-end gap-3">
	<div class="min-w-56 flex-1">
		<label class="label" for="q">Search</label>
		<input
			id="q"
			name="q"
			class="field"
			value={data.query}
			placeholder="Model, variant or manufacturer"
		/>
	</div>
	<div>
		<label class="label" for="source">Source</label>
		<select id="source" name="source" class="field w-44">
			<option value="">All sources</option>
			{#each data.sources as s (s.source)}
				<option value={s.source} selected={s.source === data.source}>
					{s.source} ({s.count})
				</option>
			{/each}
		</select>
	</div>
	<button class="btn btn-secondary" type="submit">Filter</button>
	{#if data.query || data.source}
		<a href="/admin/motorcycles" class="btn btn-ghost">Reset</a>
	{/if}
</form>

<p class="text-dim mt-4 text-sm">
	{data.total} motorcycle{data.total === 1 ? '' : 's'} · page {data.page} of {data.pages}
</p>

<div class="panel mt-4 overflow-x-auto">
	<table class="w-full min-w-4xl text-left text-sm">
		<thead class="border-graphite text-dim border-b">
			<tr>
				<th class="stencil px-4 py-3">Motorcycle</th>
				<th class="stencil px-4 py-3">Category</th>
				<th class="stencil px-4 py-3 text-right">cc</th>
				<th class="stencil px-4 py-3 text-right">hp</th>
				<th class="stencil px-4 py-3 text-right">Images</th>
				<th class="stencil px-4 py-3 text-right">Swipes</th>
				<th class="stencil px-4 py-3">Source</th>
				<th class="stencil px-4 py-3">Imported</th>
				<th class="stencil px-4 py-3">Evidence</th>
				<th class="stencil px-4 py-3">Flags</th>
			</tr>
		</thead>
		<tbody>
			{#each data.rows as bike (bike.id)}
				<tr class="border-graphite/60 border-b last:border-0 hover:bg-white/3">
					<td class="px-4 py-3">
						<a href="/motorcycles/{bike.id}" class="hover:text-sodium">
							<span class="text-dim block text-xs">{bike.manufacturer.name}</span>
							<span class="text-bone">{bike.model}</span>
							{#if bike.variant}<span class="text-ash"> {bike.variant}</span>{/if}
							{#if bike.generationLabel}<span class="text-dim numeral">
									{bike.generationLabel}</span
								>{:else if bike.modelYear}<span class="text-dim numeral">
									{bike.modelYear}</span
								>{/if}
						</a>
					</td>
					<td class="text-ash px-4 py-3">
						{CATEGORY_LABELS[bike.category as MotorcycleCategory]}
					</td>
					<td class="numeral text-ash px-4 py-3 text-right">{bike.displacementCc ?? EMPTY}</td>
					<td class="numeral text-ash px-4 py-3 text-right">{bike.powerHp ?? EMPTY}</td>
					<td
						class="numeral px-4 py-3 text-right {bike._count.images === 0
							? 'text-nope'
							: 'text-ash'}"
					>
						{bike._count.images}
					</td>
					<td class="numeral text-ash px-4 py-3 text-right">{bike._count.swipes}</td>
					<td class="px-4 py-3">
						<span class="numeral text-ash text-xs">{bike.source}</span>
						{#if bike.externalId}
							<span class="text-dim numeral block text-[10px]">{bike.externalId}</span>
						{/if}
					</td>
					<td class="text-ash px-4 py-3 text-xs">
						{bike.importedAt ? shortDate(bike.importedAt) : EMPTY}
					</td>
					<td class="px-4 py-3">
						<!--
							Why a card is, or is not, allowed into a discovery deck. Internal
							only: the swiper never sees this, only its consequence.
						-->
						<div class="flex flex-wrap gap-1">
							<span
								class="chip {bike.discoveryEligible
									? 'border-like/40 text-like'
									: 'border-nope/40 text-nope'}"
								title={bike.ineligibleReasons.join(', ') || 'eligible for discovery'}
							>
								{bike.discoveryEligible ? 'deck' : (bike.ineligibleReasons[0] ?? 'ineligible')}
							</span>
							<span class="chip text-dim" title="primary image scope">
								img {bike.imageStatus.toLowerCase().replace('_', ' ')}
							</span>
							{#if bike.availability !== 'UNKNOWN'}
								<span class="chip text-dim">{bike.availability.toLowerCase()}</span>
							{/if}
						</div>
					</td>
					<td class="px-4 py-3">
						<div class="flex flex-wrap gap-1">
							{#if !bike.isActive}
								<span class="chip border-skip/40 text-skip">retired</span>
							{/if}
							{#if bike.manuallyEdited}
								<span class="chip border-cyan/40 text-cyan">edited</span>
							{/if}
						</div>
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="10" class="text-dim px-4 py-10 text-center">
						No motorcycles match that filter.
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

{#if data.pages > 1}
	<nav class="mt-5 flex items-center justify-center gap-2" aria-label="Pagination">
		<a
			href={pageHref(Math.max(data.page - 1, 1))}
			class="btn btn-secondary btn-sm"
			aria-disabled={data.page === 1}
			class:pointer-events-none={data.page === 1}
			class:opacity-40={data.page === 1}
		>
			Previous
		</a>
		<span class="numeral text-ash text-sm">{data.page} / {data.pages}</span>
		<a
			href={pageHref(Math.min(data.page + 1, data.pages))}
			class="btn btn-secondary btn-sm"
			aria-disabled={data.page === data.pages}
			class:pointer-events-none={data.page === data.pages}
			class:opacity-40={data.page === data.pages}
		>
			Next
		</a>
	</nav>
{/if}

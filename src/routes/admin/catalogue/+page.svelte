<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const h = $derived(data.health);

	const pct = (n: number, of: number) => (of ? `${((100 * n) / of).toFixed(1)}%` : '—');
	const num = (n: number) => n.toLocaleString('en-GB');

	const IMAGE_LABELS: Record<string, string> = {
		MODEL_YEAR: 'Model year proven',
		GENERATION: 'Generation proven',
		FAMILY_ONLY: 'Family only',
		SUSPICIOUS: 'Suspicious',
		NONE: 'No photograph'
	};
	const FIELD_LABELS: Record<string, string> = {
		category: 'Category',
		displacementCc: 'Displacement',
		powerHp: 'Power',
		torqueNm: 'Torque',
		wetWeightKg: 'Wet weight',
		seatHeightMm: 'Seat height',
		ridingPosition: 'Riding position',
		passengerAllowed: 'Passenger allowed',
		seatCount: 'Seats',
		licenseCategory: 'Licence category',
		msrpAmount: 'List price',
		availability: 'Availability'
	};
	const REASON_LABELS: Record<string, string> = {
		'no-image': 'No photograph',
		'family-image-on-divided-family': 'Only a family photo on a divided family',
		'identity-thin': 'Identity too thin',
		'not-on-dutch-market': 'Not on the Dutch market'
	};
</script>

<svelte:head><title>Catalogue health — Admin — MotoSwipe</title></svelte:head>

<p class="text-ash mt-6 max-w-2xl text-sm leading-relaxed">
	Generations on sale in {h.since} or later, the same figures as
	<code class="numeral">npm run db:audit</code>. Registrations weight every percentage: a card
	nobody here could buy counts for less.
</p>

<!-- Headline -->
<div class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
	{#each [{ l: 'Modern generations', v: num(h.generations) }, { l: 'In discovery', v: `${num(h.eligible.cards)} · ${pct(h.eligible.registrations, h.registrations)} of registrations` }, { l: 'Top 100 in discovery', v: `${h.top100Eligible} / 100` }, { l: 'Trusted primary photo', v: `${num(h.trustedImage.cards)} · ${pct(h.trustedImage.registrations, h.registrations)}` }] as stat (stat.l)}
		<div class="panel px-4 py-4">
			<p class="numeral text-bone text-xl">{stat.v}</p>
			<p class="stencil mt-1">{stat.l}</p>
		</div>
	{/each}
</div>

<div class="mt-8 grid gap-5 lg:grid-cols-2">
	<!-- Photographs -->
	<section class="panel p-5">
		<h2 class="display text-bone text-base">Photographs</h2>
		<table class="mt-4 w-full text-sm">
			<thead class="stencil text-left">
				<tr
					><th class="pb-2 font-normal">Primary image</th><th class="pb-2 text-right font-normal"
						>Cards</th
					><th class="pb-2 text-right font-normal">Registrations</th></tr
				>
			</thead>
			<tbody class="divide-graphite divide-y">
				{#each h.images as row (row.label)}
					<tr>
						<td class="text-ash py-1.5">{IMAGE_LABELS[row.label] ?? row.label}</td>
						<td class="numeral text-bone py-1.5 text-right">{num(row.cards)}</td>
						<td class="numeral text-ash py-1.5 text-right"
							>{pct(row.registrations, h.registrations)}</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="text-dim mt-4 text-xs">
			Proven photographs per card: none {num(h.photosPerCard.none)} · one {num(h.photosPerCard.one)}
			· two {num(h.photosPerCard.two)} · three or more {num(h.photosPerCard.threePlus)}.
		</p>
		<p class="text-dim mt-2 text-xs">
			Primary image by source: {h.imageSources
				.map((s) => `${s.source} ${num(s.cards)}`)
				.join(' · ')}
		</p>
	</section>

	<!-- Discovery -->
	<section class="panel p-5">
		<h2 class="display text-bone text-base">Why a card is out of discovery</h2>
		<table class="mt-4 w-full text-sm">
			<thead class="stencil text-left">
				<tr
					><th class="pb-2 font-normal">Reason</th><th class="pb-2 text-right font-normal">Cards</th
					><th class="pb-2 text-right font-normal">Registrations</th></tr
				>
			</thead>
			<tbody class="divide-graphite divide-y">
				{#each h.ineligible as row (row.label)}
					<tr>
						<td class="text-ash py-1.5">{REASON_LABELS[row.label] ?? row.label}</td>
						<td class="numeral text-bone py-1.5 text-right">{num(row.cards)}</td>
						<td class="numeral text-ash py-1.5 text-right"
							>{pct(row.registrations, h.registrations)}</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="text-dim mt-4 text-xs">
			A card can carry more than one reason. Availability: {h.availability
				.map((a) => `${a.status} ${num(a.cards)}`)
				.join(' · ')}. Price for a model year on sale now: {num(h.price.current)}; historical list
			price: {num(h.price.historical)}; none: {num(h.price.none)}.
		</p>
	</section>
</div>

<!-- Fields -->
<section class="panel mt-5 overflow-x-auto p-5">
	<h2 class="display text-bone text-base">Specifications, by evidence</h2>
	<p class="text-dim mt-1 text-xs">
		Verified: a source states it for this generation. High: a trusted source, the figure unchecked.
		Inferred: derived (a riding position from the category). Unknown shows as a dash on the card.
		Conflicting: sources disagree, and the card says so.
	</p>
	<table class="mt-4 w-full min-w-[40rem] text-sm">
		<thead class="stencil text-left">
			<tr>
				<th class="pb-2 font-normal">Field</th>
				<th class="pb-2 text-right font-normal">Present</th>
				<th class="pb-2 text-right font-normal">Verified</th>
				<th class="pb-2 text-right font-normal">High</th>
				<th class="pb-2 text-right font-normal">Inferred</th>
				<th class="pb-2 text-right font-normal">Unknown</th>
				<th class="pb-2 text-right font-normal">Conflicting</th>
			</tr>
		</thead>
		<tbody class="divide-graphite divide-y">
			{#each h.fields as row (row.field)}
				<tr>
					<td class="text-ash py-1.5">{FIELD_LABELS[row.field] ?? row.field}</td>
					<td class="numeral text-bone py-1.5 text-right"
						>{num(row.present)}
						<span class="text-dim">({pct(row.present, h.generations)})</span></td
					>
					<td class="numeral text-like py-1.5 text-right">{num(row.verified)}</td>
					<td class="numeral text-ash py-1.5 text-right">{num(row.high)}</td>
					<td class="numeral text-ash py-1.5 text-right">{num(row.inferred)}</td>
					<td class="numeral text-dim py-1.5 text-right">{num(row.unknown)}</td>
					<td class="numeral py-1.5 text-right {row.conflicting ? 'text-skip' : 'text-dim'}"
						>{num(row.conflicting)}</td
					>
				</tr>
			{/each}
		</tbody>
	</table>
</section>

<p class="text-dim mt-4 text-xs">
	Computed just now, {h.generatedAt.slice(0, 16).replace('T', ' ')} UTC.
</p>

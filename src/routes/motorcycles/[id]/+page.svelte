<script lang="ts">
	import BikePhoto from '$lib/components/BikePhoto.svelte';
	import FitBadge from '$lib/components/FitBadge.svelte';
	import HeartButton from '$lib/components/HeartButton.svelte';
	import SpecGrid from '$lib/components/SpecGrid.svelte';
	import {
		CATEGORY_LABELS,
		DECISION_LABELS,
		LICENSE_LABELS,
		RIDING_POSITION_LABELS,
		type LicenseCategory,
		type MotorcycleCategory,
		type RidingPosition
	} from '$lib/domain/enums';
	import { describeYears } from '$lib/domain/view-types';
	import { EMPTY, money, num, shortDate, unit } from '$lib/utils/format';
	import { motorcycleHref } from '$lib/utils/motorcycle-navigation';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const bike = $derived(data.bike);
	let activeImage = $state(0);

	/**
	 * Full-screen photograph.
	 *
	 * The page gives the picture the larger column, but a laptop column is still
	 * not much of a look at a motorcycle. Clicking it hands over the whole
	 * viewport, which is the size at which you can actually tell whether you
	 * like the thing.
	 */
	let lightbox = $state(false);

	function step(delta: number) {
		if (!bike.images.length) return;
		activeImage = (activeImage + delta + bike.images.length) % bike.images.length;
	}

	function onLightboxKey(event: KeyboardEvent) {
		if (!lightbox) return;
		if (event.key === 'Escape') lightbox = false;
		else if (event.key === 'ArrowRight') step(1);
		else if (event.key === 'ArrowLeft') step(-1);
		else return;
		event.preventDefault();
	}

	const title = $derived(
		[bike.manufacturer.name, bike.model, bike.variant].filter(Boolean).join(' ')
	);
	const googleSearchQuery = $derived([title, describeYears(bike)].filter(Boolean).join(' '));
	const googleSearchHref = $derived(
		`https://www.google.com/search?${new URLSearchParams({ q: googleSearchQuery })}`
	);

	/** The family's generations, when the catalogue has told them apart. */
	const generations = $derived(bike.family?.generations ?? []);
	const divided = $derived(generations.length > 1);

	/**
	 * Whether the photograph on screen is only known to be *a* bike of this
	 * family. A search by name finds some Z900; only a file that states its
	 * year is evidence of which one. Saying so beats letting a 2018 picture
	 * stand for the 2025 restyle without comment.
	 */
	const photoIsFamilyWide = $derived(divided && bike.images[activeImage]?.scope === 'FAMILY');

	const engineSpecs = $derived([
		{ label: 'Displacement', value: unit(bike.displacementCc, 'cc') },
		{ label: 'Configuration', value: bike.engineConfiguration ?? EMPTY },
		{ label: 'Cylinders', value: bike.cylinders ? String(bike.cylinders) : EMPTY },
		{ label: 'Cooling', value: bike.cooling ?? EMPTY },
		{
			label: 'Power',
			value:
				bike.powerHp && bike.powerKw
					? `${num(bike.powerHp)} hp / ${num(bike.powerKw)} kW`
					: bike.powerHp
						? `${num(bike.powerHp)} hp`
						: bike.powerKw
							? `${num(bike.powerKw)} kW`
							: EMPTY
		},
		{ label: 'Torque', value: unit(bike.torqueNm, 'Nm', 1) },
		{ label: 'Transmission', value: bike.transmission ?? EMPTY },
		{ label: 'Gears', value: bike.gears ? String(bike.gears) : EMPTY }
	]);

	const physicalSpecs = $derived([
		{
			label: 'Weight',
			value: bike.wetWeightKg
				? `${num(bike.wetWeightKg)} kg`
				: bike.dryWeightKg
					? `${num(bike.dryWeightKg)} kg`
					: EMPTY,
			note: bike.wetWeightKg ? 'Wet (kerb)' : bike.dryWeightKg ? 'Dry — no fluids' : undefined
		},
		{ label: 'Seat height', value: unit(bike.seatHeightMm, 'mm') },
		{
			label: 'Seat width',
			value: unit(bike.seatWidthMm, 'mm'),
			note: bike.seatWidthMm ? undefined : 'Rarely published; affects real reach'
		},
		{ label: 'Wheelbase', value: unit(bike.wheelbaseMm, 'mm') },
		{ label: 'Fuel capacity', value: unit(bike.fuelCapacityLiters, 'L', 1) },
		{
			label: 'Riding position',
			value: bike.ridingPosition
				? RIDING_POSITION_LABELS[bike.ridingPosition as RidingPosition]
				: EMPTY
		}
	]);
</script>

<svelte:head>
	<title>{title} — MotoSwipe</title>
	<meta name="description" content={bike.description ?? `${title} specifications on MotoSwipe.`} />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-10">
	<a
		class="text-dim hover:text-ash inline-flex min-h-11 items-center text-sm transition-colors"
		href={data.returnTo}
	>
		← Back
	</a>

	<!--
		The photograph is why anybody is on this page, so it takes the larger
		column. 4:3 rather than the portrait box it used to sit in: imported
		photographs are overwhelmingly landscape, and a tall frame made a wide
		picture smaller, not bigger.
	-->
	<!-- `minmax(0, …)` on every column: a grid track's automatic minimum is
	     its content's min-content width, and the thumbnail strip would push
	     the whole page wider than a phone. -->
	<div
		class="mt-6 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]"
	>
		<!-- ============ Gallery ============ -->
		<div class="min-w-0">
			<button
				type="button"
				class="panel bg-ink group relative block w-full cursor-zoom-in overflow-hidden"
				style="aspect-ratio: 4 / 3;"
				onclick={() => bike.images.length && (lightbox = true)}
				aria-label="View {title} full screen"
			>
				<BikePhoto
					url={bike.images[activeImage]?.url}
					alt={title}
					class="absolute inset-0"
					priority
				/>
			</button>

			{#if bike.images.length > 1}
				<div class="mt-3 flex gap-2 overflow-x-auto pb-1">
					{#each bike.images as image, index (image.id)}
						<button
							class="bg-ink h-20 w-24 shrink-0 overflow-hidden rounded-md border transition-colors {index ===
							activeImage
								? 'border-sodium'
								: 'border-graphite hover:border-chrome'}"
							onclick={() => (activeImage = index)}
							aria-label="Image {index + 1}"
							aria-current={index === activeImage}
						>
							<img src={image.url} alt="" class="h-full w-full object-cover" loading="lazy" />
						</button>
					{/each}
				</div>
			{/if}

			{#if photoIsFamilyWide}
				<p class="text-dim mt-2 text-xs leading-relaxed">
					<span class="text-sodium/80">Photograph of a {bike.manufacturer.name} {bike.model}</span>
					— the file does not say which generation, so it may show a different one from
					{describeYears(bike)}.
				</p>
			{/if}

			{#if bike.images[activeImage]?.attribution}
				<p class="text-dim mt-2 text-[11px] leading-relaxed">
					{bike.images[activeImage].attribution}
				</p>
			{/if}
		</div>

		<!-- ============ Identity ============ -->
		<div>
			<div class="flex items-start justify-between gap-4">
				<div class="min-w-0">
					<p class="stencil text-sodium">{bike.manufacturer.name}</p>
					<h1 class="display text-bone mt-2 text-[clamp(2.25rem,6vw,3.5rem)] leading-[0.92]">
						{bike.model}
					</h1>
				</div>
				{#if data.canSave}
					<HeartButton
						motorcycleId={bike.id}
						favorited={data.favorited}
						label="{bike.manufacturer.name} {bike.model}"
						class="mt-1 shrink-0"
					/>
				{/if}
			</div>
			{#if bike.variant}
				<p class="display text-ash mt-1 text-xl">{bike.variant}</p>
			{/if}

			<div class="mt-4 flex flex-wrap gap-2">
				<span class="chip">{CATEGORY_LABELS[bike.category as MotorcycleCategory]}</span>
				{#if describeYears(bike)}<span class="chip">{describeYears(bike)}</span>{/if}
				{#if bike.subCategory}<span class="chip">{bike.subCategory}</span>{/if}
				{#each bike.tags as tag (tag)}<span class="chip">{tag}</span>{/each}
				{#if bike.isActive === false}
					<span class="chip border-skip/40 text-skip">No longer listed by the source</span>
				{/if}
			</div>

			<a
				href={googleSearchHref}
				class="btn btn-secondary mt-5 min-h-11"
				target="_blank"
				rel="noopener noreferrer"
				aria-label="Search on Google for {googleSearchQuery} (opens in a new tab)"
				title="{googleSearchQuery} — opens in a new tab"
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<circle cx="10.5" cy="10.5" r="6.5" />
					<path d="m16 16 5 5" stroke-linecap="round" />
				</svg>
				Search on Google
				<span aria-hidden="true">↗</span>
			</a>

			{#if bike.description}
				<p class="text-ash mt-5 text-base leading-relaxed">{bike.description}</p>
			{/if}

			{#if divided}
				<!--
					One family, several machines. The 2017 Z900 and the 2025 one share a
					name and an engine and look nothing alike, which is exactly the
					difference this app is about. Each generation is its own page.
				-->
				<section class="mt-6">
					<h2 class="stencil text-dim">Generations of the {bike.model}</h2>
					<ul class="mt-2 flex flex-wrap gap-2">
						{#each generations as generation (generation.id)}
							{#if generation.id === bike.id}
								<span class="chip border-sodium/60 text-sodium" aria-current="page">
									{generation.generationLabel ?? 'unknown years'}
								</span>
							{:else}
								<a
									href={motorcycleHref(generation.id, data.returnTo)}
									class="chip hover:border-chrome hover:text-bone transition-colors"
									title={generation.boundaryReason ?? undefined}
								>
									{generation.generationLabel ?? 'unknown years'}
								</a>
							{/if}
						{/each}
					</ul>
					{#if bike.boundaryReason}
						<p class="text-dim mt-2 text-xs leading-relaxed">
							{describeYears(bike)}: {bike.boundaryReason}.
							{#if bike.boundarySource === 'DETECTED'}
								Seen in the registry's own figures.
							{:else if bike.boundaryReference}
								<span class="text-dim/80">Source: {bike.boundaryReference}.</span>
							{/if}
						</p>
					{:else if bike.boundarySource === 'UNKNOWN'}
						<p class="text-dim mt-2 text-xs leading-relaxed">
							Where this generation begins and ends has not been established; these are simply the
							years not covered by the others.
						</p>
					{/if}
				</section>
			{/if}

			<!-- Headline numbers -->
			<dl
				class="bg-graphite mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg sm:grid-cols-4"
			>
				{#each [{ l: 'Engine', v: unit(bike.displacementCc, 'cc') }, { l: 'Power', v: unit(bike.powerHp, 'hp') }, { l: 'Weight', v: unit(bike.wetWeightKg ?? bike.dryWeightKg, 'kg') }, { l: 'Price', v: money(bike.msrpAmount, bike.msrpCurrency) }] as item (item.l)}
					<div class="bg-charcoal px-4 py-3">
						<dt class="stencil">{item.l}</dt>
						<dd class="numeral text-bone mt-1 text-lg">{item.v}</dd>
					</div>
				{/each}
			</dl>

			<!-- ============ Rider fit ============ -->
			<section class="mt-8">
				<h2 class="display text-bone text-lg">Will it fit you?</h2>
				<div class="mt-3">
					<FitBadge fit={data.fit} disclaimer={data.fitDisclaimer} />
				</div>
				{#if !data.hasMeasurements}
					<p class="text-dim mt-3 text-xs">
						<a href="/profile" class="text-sodium hover:underline">Add your height and inseam</a>
						and this becomes specific to you.
					</p>
				{/if}
			</section>

			<!-- ============ Passenger ============ -->
			<section class="mt-8">
				<h2 class="display text-bone text-lg">Carrying a passenger</h2>
				<div class="panel-inset mt-3 p-4">
					<dl class="space-y-2.5 text-sm">
						<div class="flex justify-between gap-4">
							<dt class="text-dim">Pillion supported</dt>
							<dd class="text-bone text-right">
								{#if bike.passengerAllowed === true}
									Yes
								{:else if bike.passengerAllowed === false}
									Not as standard
								{:else}
									<span class="text-dim">Not published</span>
								{/if}
							</dd>
						</div>
						<div class="flex justify-between gap-4">
							<dt class="text-dim">Seats</dt>
							<dd class="numeral text-bone">{bike.seatCount ?? EMPTY}</dd>
						</div>
						<div class="flex justify-between gap-4">
							<dt class="text-dim">Passenger pegs</dt>
							<dd class="text-bone text-right">
								{#if bike.passengerPegs === true}
									Fitted
								{:else if bike.passengerPegs === false}
									Not fitted
								{:else}
									<span class="text-dim">Not published</span>
								{/if}
							</dd>
						</div>
					</dl>
					<p class="text-dim border-graphite mt-3 border-t pt-3 text-[11px] leading-relaxed italic">
						Facts about the machine, not a comfort rating.
					</p>
				</div>
			</section>
		</div>
	</div>

	<!-- ============ Full specifications ============ -->
	<section class="mt-12 grid gap-8 lg:grid-cols-2">
		<div>
			<h2 class="display text-bone text-lg">Engine and drivetrain</h2>
			<div class="mt-3"><SpecGrid specs={engineSpecs} /></div>
		</div>
		<div>
			<h2 class="display text-bone text-lg">Chassis and dimensions</h2>
			<div class="mt-3"><SpecGrid specs={physicalSpecs} /></div>
		</div>
	</section>

	<section class="mt-8">
		<h2 class="display text-bone text-lg">Market</h2>
		<div class="mt-3">
			<SpecGrid
				columns={4}
				specs={[
					{ label: 'List price new', value: money(bike.msrpAmount, bike.msrpCurrency) },
					{ label: 'Market', value: bike.marketCountryCode ?? EMPTY },
					{
						label: 'Available new',
						value:
							bike.availableNew === true
								? 'Yes'
								: bike.availableNew === false
									? 'Used market'
									: EMPTY
					},
					{
						label: 'Licence',
						value: bike.licenseCategory
							? LICENSE_LABELS[bike.licenseCategory as LicenseCategory]
							: EMPTY
					}
				]}
			/>

			{#if bike.registrationCount || bike.firstRegistrationYear}
				<!--
					Registry facts, kept apart from the specifications because they
					describe the Dutch market rather than the machine — and because
					"how many are on the road" is the sort of thing that actually tells
					you what a bike is like to own.
				-->
				<div class="mt-3">
					<SpecGrid
						columns={2}
						specs={[
							{
								label: 'Registered in the Netherlands',
								value: bike.registrationCount ? num(bike.registrationCount) : EMPTY
							},
							{ label: 'Registered new', value: describeYears(bike) ?? EMPTY }
						]}
					/>
				</div>
				<p class="text-dim mt-2 text-xs leading-relaxed">
					From the RDW open vehicle register. The price is the Dutch list price when new, averaged
					over the examples on the road — not what one is worth second-hand today.
				</p>
			{/if}
		</div>
	</section>

	<!-- ============ Your decisions ============ -->
	{#if data.decisions.length > 0}
		<section class="mt-12">
			<h2 class="display text-bone text-lg">Your decisions</h2>
			<p class="text-ash mt-2 text-sm">How you have judged this motorcycle across your rounds.</p>
			<ul class="panel divide-graphite mt-4 divide-y overflow-hidden">
				{#each data.decisions as decision (decision.round.id)}
					<li class="flex items-center justify-between gap-4 px-4 py-3">
						<a
							href="/rounds/{decision.round.id}"
							class="text-bone hover:text-sodium min-w-0 truncate text-sm transition-colors"
						>
							{decision.round.name}
						</a>
						<span
							class="chip shrink-0 {decision.decision === 'SUPERLIKE'
								? 'border-superlike/40 text-superlike'
								: decision.decision === 'LIKE'
									? 'border-like/40 text-like'
									: ''}"
						>
							{DECISION_LABELS[decision.decision]}
						</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<!-- ============ Provenance ============ -->
	<section class="mt-12">
		<h2 class="display text-bone text-lg">Where this data came from</h2>
		<div class="panel mt-3 p-5">
			<dl class="text-sm">
				<div class="flex flex-wrap justify-between gap-2 py-1.5">
					<dt class="text-dim">Source</dt>
					<dd class="numeral text-bone">{bike.source}</dd>
				</div>
				{#if bike.externalId}
					<div class="flex flex-wrap justify-between gap-2 py-1.5">
						<dt class="text-dim">Source id</dt>
						<dd class="numeral text-ash">{bike.externalId}</dd>
					</div>
				{/if}
				{#if bike.sourceUrl}
					<div class="flex flex-wrap justify-between gap-2 py-1.5">
						<dt class="text-dim">Source page</dt>
						<dd>
							<a
								href={bike.sourceUrl}
								class="text-sodium break-all hover:underline"
								target="_blank"
								rel="noopener noreferrer nofollow"
							>
								{bike.sourceUrl}
							</a>
						</dd>
					</div>
				{/if}
				{#if bike.importedAt}
					<div class="flex flex-wrap justify-between gap-2 py-1.5">
						<dt class="text-dim">Last imported</dt>
						<dd class="text-ash">{shortDate(bike.importedAt)}</dd>
					</div>
				{/if}
				{#if bike.manuallyEdited}
					<div class="flex flex-wrap justify-between gap-2 py-1.5">
						<dt class="text-dim">Manually corrected</dt>
						<dd class="text-cyan">Yes — importers will not overwrite this row</dd>
					</div>
				{/if}
			</dl>

			{#if bike.source === 'sample'}
				<p
					class="border-skip/30 bg-skip/8 text-skip mt-4 rounded-lg border px-4 py-3 text-xs leading-relaxed"
				>
					Demonstration data: approximate, hand-entered figures and a generated illustration rather
					than a photograph. Check with the manufacturer before you spend money.
				</p>
			{/if}
		</div>
	</section>
</div>

<svelte:window onkeydown={onLightboxKey} />

{#if lightbox && bike.images[activeImage]}
	<!--
		Deliberately plain: the photograph on black, and nothing competing with
		it. Click anywhere, press Escape, or use the arrow keys.
	-->
	<div
		class="bg-void/95 fixed inset-0 z-50 flex flex-col backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-label="{title} photographs"
	>
		<div class="flex items-center justify-between gap-4 px-4 py-3">
			<p class="text-ash truncate text-sm">
				{title}
				{#if bike.images.length > 1}
					<span class="text-dim numeral ml-2">{activeImage + 1} / {bike.images.length}</span>
				{/if}
			</p>
			<button class="btn btn-ghost btn-sm" onclick={() => (lightbox = false)}>Close</button>
		</div>

		<div class="relative min-h-0 flex-1">
			<BikePhoto url={bike.images[activeImage].url} alt={title} class="absolute inset-0" priority />
			<button
				type="button"
				class="absolute top-0 right-0 left-0 h-12 cursor-zoom-out"
				onclick={() => (lightbox = false)}
				aria-label="Close"
			></button>
		</div>

		{#if bike.images.length > 1}
			<div class="flex items-center justify-center gap-3 px-4 py-4">
				<button
					class="btn btn-secondary btn-sm"
					onclick={() => step(-1)}
					aria-label="Previous photo"
				>
					←
				</button>
				<button class="btn btn-secondary btn-sm" onclick={() => step(1)} aria-label="Next photo">
					→
				</button>
			</div>
		{/if}

		{#if bike.images[activeImage].attribution}
			<p class="text-dim px-4 pb-4 text-center text-[11px] leading-relaxed">
				{bike.images[activeImage].attribution}
			</p>
		{/if}
	</div>
{/if}

<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { CATEGORY_LABELS, LICENSE_LABELS, RIDING_POSITION_LABELS } from '$lib/domain/enums';
	import type { MotorcycleCategory } from '$lib/domain/enums';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const errors = $derived(form?.errors ?? {});

	/**
	 * Filters start collapsed and empty. "Show me everything" is the default
	 * path, not a checkbox someone has to find — over-filtering before you have
	 * seen a single bike is exactly the failure mode this product exists to
	 * avoid.
	 */
	let showFilters = $state(false);
	let formEl = $state<HTMLFormElement | null>(null);
	/** The quick start in force, until a filter is touched by hand. */
	let activePreset = $state<string | null>(null);
	/** Makers shown before "show all": the list runs to well over a hundred. */
	const MAKERS_SHOWN = 24;
	let showAllMakers = $state(false);
	let checkedMakers = $state<string[]>([]);

	/**
	 * What is narrowing the deck right now, as removable chips. Read off the
	 * form itself, because presets and "clear" write to the inputs directly.
	 * This is what the bar at the bottom of the screen shows, so a tap deep
	 * in the manufacturer list is never a mystery three screens up.
	 */
	type ActiveChip = { key: string; label: string; remove: () => void };
	let activeChips = $state<ActiveChip[]>([]);

	function refreshSummary() {
		if (!formEl) {
			activeChips = [];
			return;
		}
		const form = formEl;
		const fd = new FormData(form);
		const get = (name: string): string | undefined => {
			const value = fd.get(name);
			return value === null || String(value).trim() === '' ? undefined : String(value);
		};
		const all = (name: string) => fd.getAll(name).map(String).filter(Boolean);
		const clear = (names: string[], value?: string) => () => {
			for (const el of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
				names.map((n) => `[name="${n}"]`).join(',')
			)) {
				if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
					if (value === undefined || el.value === value) el.checked = false;
				} else {
					el.value = '';
				}
			}
			if (names.includes('manufacturerIds')) {
				checkedMakers = value === undefined ? [] : checkedMakers.filter((id) => id !== value);
			}
			schedulePreview();
		};
		const range = (
			key: string,
			minName: string,
			maxName: string,
			unit: (v: string) => string,
			joiner = '–'
		) => {
			const min = get(minName);
			const max = get(maxName);
			if (min === undefined && max === undefined) return;
			const label =
				min !== undefined && max !== undefined
					? `${min}${joiner}${unit(max)}`
					: min !== undefined
						? `${unit(min)} and up`
						: `up to ${unit(max!)}`;
			chips.push({ key, label, remove: clear([minName, maxName]) });
		};

		const chips: ActiveChip[] = [];
		const condition = get('condition');
		if (condition === 'NEW' || condition === 'USED') {
			chips.push({
				key: 'condition',
				label: condition === 'NEW' ? 'New only' : 'Used only',
				remove: clear(['condition'])
			});
		}
		const currency = get('priceCurrency') ?? '';
		range('price', 'priceMin', 'priceMax', (v) =>
			`${currency} ${Number(v).toLocaleString('en-US')}`.trim()
		);
		range('cc', 'displacementMin', 'displacementMax', (v) => `${v} cc`);
		range('hp', 'powerHpMin', 'powerHpMax', (v) => `${v} hp`);
		range('years', 'yearMin', 'yearMax', (v) => v);
		for (const c of all('categories')) {
			chips.push({
				key: `cat:${c}`,
				label: CATEGORY_LABELS[c as MotorcycleCategory] ?? c,
				remove: clear(['categories'], c)
			});
		}
		for (const id of all('manufacturerIds')) {
			chips.push({
				key: `mk:${id}`,
				label: data.manufacturers.find((m) => m.id === id)?.name ?? 'Manufacturer',
				remove: clear(['manufacturerIds'], id)
			});
		}
		for (const p of all('ridingPositions')) {
			chips.push({
				key: `pos:${p}`,
				label: RIDING_POSITION_LABELS[p as keyof typeof RIDING_POSITION_LABELS] ?? p,
				remove: clear(['ridingPositions'], p)
			});
		}
		for (const l of all('licenseCategories')) {
			chips.push({
				key: `lic:${l}`,
				label: LICENSE_LABELS[l as keyof typeof LICENSE_LABELS] ?? l,
				remove: clear(['licenseCategories'], l)
			});
		}
		if (fd.get('passengerRequired') === 'on') {
			chips.push({
				key: 'passenger',
				label: 'Passenger capable',
				remove: clear(['passengerRequired'])
			});
		}
		const seat = get('seatHeightMaxMm');
		if (seat)
			chips.push({ key: 'seat', label: `seat ≤ ${seat} mm`, remove: clear(['seatHeightMaxMm']) });
		if (fd.get('includeNonRoad') === 'on') {
			chips.push({
				key: 'nonroad',
				label: 'Race and concept bikes',
				remove: clear(['includeNonRoad'])
			});
		}
		if (fd.get('includeWithoutPhotos') === 'on') {
			chips.push({
				key: 'nophoto',
				label: 'Bikes without a photo',
				remove: clear(['includeWithoutPhotos'])
			});
		}
		activeChips = chips;
	}
	const visibleManufacturers = $derived(
		showAllMakers || data.manufacturers.length <= MAKERS_SHOWN
			? data.manufacturers
			: data.manufacturers.filter((m, i) => i < MAKERS_SHOWN || checkedMakers.includes(m.id))
	);

	/**
	 * null means "not previewed yet", which renders as the full catalogue size —
	 * an untouched form is a "show me everything" round.
	 */
	let previewCount = $state<number | null | undefined>(undefined);
	const shownCount = $derived(previewCount === undefined ? data.catalogueSize : previewCount);
	let previewing = $state(false);
	let previewTimer: ReturnType<typeof setTimeout> | undefined;

	/** Debounced count preview so typing in a number field is not one POST per keystroke. */
	function schedulePreview() {
		// A filter changed by hand: the preset no longer describes the deck.
		activePreset = null;
		refreshSummary();
		clearTimeout(previewTimer);
		previewTimer = setTimeout(runPreview, 400);
	}

	function toggleMaker(id: string, checked: boolean) {
		checkedMakers = checked ? [...checkedMakers, id] : checkedMakers.filter((m) => m !== id);
		schedulePreview();
	}

	async function runPreview() {
		if (!formEl) return;
		previewing = true;
		try {
			const response = await fetch('/api/deck-count', {
				method: 'POST',
				body: new FormData(formEl)
			});
			// A failed preview must read as unknown, never as the full catalogue.
			// Falling back to `undefined` here showed "1007 motorcycles in this
			// deck" under a filter that actually matched 123.
			if (!response.ok) {
				previewCount = null;
				return;
			}
			const result = (await response.json()) as { count?: number | null };
			previewCount = result.count ?? null;
		} catch {
			// A failed preview must not block round creation; the count simply
			// falls back to unknown.
			previewCount = null;
		} finally {
			previewing = false;
		}
	}

	function clearFilters() {
		if (!formEl) return;
		for (const el of formEl.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
			'[data-filter]'
		)) {
			if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
				el.checked = false;
			} else {
				el.value = '';
			}
		}
		previewCount = undefined;
		activePreset = null;
		checkedMakers = [];
		refreshSummary();
	}

	let submitting = $state(false);

	const currentYear = new Date().getFullYear();

	/**
	 * One-tap starting points.
	 *
	 * Almost nobody opens this form wanting to fill in eleven fields. They open
	 * it with a sentence in their head — "bikes from 2015, under 20 grand" — and
	 * these turn that sentence into the form in one tap. They set fields rather
	 * than submitting, so the next thing you do is adjust them.
	 *
	 * Prices are the Dutch list price when new, which is what the catalogue
	 * actually holds, so the amounts here are the ones that mean something in
	 * euros rather than round numbers borrowed from somewhere else.
	 */
	const PRESETS: { label: string; hint: string; values: Record<string, string> }[] = [
		{
			label: 'From 2015, under €20,000',
			hint: 'Recent, and the money is real',
			values: { yearMin: '2015', priceMax: '20000', priceCurrency: 'EUR' }
		},
		{
			label: 'A2 licence',
			hint: 'Up to 35 kW',
			values: { licenseCategories: 'A2', priceCurrency: 'EUR' }
		},
		{
			label: 'Two-up capable',
			hint: 'Registered for a passenger',
			values: { passengerRequired: 'on', priceCurrency: 'EUR' }
		},
		{
			label: 'Under €8,000',
			hint: 'First bike money',
			values: { priceMax: '8000', priceCurrency: 'EUR' }
		}
	];

	/**
	 * Applies a preset on top of a cleared filter set, so tapping a second one
	 * replaces the first rather than quietly combining into something nobody
	 * asked for.
	 */
	async function applyPreset(preset: (typeof PRESETS)[number]) {
		// The same chip again takes the preset off: back to everything.
		if (activePreset === preset.label) {
			clearFilters();
			return;
		}
		showFilters = true;
		// The filter panel is only in the DOM while it is open, so the inputs a
		// preset writes to do not exist yet when it is applied from collapsed.
		await tick();
		if (!formEl) return;
		clearFilters();
		activePreset = preset.label;

		for (const [name, value] of Object.entries(preset.values)) {
			for (const el of formEl.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
				`[data-filter][name="${name}"]`
			)) {
				if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
					if (el.value === value || value === 'on') el.checked = true;
				} else {
					el.value = value;
				}
			}
		}

		refreshSummary();
		runPreview();
	}
</script>

<svelte:head><title>New round — MotoSwipe</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-10">
	<p class="stencil text-sodium mb-2">Step one</p>
	<h1 class="display text-bone text-4xl">Create a discovery round</h1>
	<p class="text-ash mt-3 max-w-xl text-sm leading-relaxed">
		A round is one question. Name it after what you are trying to decide. Your likes and dislikes
		steer what comes next.
	</p>

	<form
		bind:this={formEl}
		method="POST"
		class="mt-8 space-y-6"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
	>
		{#if errors._ || errors.filters}
			<div
				class="border-nope/40 bg-nope/10 text-nope rounded-lg border px-4 py-3 text-sm"
				role="alert"
			>
				{errors._ ?? errors.filters}
			</div>
		{/if}

		<!-- ============ The essentials ============ -->
		<div class="panel space-y-5 p-6">
			<div>
				<label class="label" for="name">Round name — optional</label>
				<input
					id="name"
					name="name"
					class="field"
					maxlength="80"
					placeholder="First motorcycle {currentYear + 1} — or leave it empty for today's date"
					aria-invalid={errors.name ? 'true' : undefined}
				/>
				{#if errors.name}<p class="text-nope mt-1.5 text-xs">{errors.name}</p>{/if}
			</div>

			<div>
				<label class="label" for="goal">What are you trying to decide? — optional</label>
				<input
					id="goal"
					name="goal"
					class="field"
					maxlength="200"
					placeholder="Something I can commute on and still enjoy on a Sunday"
				/>
			</div>

			<div>
				<label class="label" for="description">Notes — optional</label>
				<textarea
					id="description"
					name="description"
					class="field min-h-20 resize-y"
					maxlength="500"
					placeholder="Budget is flexible. Must be able to carry a passenger occasionally."
				></textarea>
			</div>
		</div>

		<!-- ============ Quick starts ============ -->
		<div class="panel p-5">
			<p class="stencil mb-3">Start from</p>
			<div class="flex flex-wrap gap-2">
				{#each PRESETS as preset (preset.label)}
					<button
						type="button"
						class="chip text-left {activePreset === preset.label ? 'chip-active' : ''}"
						aria-pressed={activePreset === preset.label}
						onclick={() => applyPreset(preset)}
						title={preset.hint}
					>
						{preset.label}
					</button>
				{/each}
			</div>
			<p class="text-dim mt-3 text-xs" aria-live="polite">
				{#if activePreset}
					<span class="text-sodium">{activePreset}</span>
					<span aria-hidden="true">·</span>
					{#if previewing}
						counting…
					{:else if shownCount === null}
						count unknown
					{:else}
						<span class="numeral text-bone">{shownCount}</span>
						motorcycle{shownCount === 1 ? '' : 's'} in the deck
					{/if}
					<span aria-hidden="true">·</span>
					tap again to clear
				{:else}
					Sets the filters below.
				{/if}
			</p>
		</div>

		<!-- ============ Deck size ============ -->
		<div class="panel flex flex-wrap items-center justify-between gap-4 p-5" aria-live="polite">
			<div>
				<p class="stencil">Motorcycles in this deck</p>
				<p class="numeral text-bone mt-1 text-3xl">
					{#if previewing}
						<span class="skeleton inline-block h-7 w-16 align-middle"></span>
					{:else if shownCount === null}
						—
					{:else}
						{shownCount}
					{/if}
				</p>
			</div>
			{#if shownCount === 0}
				<p class="text-nope max-w-xs text-xs leading-relaxed">
					Nothing matches this combination. Loosen a filter — or clear them all and let the deck
					show you everything.
				</p>
			{:else if !showFilters}
				<p class="text-ash max-w-xs text-xs leading-relaxed">
					Everything in the catalogue. Usually right for a first round; your swipes steer the order
					from there.
				</p>
			{/if}
		</div>

		<!-- ============ Filters (optional) ============ -->
		<div class="panel overflow-hidden">
			<button
				type="button"
				class="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-white/3"
				onclick={() => (showFilters = !showFilters)}
				aria-expanded={showFilters}
			>
				<span>
					<span class="display text-bone text-base">Narrow it down</span>
					<span class="text-dim ml-2 text-sm">optional</span>
				</span>
				<span class="text-chrome text-lg" aria-hidden="true">{showFilters ? '−' : '+'}</span>
			</button>

			{#if showFilters}
				<div class="border-graphite space-y-6 border-t px-6 py-6">
					<p class="text-ash text-xs leading-relaxed">
						Filters only narrow. Unknown values are excluded: a bike with no published power never
						passes a power filter.
					</p>

					<!-- Condition -->
					<div>
						<span class="label">Condition</span>
						<div class="flex flex-wrap gap-2">
							{#each [{ v: '', l: 'Either' }, { v: 'NEW', l: 'New' }, { v: 'USED', l: 'Used' }] as option (option.l)}
								<label class="chip has-checked:chip-active cursor-pointer">
									<input
										type="radio"
										name="condition"
										value={option.v}
										data-filter
										class="sr-only"
										checked={option.v === ''}
										onchange={schedulePreview}
									/>
									{option.l}
								</label>
							{/each}
						</div>
					</div>

					<!-- Numeric ranges -->
					<div class="grid gap-5 sm:grid-cols-2">
						<div>
							<span class="label">Displacement (cc)</span>
							<div class="flex items-center gap-2">
								<input
									name="displacementMin"
									type="number"
									class="field"
									data-filter
									placeholder={String(data.bounds.displacementCc.min)}
									min="0"
									max="5000"
									oninput={schedulePreview}
									aria-label="Minimum displacement"
								/>
								<span class="text-dim">–</span>
								<input
									name="displacementMax"
									type="number"
									class="field"
									data-filter
									placeholder={String(data.bounds.displacementCc.max)}
									min="0"
									max="5000"
									oninput={schedulePreview}
									aria-label="Maximum displacement"
								/>
							</div>
						</div>

						<div>
							<span class="label">Power (hp)</span>
							<div class="flex items-center gap-2">
								<input
									name="powerHpMin"
									type="number"
									class="field"
									data-filter
									placeholder={String(Math.round(data.bounds.powerHp.min))}
									min="0"
									max="1000"
									oninput={schedulePreview}
									aria-label="Minimum power"
								/>
								<span class="text-dim">–</span>
								<input
									name="powerHpMax"
									type="number"
									class="field"
									data-filter
									placeholder={String(Math.round(data.bounds.powerHp.max))}
									min="0"
									max="1000"
									oninput={schedulePreview}
									aria-label="Maximum power"
								/>
							</div>
						</div>

						<div>
							<span class="label">Years available</span>
							<div class="flex items-center gap-2">
								<input
									name="yearMin"
									type="number"
									class="field"
									data-filter
									placeholder={String(data.bounds.modelYear.min)}
									min="1900"
									max="2100"
									oninput={schedulePreview}
									aria-label="Earliest model year"
								/>
								<span class="text-dim">–</span>
								<input
									name="yearMax"
									type="number"
									class="field"
									data-filter
									placeholder={String(data.bounds.modelYear.max)}
									min="1900"
									max="2100"
									oninput={schedulePreview}
									aria-label="Latest model year"
								/>
							</div>
							<p class="text-dim mt-1.5 text-xs">
								Years the model was on sale, not when it was introduced.
							</p>
						</div>

						<div>
							<span class="label">Price</span>
							<div class="flex items-center gap-2">
								<input
									name="priceMin"
									type="number"
									class="field"
									data-filter
									placeholder="0"
									min="0"
									oninput={schedulePreview}
									aria-label="Minimum price"
								/>
								<span class="text-dim">–</span>
								<input
									name="priceMax"
									type="number"
									class="field"
									data-filter
									placeholder={String(Math.round(data.bounds.msrpAmount.max))}
									min="0"
									oninput={schedulePreview}
									aria-label="Maximum price"
								/>
								<select
									name="priceCurrency"
									class="field w-24"
									data-filter
									onchange={schedulePreview}
									aria-label="Price currency"
								>
									<option value="EUR">EUR</option>
									<option value="USD">USD</option>
									<option value="GBP">GBP</option>
								</select>
							</div>
							<p class="text-dim mt-1.5 text-xs">
								List price when new. Bikes priced in another currency are excluded.
							</p>
						</div>
					</div>

					<!-- Categories -->
					<div>
						<span class="label">Categories</span>
						<div class="flex flex-wrap gap-2">
							{#each data.categories as category (category.category)}
								<label class="chip has-checked:chip-active cursor-pointer">
									<input
										type="checkbox"
										name="categories"
										value={category.category}
										data-filter
										class="sr-only"
										onchange={schedulePreview}
									/>
									{CATEGORY_LABELS[category.category as MotorcycleCategory]}
									<span class="text-dim ml-1">{category.count}</span>
								</label>
							{/each}
						</div>
					</div>

					<!-- Manufacturers -->
					<div>
						<span class="label">Manufacturers</span>
						<div class="flex flex-wrap gap-2">
							{#each visibleManufacturers as manufacturer (manufacturer.id)}
								<label class="chip has-checked:chip-active cursor-pointer">
									<input
										type="checkbox"
										name="manufacturerIds"
										value={manufacturer.id}
										data-filter
										class="sr-only"
										checked={checkedMakers.includes(manufacturer.id)}
										onchange={(e) => toggleMaker(manufacturer.id, e.currentTarget.checked)}
									/>
									{manufacturer.name}
									<span class="text-dim ml-1">{manufacturer.count}</span>
								</label>
							{/each}
						</div>
						{#if data.manufacturers.length > MAKERS_SHOWN}
							<button
								type="button"
								class="text-sodium mt-3 text-xs hover:underline"
								onclick={() => (showAllMakers = !showAllMakers)}
							>
								{showAllMakers
									? 'Show fewer'
									: `Show all ${data.manufacturers.length} manufacturers`}
							</button>
						{/if}
					</div>

					<!-- Riding position / licence -->
					<div class="grid gap-5 sm:grid-cols-2">
						<div>
							<span class="label">Riding position</span>
							<div class="flex flex-wrap gap-2">
								{#each Object.entries(RIDING_POSITION_LABELS).filter(([k]) => k !== 'UNKNOWN') as [value, label] (value)}
									<label class="chip has-checked:chip-active cursor-pointer">
										<input
											type="checkbox"
											name="ridingPositions"
											{value}
											data-filter
											class="sr-only"
											onchange={schedulePreview}
										/>
										{label}
									</label>
								{/each}
							</div>
						</div>

						<div>
							<span class="label">Licence category</span>
							<div class="flex flex-wrap gap-2">
								{#each Object.entries(LICENSE_LABELS).filter(([k]) => k !== 'UNKNOWN') as [value, label] (value)}
									<label class="chip has-checked:chip-active cursor-pointer">
										<input
											type="checkbox"
											name="licenseCategories"
											{value}
											data-filter
											class="sr-only"
											onchange={schedulePreview}
										/>
										{label}
									</label>
								{/each}
							</div>
						</div>
					</div>

					<!-- Passenger + fit -->
					<div class="space-y-4">
						<label class="flex cursor-pointer items-start gap-3">
							<input
								type="checkbox"
								name="includeNonRoad"
								data-filter
								class="accent-sodium mt-0.5 h-4 w-4"
								onchange={schedulePreview}
							/>
							<span>
								<span class="text-bone text-sm">Include race and concept machines</span>
								<span class="text-dim block text-xs leading-relaxed">
									Prototypes, concept bikes and military machines are left out by default. Turn this
									on for a dream-garage round.
								</span>
							</span>
						</label>

						<label class="flex cursor-pointer items-start gap-3">
							<input
								type="checkbox"
								name="passengerRequired"
								data-filter
								class="accent-sodium mt-0.5 h-4 w-4"
								onchange={schedulePreview}
							/>
							<span>
								<span class="text-bone text-sm">Must carry a passenger</span>
								<span class="text-dim block text-xs leading-relaxed">
									Only bikes with a confirmed pillion seat. Unknown is excluded.
								</span>
							</span>
						</label>

						<div>
							<label class="label" for="seatHeightMaxMm">Maximum seat height (mm)</label>
							<input
								id="seatHeightMaxMm"
								name="seatHeightMaxMm"
								type="number"
								class="field sm:w-48"
								data-filter
								min="400"
								max="1200"
								placeholder="No limit"
								oninput={schedulePreview}
							/>
							<p class="text-dim mt-1.5 text-xs leading-relaxed">
								Seat height alone does not decide fit — seat width, suspension sag and your boots
								all matter. Use this only if you want a hard cut-off. Unknown is excluded.
							</p>
						</div>
					</div>

					<div class="border-graphite flex items-center justify-between border-t pt-4">
						<button type="button" class="btn btn-ghost btn-sm" onclick={clearFilters}>
							Clear all filters
						</button>
						<span class="text-dim text-xs">Everything here is optional</span>
					</div>
				</div>
			{/if}
		</div>

		<!-- Sticks to the bottom of the screen: the count and every active filter
		     stay in view however far down the form a tap happened. -->
		<div
			class="border-graphite/80 bg-void/90 pb-safe sticky bottom-0 z-30 -mx-4 border-t px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-xl sm:border"
			aria-live="polite"
		>
			<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
				<div class="flex min-w-0 flex-1 items-center gap-2">
					<p class="shrink-0 text-sm">
						{#if previewing}
							<span class="skeleton inline-block h-5 w-10 align-middle"></span>
						{:else if shownCount === null}
							<span class="numeral text-bone text-lg">—</span>
						{:else}
							<span class="numeral text-bone text-lg">{shownCount}</span>
						{/if}
						<span class="text-ash">motorcycle{shownCount === 1 ? '' : 's'}</span>
					</p>
					{#if activeChips.length}
						<!-- One line that scrolls sideways: a phone's width is for the
						     count and the button, not for a wrapping cloud of chips. -->
						<div
							class="flex min-w-0 flex-1 [scrollbar-width:none] items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden"
						>
							{#each activeChips as chip (chip.key)}
								<button
									type="button"
									class="chip chip-active shrink-0 text-[11px] whitespace-nowrap"
									onclick={chip.remove}
									title="Remove this filter"
								>
									{chip.label}
									<span aria-hidden="true">×</span>
								</button>
							{/each}
							<button
								type="button"
								class="text-dim shrink-0 text-xs whitespace-nowrap underline"
								onclick={clearFilters}
							>
								clear all
							</button>
						</div>
					{:else}
						<span class="text-dim min-w-0 text-xs">Everything in the catalogue</span>
					{/if}
				</div>
				<div class="flex items-center gap-2 sm:shrink-0">
					<a href="/dashboard" class="btn btn-ghost btn-sm">Cancel</a>
					<button
						class="btn btn-primary flex-1 sm:flex-none"
						type="submit"
						disabled={submitting || shownCount === 0}
					>
						{submitting ? 'Creating…' : 'Start swiping'}
					</button>
				</div>
			</div>
		</div>
	</form>
</div>

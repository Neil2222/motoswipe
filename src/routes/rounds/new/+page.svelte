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
		clearTimeout(previewTimer);
		previewTimer = setTimeout(runPreview, 400);
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
		showFilters = true;
		// The filter panel is only in the DOM while it is open, so the inputs a
		// preset writes to do not exist yet when it is applied from collapsed.
		await tick();
		if (!formEl) return;
		clearFilters();

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

		runPreview();
	}
</script>

<svelte:head><title>New round — MotoSwipe</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-10">
	<p class="stencil text-sodium mb-2">Step one</p>
	<h1 class="display text-bone text-4xl">Create a discovery round</h1>
	<p class="text-ash mt-3 max-w-xl text-sm leading-relaxed">
		A round is one question. Name it after what you are actually trying to decide, and it will still
		make sense when you come back to it next year.
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
				<label class="label" for="name">Round name</label>
				<input
					id="name"
					name="name"
					class="field"
					required
					maxlength="80"
					placeholder="First motorcycle {currentYear + 1}"
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
						class="chip text-left"
						onclick={() => applyPreset(preset)}
						title={preset.hint}
					>
						{preset.label}
					</button>
				{/each}
			</div>
			<p class="text-dim mt-3 text-xs">
				Sets the filters below — nothing is locked in until you create the round.
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
					Everything in the catalogue. That is usually the right answer for a first round.
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
						A filter only ever narrows. If a motorcycle has no published horsepower and you ask for
						100 hp or more, it is left out — we will not assume a missing number qualifies.
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
								When the model was on sale, not when it was introduced — a Kawasaki Z650 dates from
								1977 and is still sold today.
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
								List price when new. Euro prices come from the Dutch vehicle registry; prices are
								only ever compared within one currency.
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
							{#each data.manufacturers as manufacturer (manufacturer.id)}
								<label class="chip has-checked:chip-active cursor-pointer">
									<input
										type="checkbox"
										name="manufacturerIds"
										value={manufacturer.id}
										data-filter
										class="sr-only"
										onchange={schedulePreview}
									/>
									{manufacturer.name}
									<span class="text-dim ml-1">{manufacturer._count.motorcycles}</span>
								</label>
							{/each}
						</div>
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
									Grand Prix prototypes, streamliners, concept bikes and military machines are left
									out by default, because they are not motorcycles you can go and buy. Turn this on
									for a dream-garage round.
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
									Only motorcycles where a pillion is explicitly supported. Bikes with no published
									answer are excluded rather than assumed.
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
								Off by default, and deliberately so. Seat height alone does not decide whether a
								bike suits you — seat width, suspension sag and your boots all matter. Use this only
								if you already know you want a hard cut-off.
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

		<div class="flex flex-wrap items-center gap-3">
			<button class="btn btn-primary btn-lg" type="submit" disabled={submitting}>
				{submitting ? 'Creating…' : 'Create round and start swiping'}
			</button>
			<a href="/dashboard" class="btn btn-ghost">Cancel</a>
		</div>
	</form>
</div>

<script lang="ts">
	import BikePhoto from '$lib/components/BikePhoto.svelte';
	import HeartButton from '$lib/components/HeartButton.svelte';
	import { CATEGORY_LABELS, type MotorcycleCategory } from '$lib/domain/enums';
	import { describeYears } from '$lib/domain/view-types';
	import { enhance } from '$app/forms';
	import { money, shortDate } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let starting = $state(false);
</script>

<svelte:head><title>Your garage — MotoSwipe</title></svelte:head>

<div class="mx-auto max-w-5xl px-4 py-8">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="stencil text-sodium mb-2">Kept</p>
			<h1 class="display text-bone text-3xl sm:text-4xl">Your garage</h1>
			<p class="text-ash mt-2 max-w-xl text-sm leading-relaxed">
				Motorcycles you hearted while browsing. Nothing here expires and nothing here is tied to a
				round — it is just the list of bikes you liked the look of.
			</p>
		</div>
		<div class="flex items-center gap-2">
			<a href="/motorcycles" class="btn btn-secondary btn-sm">Browse the catalogue</a>
			{#if data.saved.length >= 2}
				<!--
					The way back into the product. A garage of thirty bikes eventually
					poses the question "yes, but which one", and that question is a
					round: swipe your own saved bikes as a second pass, then compare
					the survivors head to head.
				-->
				<form
					method="POST"
					action="?/startRound"
					use:enhance={() => {
						starting = true;
						return async ({ update }) => {
							await update();
							starting = false;
						};
					}}
				>
					<button class="btn btn-primary btn-sm" disabled={starting}>
						{starting ? 'Starting…' : 'Settle it in a round'}
					</button>
				</form>
			{/if}
		</div>
	</div>

	{#if form?.error}
		<div
			class="border-nope/40 bg-nope/10 text-nope mt-4 rounded-lg border px-4 py-3 text-sm"
			role="alert"
		>
			{form.error}
		</div>
	{/if}

	{#if data.saved.length === 0}
		<div class="panel mt-8 p-10 text-center">
			<p class="display text-bone text-lg">Nothing saved yet</p>
			<p class="text-ash mx-auto mt-2 max-w-md text-sm leading-relaxed">
				Search the catalogue and tap the heart on anything you like. It will be here when you come
				back.
			</p>
			<a href="/motorcycles" class="btn btn-primary mt-5">Find a motorcycle</a>
		</div>
	{:else}
		<p class="text-dim mt-6 text-xs">
			{data.saved.length}
			{data.saved.length === 1 ? 'motorcycle' : 'motorcycles'}
		</p>

		<ul class="mt-3 space-y-3">
			{#each data.saved as entry (entry.bike.id)}
				<li class="panel flex items-stretch gap-4 overflow-hidden">
					<a
						href="/motorcycles/{entry.bike.id}"
						class="relative w-28 shrink-0 sm:w-40"
						aria-label="{entry.bike.manufacturer.name} {entry.bike.model}"
					>
						<BikePhoto
							url={entry.bike.images[0]?.url}
							alt="{entry.bike.manufacturer.name} {entry.bike.model}"
							class="absolute inset-0"
						/>
					</a>

					<div class="min-w-0 flex-1 py-3">
						<a href="/motorcycles/{entry.bike.id}" class="block">
							<p class="stencil text-sodium truncate text-[0.65rem]">
								{entry.bike.manufacturer.name}
							</p>
							<p class="text-bone mt-0.5 truncate font-medium">{entry.bike.model}</p>
						</a>
						<p class="text-dim numeral mt-1 flex flex-wrap gap-x-3 text-xs">
							<span>{CATEGORY_LABELS[entry.bike.category as MotorcycleCategory]}</span>
							{#if describeYears(entry.bike)}<span>{describeYears(entry.bike)}</span>{/if}
							{#if entry.bike.msrpAmount}
								<span>{money(entry.bike.msrpAmount, entry.bike.msrpCurrency)}</span>
							{/if}
						</p>
						<p class="text-dim mt-1 text-[0.65rem]">Saved {shortDate(entry.savedAt)}</p>
					</div>

					<div class="flex items-center pr-3">
						<HeartButton
							motorcycleId={entry.bike.id}
							favorited={true}
							label="{entry.bike.manufacturer.name} {entry.bike.model}"
							size="sm"
							reloadOnChange
						/>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

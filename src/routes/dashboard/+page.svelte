<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import RoundCard from '$lib/components/RoundCard.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const manufacturerNames = $derived(
		new Map(data.manufacturers.map((m) => [m.id, m.name] as const))
	);

	type Round = (typeof data.rounds)[number];

	// Duplicate flow: a small dialog so the copy gets a distinct name up front.
	// Silently creating "First bike 2026 (copy)" would leave the dashboard full
	// of near-identical entries.
	let duplicating = $state<Round | null>(null);
	let duplicateName = $state('');
	let archiving = $state<Round | null>(null);

	let duplicateForm = $state<HTMLFormElement | null>(null);
	let archiveForm = $state<HTMLFormElement | null>(null);
	let unarchiveForm = $state<HTMLFormElement | null>(null);
	let pendingRoundId = $state('');

	function startDuplicate(round: Round) {
		duplicating = round;
		// Suggest next year: the canonical use case is re-running last year's
		// question with a fresh deck.
		duplicateName = round.name.replace(/\b(20\d{2})\b/, (y) => String(Number(y) + 1));
		if (duplicateName === round.name) duplicateName = `${round.name} (again)`;
	}

	function startArchive(round: Round) {
		archiving = round;
	}

	function doUnarchive(round: Round) {
		pendingRoundId = round.id;
		queueMicrotask(() => unarchiveForm?.requestSubmit());
	}

	const active = $derived(data.rounds.filter((r) => r.status !== 'ARCHIVED'));
	const archived = $derived(data.rounds.filter((r) => r.status === 'ARCHIVED'));
</script>

<svelte:head><title>Dashboard — MotoSwipe</title></svelte:head>

<div class="mx-auto max-w-6xl px-4 py-10">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="stencil text-sodium mb-2">Your rounds</p>
			<h1 class="display text-bone text-4xl">Dashboard</h1>
		</div>
		<div class="flex items-center gap-2">
			<!-- The other way in. Not every visit is a decision to make; sometimes
			     you just want to look a motorcycle up. -->
			<a href="/motorcycles" class="btn btn-secondary">
				Browse{data.savedCount ? '' : ' the catalogue'}
			</a>
			{#if data.savedCount}
				<a href="/garage" class="btn btn-secondary">
					Garage <span class="numeral text-dim ml-1.5">{data.savedCount}</span>
				</a>
			{/if}
			<a href="/rounds/new" class="btn btn-primary">New round</a>
		</div>
	</div>

	{#if data.rounds.length === 0}
		<div class="panel mt-10">
			<EmptyState
				glyph="◎"
				title="No rounds yet"
				body="A discovery round is one question you want answered — a first bike, something for two-up, a dream garage. Create one and start swiping. There are {data.catalogueSize} motorcycles waiting."
			>
				<a href="/rounds/new" class="btn btn-primary btn-lg">Create your first round</a>
			</EmptyState>
		</div>
	{:else}
		<div class="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
			{#each active as round (round.id)}
				<RoundCard
					{round}
					{manufacturerNames}
					onduplicate={startDuplicate}
					onarchive={startArchive}
					onunarchive={doUnarchive}
				/>
			{/each}
		</div>

		{#if data.includeArchived && archived.length > 0}
			<h2 class="display text-ash mt-14 text-xl">Archived</h2>
			<div class="mt-5 grid gap-5 opacity-70 md:grid-cols-2 xl:grid-cols-3">
				{#each archived as round (round.id)}
					<RoundCard
						{round}
						{manufacturerNames}
						onduplicate={startDuplicate}
						onarchive={startArchive}
						onunarchive={doUnarchive}
					/>
				{/each}
			</div>
		{/if}

		<div class="mt-10">
			<a
				href={data.includeArchived ? '/dashboard' : '/dashboard?archived=1'}
				class="btn btn-ghost btn-sm"
				data-sveltekit-noscroll
			>
				{data.includeArchived ? 'Hide archived rounds' : 'Show archived rounds'}
			</a>
		</div>
	{/if}
</div>

<!-- Hidden forms: the dialogs drive these so each action is still a real POST
     that works without JavaScript if the dialog is bypassed. -->
<form
	bind:this={duplicateForm}
	method="POST"
	action="?/duplicate"
	class="hidden"
	use:enhance={() =>
		async ({ result }) => {
			duplicating = null;
			if (result.type === 'success') {
				const created = result.data as { duplicatedId?: string; duplicatedName?: string };
				await invalidateAll();
				toasts.success(`Created "${created.duplicatedName}"`, {
					label: 'Open',
					run: () => goto(`/rounds/${created.duplicatedId}/swipe`)
				});
			} else if (result.type === 'failure') {
				toasts.error(
					(result.data as { errors?: Record<string, string> })?.errors?._ ??
						'Could not duplicate that round'
				);
			}
		}}
>
	<input type="hidden" name="roundId" value={duplicating?.id ?? ''} />
	<input type="hidden" name="name" value={duplicateName} />
</form>

<form
	bind:this={archiveForm}
	method="POST"
	action="?/archive"
	class="hidden"
	use:enhance={() =>
		async ({ result }) => {
			archiving = null;
			if (result.type === 'success') {
				await invalidateAll();
				toasts.success('Round archived');
			} else {
				toasts.error('Could not archive that round');
			}
		}}
>
	<input type="hidden" name="roundId" value={archiving?.id ?? ''} />
</form>

<form
	bind:this={unarchiveForm}
	method="POST"
	action="?/unarchive"
	class="hidden"
	use:enhance={() =>
		async ({ result }) => {
			if (result.type === 'success') {
				await invalidateAll();
				toasts.success('Round restored');
			} else {
				toasts.error('Could not restore that round');
			}
		}}
>
	<input type="hidden" name="roundId" value={pendingRoundId} />
</form>

<!-- Duplicate dialog -->
{#if duplicating}
	<div class="fixed inset-0 z-[70] flex items-center justify-center p-4">
		<button
			class="absolute inset-0 cursor-default bg-black/75 backdrop-blur-sm"
			onclick={() => (duplicating = null)}
			aria-label="Cancel"
			tabindex="-1"
		></button>
		<div class="panel relative w-full max-w-md p-6" role="dialog" aria-modal="true">
			<h2 class="display text-bone text-xl">Duplicate round</h2>
			<p class="text-ash mt-3 text-sm leading-relaxed">
				This copies the description, goal and filters of
				<span class="text-bone">{duplicating.name}</span> into a brand new round. Your swipes,
				comparisons and ranking are <em>not</em> copied — the point is a clean second run at the same
				question.
			</p>

			<label class="label mt-5" for="duplicate-name">Name for the new round</label>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				id="duplicate-name"
				class="field"
				bind:value={duplicateName}
				maxlength="80"
				autofocus
				onkeydown={(e) => {
					if (e.key === 'Enter' && duplicateName.trim()) {
						e.preventDefault();
						duplicateForm?.requestSubmit();
					}
				}}
			/>

			<div class="mt-6 flex justify-end gap-2">
				<button class="btn btn-ghost" onclick={() => (duplicating = null)}>Cancel</button>
				<button
					class="btn btn-primary"
					disabled={!duplicateName.trim()}
					onclick={() => duplicateForm?.requestSubmit()}
				>
					Create copy
				</button>
			</div>
		</div>
	</div>
{/if}

<ConfirmDialog
	open={archiving !== null}
	title="Archive this round?"
	body="It disappears from your dashboard but nothing is deleted — the swipes, ranking and results all stay, and you can restore it at any time."
	confirmLabel="Archive"
	onconfirm={() => archiveForm?.requestSubmit()}
	oncancel={() => (archiving = null)}
/>

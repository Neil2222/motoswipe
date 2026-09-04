<script lang="ts">
	import { enhance } from '$app/forms';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { describeFilters, type RoundFilters } from '$lib/domain/filters';
	import { ROUND_STATUS_LABELS } from '$lib/domain/enums';
	import { progressWidth, relativeTime, shortDate } from '$lib/utils/format';
	import { toasts } from '$lib/stores/toast.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const manufacturerNames = $derived(
		new Map(data.manufacturers.map((m) => [m.id, m.name] as const))
	);
	const filterChips = $derived(
		describeFilters((data.round.filters ?? {}) as RoundFilters, manufacturerNames)
	);

	const p = $derived(data.progress);
	const deckDone = $derived(p.remaining === 0 && p.total > 0);

	let editing = $state(false);
	let completing = $state(false);
	let completeForm = $state<HTMLFormElement | null>(null);
	let forceComplete = $state(false);

	function askComplete() {
		forceComplete = !deckDone;
		completing = true;
	}
</script>

<svelte:head><title>{data.round.name} — MotoSwipe</title></svelte:head>

<div class="mx-auto max-w-4xl px-4 py-10">
	<a href="/dashboard" class="text-dim hover:text-ash text-sm transition-colors">← Dashboard</a>

	<div class="mt-4 flex flex-wrap items-start justify-between gap-4">
		<div class="min-w-0">
			<p class="stencil text-sodium mb-2">Discovery round</p>
			<h1 class="display text-bone text-4xl break-words">{data.round.name}</h1>
			{#if data.round.goal}
				<p class="text-ash mt-3 max-w-xl text-sm leading-relaxed">{data.round.goal}</p>
			{/if}
		</div>
		<span class="chip shrink-0">{ROUND_STATUS_LABELS[data.round.status]}</span>
	</div>

	{#if data.round.description}
		<p class="text-ash mt-4 max-w-2xl text-sm leading-relaxed whitespace-pre-line">
			{data.round.description}
		</p>
	{/if}

	<div class="mt-4 flex flex-wrap gap-1.5">
		{#if filterChips.length === 0}
			<span class="chip">Everything in the catalogue</span>
		{:else}
			{#each filterChips as chip (chip)}<span class="chip">{chip}</span>{/each}
		{/if}
	</div>

	<p class="text-dim mt-3 text-xs">
		Created {shortDate(data.round.createdAt)}
		{#if data.round.completedAt}· completed {shortDate(data.round.completedAt)}{/if}
	</p>

	<!-- ============ Progress ============ -->
	<section class="panel mt-8 p-6">
		<div class="flex items-baseline justify-between">
			<h2 class="display text-bone text-lg">Progress</h2>
			<span class="numeral text-bone text-2xl">
				{p.swiped}<span class="text-dim text-base">/{p.total}</span>
			</span>
		</div>

		<div class="bg-graphite mt-4 h-2 overflow-hidden rounded-full">
			<div
				class="h-full rounded-full transition-all duration-500 {deckDone ? 'bg-cyan' : 'bg-sodium'}"
				style:width={progressWidth(p.swiped, p.total)}
			></div>
		</div>

		<dl class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
			{#each [{ l: 'Likes', v: p.likes, t: 'text-like' }, { l: 'Superlikes', v: p.superlikes, t: 'text-superlike' }, { l: 'Nope', v: p.dislikes, t: 'text-ash' }, { l: 'Skipped', v: p.skips, t: 'text-ash' }] as stat (stat.l)}
				<div class="panel-inset px-3 py-3 text-center">
					<dd class="numeral text-xl {stat.t}">{stat.v}</dd>
					<dt class="stencil mt-1">{stat.l}</dt>
				</div>
			{/each}
		</dl>

		{#if data.lastSwipe}
			<p class="text-dim mt-4 text-xs">
				Last decision {relativeTime(data.lastSwipe.updatedAt)} —
				{data.lastSwipe.motorcycle.manufacturer.name}
				{data.lastSwipe.motorcycle.model}
			</p>
		{/if}
	</section>

	<!-- ============ Next step ============ -->
	<section class="mt-6 grid gap-4 sm:grid-cols-2">
		<div class="panel flex flex-col p-6">
			<h3 class="display text-bone text-base">
				{deckDone
					? 'Swiping finished'
					: p.swiped > 0
						? 'Pick up where you left off'
						: 'Start swiping'}
			</h3>
			<p class="text-ash mt-2 flex-1 text-sm leading-relaxed">
				{#if deckDone}
					You have been through every motorcycle in this deck.
				{:else}
					{p.remaining} motorcycle{p.remaining === 1 ? '' : 's'} still to see. Everything is saved as
					you go — stop whenever you like.
				{/if}
			</p>
			{#if !deckDone && data.round.status !== 'ARCHIVED'}
				<a href="/rounds/{data.round.id}/swipe" class="btn btn-primary mt-4 self-start">
					{p.swiped > 0 ? 'Resume swiping' : 'Start swiping'}
				</a>
			{/if}
		</div>

		<div class="panel flex flex-col p-6">
			<h3 class="display text-bone text-base">Compare your shortlist</h3>
			<p class="text-ash mt-2 flex-1 text-sm leading-relaxed">
				{#if p.shortlist < 2}
					You need at least two liked motorcycles before head-to-head comparisons make sense. You
					have {p.shortlist}.
				{:else}
					{p.shortlist} motorcycles on the shortlist, {data.comparisons} comparison{data.comparisons ===
					1
						? ''
						: 's'} so far.
				{/if}
			</p>
			{#if p.shortlist >= 2}
				<a href="/rounds/{data.round.id}/compare" class="btn btn-primary mt-4 self-start">
					{data.comparisons > 0 ? 'Continue comparing' : 'Start comparing'}
				</a>
			{/if}
		</div>
	</section>

	<div class="mt-4 flex flex-wrap gap-2">
		{#if p.shortlist > 0}
			<a href="/rounds/{data.round.id}/likes" class="btn btn-secondary">
				Shortlist ({p.shortlist})
			</a>
		{/if}
		{#if p.swiped > 0}
			<a href="/rounds/{data.round.id}/results" class="btn btn-secondary">Results & statistics</a>
		{/if}
		<button class="btn btn-ghost" onclick={() => (editing = !editing)}>
			{editing ? 'Cancel edit' : 'Edit details'}
		</button>
		{#if data.round.status === 'COMPLETED'}
			<form method="POST" action="?/reopen" use:enhance>
				<button class="btn btn-ghost" type="submit">Reopen round</button>
			</form>
		{:else if p.swiped > 0}
			<button class="btn btn-ghost" onclick={askComplete}>Mark complete</button>
		{/if}
	</div>

	<!-- ============ Edit ============ -->
	{#if editing}
		<form
			method="POST"
			action="?/rename"
			class="panel mt-6 space-y-5 p-6"
			use:enhance={() =>
				async ({ update, result }) => {
					await update({ reset: false });
					if (result.type === 'success') {
						editing = false;
						toasts.success('Round updated');
					}
				}}
		>
			{#if form?.errors?._}
				<p class="text-nope text-sm" role="alert">{form.errors._}</p>
			{/if}
			<div>
				<label class="label" for="name">Name</label>
				<input
					id="name"
					name="name"
					class="field"
					required
					maxlength="80"
					value={data.round.name}
				/>
			</div>
			<div>
				<label class="label" for="goal">Goal</label>
				<input id="goal" name="goal" class="field" maxlength="200" value={data.round.goal ?? ''} />
			</div>
			<div>
				<label class="label" for="description">Notes</label>
				<textarea id="description" name="description" class="field min-h-24" maxlength="500"
					>{data.round.description ?? ''}</textarea
				>
			</div>
			<button class="btn btn-primary" type="submit">Save changes</button>
		</form>
	{/if}
</div>

<form bind:this={completeForm} method="POST" action="?/complete" class="hidden">
	<input type="hidden" name="force" value={forceComplete ? '1' : '0'} />
</form>

<ConfirmDialog
	open={completing}
	title={deckDone ? 'Mark this round complete?' : `Finish early with ${p.remaining} left?`}
	body={deckDone
		? 'The round moves to completed and stops appearing as active. You can reopen it at any time — nothing is lost.'
		: `You still have ${p.remaining} motorcycles you have not seen. Completing now keeps everything you have decided so far, and you can reopen the round later to carry on.`}
	confirmLabel={deckDone ? 'Mark complete' : 'Finish early'}
	onconfirm={() => {
		completing = false;
		completeForm?.requestSubmit();
	}}
	oncancel={() => (completing = false)}
/>

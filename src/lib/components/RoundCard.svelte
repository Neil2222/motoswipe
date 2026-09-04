<script lang="ts">
	import { describeFilters, type RoundFilters } from '$lib/domain/filters';
	import { ROUND_STATUS_LABELS } from '$lib/domain/enums';
	import type { RoundSummary } from '$lib/domain/view-types';
	import { progressWidth, relativeTime } from '$lib/utils/format';

	interface Props {
		round: RoundSummary;
		manufacturerNames: Map<string, string>;
		onduplicate: (round: RoundSummary) => void;
		onarchive: (round: RoundSummary) => void;
		onunarchive: (round: RoundSummary) => void;
	}

	let { round, manufacturerNames, onduplicate, onarchive, onunarchive }: Props = $props();

	const filterChips = $derived(
		describeFilters((round.filters ?? {}) as RoundFilters, manufacturerNames)
	);
	const done = $derived(round.swiped >= round.total && round.total > 0);
	const shortlist = $derived(round.likes + round.superlikes);

	const statusTone = $derived(
		{
			ACTIVE: 'text-like border-like/35 bg-like/8',
			COMPLETED: 'text-cyan border-cyan/35 bg-cyan/8',
			DRAFT: 'text-ash border-graphite',
			ARCHIVED: 'text-dim border-graphite'
		}[round.status]
	);
</script>

<article class="panel flex flex-col p-5">
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h3 class="display text-bone truncate text-xl">
				<a href="/rounds/{round.id}" class="hover:text-sodium transition-colors">{round.name}</a>
			</h3>
			{#if round.goal}
				<p class="text-ash mt-1 line-clamp-1 text-sm">{round.goal}</p>
			{/if}
		</div>
		<span class="chip shrink-0 {statusTone}">{ROUND_STATUS_LABELS[round.status]}</span>
	</div>

	<!-- Filter summary. An unfiltered round says so explicitly rather than
	     showing nothing, which would read as a rendering bug. -->
	<div class="mt-3 flex flex-wrap gap-1.5">
		{#if filterChips.length === 0}
			<span class="chip">Everything</span>
		{:else}
			{#each filterChips as chip (chip)}
				<span class="chip">{chip}</span>
			{/each}
		{/if}
	</div>

	<!-- Progress -->
	<div class="mt-5">
		<div class="mb-2 flex items-baseline justify-between">
			<span class="numeral text-bone text-sm">
				{round.swiped} <span class="text-dim">/ {round.total}</span>
			</span>
			<span class="stencil">
				{done ? 'Deck complete' : `${round.total - round.swiped} left`}
			</span>
		</div>
		<div class="bg-graphite h-1.5 overflow-hidden rounded-full">
			<div
				class="h-full rounded-full transition-all duration-500 {done ? 'bg-cyan' : 'bg-sodium'}"
				style:width={progressWidth(round.swiped, round.total)}
			></div>
		</div>
	</div>

	<!-- Counters -->
	<dl class="mt-4 grid grid-cols-4 gap-2 text-center">
		{#each [{ label: 'Likes', value: round.likes, tone: 'text-like' }, { label: 'Super', value: round.superlikes, tone: 'text-superlike' }, { label: 'Nope', value: round.dislikes, tone: 'text-dim' }, { label: 'Skip', value: round.skips, tone: 'text-dim' }] as stat (stat.label)}
			<div class="panel-inset px-1 py-2">
				<dd class="numeral text-base {stat.tone}">{stat.value}</dd>
				<dt class="stencil mt-0.5 text-[9px]">{stat.label}</dt>
			</div>
		{/each}
	</dl>

	{#if round.winner}
		<div class="border-sodium/30 bg-sodium/8 mt-4 rounded-lg border px-3 py-2.5">
			<p class="stencil text-sodium/80">Current #1</p>
			<p class="text-bone mt-0.5 truncate text-sm font-semibold">
				{round.winner.manufacturerName}
				{round.winner.model}
			</p>
		</div>
	{/if}

	<p class="text-dim mt-4 text-xs">Updated {relativeTime(round.updatedAt)}</p>

	<!-- Actions -->
	<div class="mt-4 flex flex-wrap gap-2">
		{#if round.status === 'ARCHIVED'}
			<button class="btn btn-secondary btn-sm" onclick={() => onunarchive(round)}> Restore </button>
			<a href="/rounds/{round.id}/results" class="btn btn-ghost btn-sm">Results</a>
		{:else}
			{#if !done}
				<a href="/rounds/{round.id}/swipe" class="btn btn-primary btn-sm">
					{round.swiped > 0 ? 'Resume' : 'Start swiping'}
				</a>
			{:else if shortlist >= 2}
				<a href="/rounds/{round.id}/compare" class="btn btn-primary btn-sm">Compare</a>
			{/if}

			{#if shortlist > 0}
				<a href="/rounds/{round.id}/likes" class="btn btn-secondary btn-sm">
					Shortlist ({shortlist})
				</a>
			{/if}
			{#if round.swiped > 0}
				<a href="/rounds/{round.id}/results" class="btn btn-ghost btn-sm">Results</a>
			{/if}
			<button class="btn btn-ghost btn-sm" onclick={() => onduplicate(round)}>Duplicate</button>
			<button class="btn btn-ghost btn-sm" onclick={() => onarchive(round)}>Archive</button>
		{/if}
	</div>
</article>

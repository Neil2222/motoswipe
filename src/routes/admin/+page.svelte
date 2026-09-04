<script lang="ts">
	import { DECISION_LABELS, ROUND_STATUS_LABELS } from '$lib/domain/enums';
	import type { SwipeDecision, RoundStatus } from '$lib/domain/enums';
	import { relativeTime } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const c = $derived(data.stats.counts);
</script>

<svelte:head><title>Admin — MotoSwipe</title></svelte:head>

<!-- Counters -->
<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
	{#each [{ l: 'Users', v: c.users }, { l: 'Rounds', v: c.rounds }, { l: 'Swipes', v: c.swipes }, { l: 'Comparisons', v: c.votes }, { l: 'Motorcycles', v: c.motorcycles }, { l: 'Manufacturers', v: c.manufacturers }, { l: 'Images', v: c.images }, { l: 'Active sessions', v: c.sessions }] as stat (stat.l)}
		<div class="panel px-4 py-4">
			<p class="numeral text-bone text-2xl">{stat.v}</p>
			<p class="stencil mt-1">{stat.l}</p>
		</div>
	{/each}
</div>

{#if c.retired > 0}
	<p class="text-skip mt-3 text-xs">
		{c.retired} motorcycle{c.retired === 1 ? ' is' : 's are'} retired — no longer listed by their source,
		kept so existing swipe history stays meaningful.
	</p>
{/if}

<div class="mt-8 grid gap-5 lg:grid-cols-2">
	<!-- Data sources -->
	<section class="panel p-5">
		<h2 class="display text-bone text-base">Catalogue by source</h2>
		<ul class="mt-4 space-y-2">
			{#each data.stats.bySource as row (row.source)}
				<li class="flex items-center justify-between text-sm">
					<span class="numeral text-ash">{row.source}</span>
					<span class="numeral text-bone">{row.count}</span>
				</li>
			{:else}
				<li class="text-dim text-sm">Nothing imported yet.</li>
			{/each}
		</ul>

		<p class="text-dim mt-4 text-xs">
			Last import: {data.stats.lastImportAt ? relativeTime(data.stats.lastImportAt) : 'never'}
		</p>
	</section>

	<!-- Providers -->
	<section class="panel p-5">
		<h2 class="display text-bone text-base">Registered providers</h2>
		<ul class="mt-4 space-y-3">
			{#each data.providers as provider (provider.source)}
				<li>
					<div class="flex items-center justify-between gap-3">
						<span class="numeral text-bone text-sm">{provider.source}</span>
						<span class="chip {provider.requiresNetwork ? 'border-skip/40 text-skip' : ''}">
							{provider.requiresNetwork ? 'network' : 'local'}
						</span>
					</div>
					<p class="text-dim mt-0.5 text-xs">{provider.displayName}</p>
				</li>
			{/each}
		</ul>
		<p class="text-dim mt-4 text-xs leading-relaxed">
			Imports are run from the command line — <code class="numeral">npm run import:run</code> — never
			from this page. See the importer README.
		</p>
	</section>

	<!-- Decisions -->
	<section class="panel p-5">
		<h2 class="display text-bone text-base">Swipe decisions</h2>
		<ul class="mt-4 space-y-2">
			{#each data.stats.byDecision as row (row.decision)}
				<li class="flex items-center justify-between text-sm">
					<span class="text-ash">{DECISION_LABELS[row.decision as SwipeDecision]}</span>
					<span class="numeral text-bone">{row.count}</span>
				</li>
			{:else}
				<li class="text-dim text-sm">No swipes yet.</li>
			{/each}
		</ul>
	</section>

	<!-- Rounds by status -->
	<section class="panel p-5">
		<h2 class="display text-bone text-base">Rounds by status</h2>
		<ul class="mt-4 space-y-2">
			{#each data.stats.roundsByStatus as row (row.status)}
				<li class="flex items-center justify-between text-sm">
					<span class="text-ash">{ROUND_STATUS_LABELS[row.status as RoundStatus]}</span>
					<span class="numeral text-bone">{row.count}</span>
				</li>
			{:else}
				<li class="text-dim text-sm">No rounds yet.</li>
			{/each}
		</ul>
	</section>
</div>

<!-- Runtime configuration -->
<section class="panel mt-5 p-5">
	<h2 class="display text-bone text-base">Runtime configuration</h2>
	<p class="text-dim mt-1 text-xs">Values only. No secrets are read or displayed here.</p>
	<dl class="bg-graphite mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg sm:grid-cols-5">
		{#each [{ l: 'NODE_ENV', v: data.config.nodeEnv }, { l: 'Registration', v: data.config.allowRegistration ? 'open' : 'closed' }, { l: 'Session TTL', v: `${data.config.sessionTtlDays} d` }, { l: 'Proxy hops', v: String(data.config.trustProxyHops) }, { l: 'ORIGIN set', v: data.config.originConfigured ? 'yes' : 'no' }] as row (row.l)}
			<div class="bg-charcoal px-4 py-3">
				<dt class="stencil">{row.l}</dt>
				<dd class="numeral text-bone mt-1 text-sm">{row.v}</dd>
			</div>
		{/each}
	</dl>

	{#if data.config.nodeEnv === 'production' && !data.config.originConfigured}
		<p class="border-nope/40 bg-nope/10 text-nope mt-4 rounded-lg border px-4 py-3 text-xs">
			ORIGIN is not set in production. Form submissions will fail the CSRF origin check behind a
			reverse proxy.
		</p>
	{/if}
</section>

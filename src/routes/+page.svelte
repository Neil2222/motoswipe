<script lang="ts">
	import type { PageProps } from './$types';

	// PageProps merges the layout's data (which carries `user`) with this page's.
	let { data }: PageProps = $props();

	const steps = [
		{
			n: '01',
			title: 'Create a round',
			body: 'A discovery round is one question — “first bike”, “something for two-up”, “money no object”. Filter it, or ask for everything.'
		},
		{
			n: '02',
			title: 'Swipe',
			body: 'One bike at a time, full screen. No spec sheet in your face. Left for no, right for yes, up when it genuinely stops you.'
		},
		{
			n: '03',
			title: 'Build a shortlist',
			body: 'Every like lands in the round. Stop whenever you want; come back next week and pick up exactly where you left off.'
		},
		{
			n: '04',
			title: 'Battle your favourites',
			body: 'Head-to-head, two at a time. Which would you rather own? An Elo rating sorts out what you actually prefer.'
		},
		{
			n: '05',
			title: 'Find your winner',
			body: 'A ranked shortlist, a number one, and honest statistics about your own taste. Then start a fresh round next year.'
		}
	];
</script>

<svelte:head>
	<title>MotoSwipe — find the bike you actually want</title>
	<meta
		name="description"
		content="Swipe through motorcycles, build a shortlist, and rank your favourites head-to-head. Self-hosted."
	/>
</svelte:head>

<!-- ===================== Hero ===================== -->
<section class="relative overflow-hidden">
	<!-- Headlight sweep across the top of the hero -->
	<div
		class="pointer-events-none absolute inset-0 -z-10"
		style="background:
			radial-gradient(70rem 34rem at 20% -20%, rgb(255 106 31 / 0.16), transparent 62%),
			radial-gradient(46rem 30rem at 95% 5%, rgb(53 214 232 / 0.10), transparent 58%);"
		aria-hidden="true"
	></div>

	<div class="mx-auto max-w-6xl px-4 pt-20 pb-16 sm:pt-28 sm:pb-24">
		<p class="stencil text-sodium mb-6">Tinder for motorcycles</p>

		<h1 class="display text-bone max-w-4xl text-[clamp(2.75rem,9vw,6rem)]">
			Stop comparing specs.<br />
			<span class="text-sodium">Find the bike</span><br />
			you actually want.
		</h1>

		<p class="text-ash mt-8 max-w-xl text-lg leading-relaxed text-balance">
			You do not fall for a motorcycle because of its torque curve. You fall for it because of how
			it looks parked. MotoSwipe starts there, and only shows you the numbers once you have already
			reacted.
		</p>

		<div class="mt-10 flex flex-wrap items-center gap-3">
			{#if data.user}
				<a href="/dashboard" class="btn btn-primary btn-lg">Go to dashboard</a>
				<a href="/rounds/new" class="btn btn-secondary btn-lg">Start a new round</a>
			{:else}
				<a href="/register" class="btn btn-primary btn-lg">Start swiping</a>
				<a href="/login" class="btn btn-secondary btn-lg">Sign in</a>
			{/if}
		</div>

		<div class="text-dim mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
			<span class="numeral">{data.motorcycleCount} motorcycles in the catalogue</span>
			<span class="text-steel" aria-hidden="true">·</span>
			<span class="numeral">{data.manufacturerCount} manufacturers</span>
			{#if data.withPhoto > 0}
				<span class="text-steel" aria-hidden="true">·</span>
				<span class="numeral">{data.withPhoto} with photographs</span>
			{/if}
			<span class="text-steel" aria-hidden="true">·</span>
			<span>Self-hosted — your rounds stay on this server</span>
		</div>
	</div>

	<div class="hairline mx-auto max-w-6xl"></div>
</section>

<!-- ===================== How it works ===================== -->
<section class="mx-auto max-w-6xl px-4 py-20">
	<h2 class="display text-bone text-3xl sm:text-4xl">How it works</h2>

	<ol class="mt-12 grid gap-px overflow-hidden rounded-xl md:grid-cols-2 lg:grid-cols-3">
		{#each steps as step (step.n)}
			<li class="panel rounded-none p-6">
				<span class="numeral text-sodium/70 text-3xl">{step.n}</span>
				<h3 class="display text-bone mt-3 text-lg">{step.title}</h3>
				<p class="text-ash mt-2 text-sm leading-relaxed">{step.body}</p>
			</li>
		{/each}

		<li class="panel flex flex-col justify-center rounded-none p-6">
			<h3 class="display text-bone text-lg">Then do it again</h3>
			<p class="text-ash mt-2 text-sm leading-relaxed">
				Next year is a different question. A new round starts completely clean and your old one
				stays exactly as you left it — winner, ranking, statistics and all.
			</p>
			{#if !data.user}
				<a href="/register" class="btn btn-primary mt-5 self-start">Create an account</a>
			{/if}
		</li>
	</ol>
</section>

<!-- ===================== Honest notes ===================== -->
<section class="mx-auto max-w-6xl px-4 pb-24">
	<div class="panel p-6 sm:p-8">
		<h2 class="display text-bone text-xl">Two things worth saying plainly</h2>
		<div class="mt-5 grid gap-6 sm:grid-cols-2">
			<div>
				<h3 class="stencil text-ash">On fit</h3>
				<p class="text-ash mt-2 text-sm leading-relaxed">
					Tell us your height and inseam and we will put a seat height in context — “likely
					comfortable”, “may feel tall”. It is a hint, not a verdict. Seat width, suspension sag and
					your boots all change the answer, and no database can substitute for sitting on the bike.
				</p>
			</div>
			<div>
				<h3 class="stencil text-ash">On the data</h3>
				{#if data.demoOnly}
					<p class="text-ash mt-2 text-sm leading-relaxed">
						This instance is running demonstration data only: approximate specifications and
						generated illustrations rather than photographs. Import a real catalogue to replace it.
						Where a number is not known you will see a dash rather than a guess.
					</p>
				{:else}
					<p class="text-ash mt-2 text-sm leading-relaxed">
						Specifications and photographs are imported from Wikipedia and Wikidata, and are as
						complete as those sources are — which is to say, patchy in places. Where a number is not
						known you will see a dash rather than a guess, and every motorcycle links back to where
						its data came from.
					</p>
				{/if}
			</div>
		</div>
	</div>
</section>

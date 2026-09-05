<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let starting = $state(false);
	const errors = $derived(form?.errors ?? {});

	// Static copy; the counts are server constants, not state that changes.
	// svelte-ignore state_referenced_locally
	const deckSize = data.deckSize;
	// svelte-ignore state_referenced_locally
	const comparisons = data.comparisons;

	const steps = [
		{
			n: '01',
			title: `Swipe ${deckSize} bikes`,
			body: 'The motorcycles most often registered new in the Netherlands since 2020, one at a time. Right for yes, left for no.'
		},
		{
			n: '02',
			title: 'Pick a few head to head',
			body: `Your likes go up against each other, ${comparisons} times. Which would you rather own?`
		},
		{
			n: '03',
			title: 'See your number one',
			body: 'A ranked shortlist and a winner. Keep it by creating an account, or throw it away.'
		}
	];
</script>

<svelte:head><title>Try the demo — MotoSwipe</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-16 sm:py-24">
	<p class="stencil text-sodium mb-3">No account needed</p>
	<h1 class="display text-bone text-[clamp(2.25rem,7vw,4rem)] leading-[0.95]">
		Try it on the {data.deckSize} most popular bikes
	</h1>
	<p class="text-ash mt-6 max-w-xl text-lg leading-relaxed">
		Two minutes, no sign-up. Come back and finish whenever you like, and save the result to an
		account if it deserves it.
	</p>

	<form
		method="POST"
		action="?/start"
		class="mt-8"
		use:enhance={() => {
			starting = true;
			return async ({ update }) => {
				await update();
				starting = false;
			};
		}}
	>
		{#if errors._}
			<div
				class="border-nope/40 bg-nope/10 text-nope mb-4 rounded-lg border px-4 py-3 text-sm"
				role="alert"
			>
				{errors._}
			</div>
		{/if}
		<button class="btn btn-primary btn-lg" type="submit" disabled={starting}>
			{starting ? 'Setting up your deck…' : 'Start the demo'}
		</button>
		<a href="/register" class="btn btn-ghost btn-lg ml-2">Create an account instead</a>
	</form>

	<ol class="mt-14 grid gap-px overflow-hidden rounded-xl sm:grid-cols-3">
		{#each steps as step (step.n)}
			<li class="panel rounded-none p-6">
				<span class="numeral text-sodium/70 text-3xl">{step.n}</span>
				<h2 class="display text-bone mt-3 text-lg">{step.title}</h2>
				<p class="text-ash mt-2 text-sm leading-relaxed">{step.body}</p>
			</li>
		{/each}
	</ol>
</div>

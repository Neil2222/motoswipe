<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Email confirmation — MotoSwipe</title></svelte:head>

<div class="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-md items-center px-4 py-12">
	<div class="panel w-full p-6 sm:p-8">
		{#if data.verified}
			<p class="stencil text-like mb-3">Confirmed</p>
			<h1 class="display text-bone text-3xl">Your email address is confirmed</h1>
			<p class="text-ash mt-4 text-sm leading-relaxed">
				A password reset can reach you now. Nothing else changes.
			</p>
			<div class="mt-6 flex flex-wrap gap-2">
				{#if data.signedInAsVerified}
					<a href="/dashboard" class="btn btn-primary">Go to dashboard</a>
				{:else}
					<a href="/login" class="btn btn-primary">Sign in</a>
				{/if}
			</div>
		{:else}
			<p class="stencil text-sodium mb-3">No luck</p>
			<h1 class="display text-bone text-3xl">This link is not valid</h1>
			<p class="text-ash mt-4 text-sm leading-relaxed">
				It may have expired, or it was used already. You can ask for a new one from your profile.
			</p>
			<div class="mt-6 flex flex-wrap gap-2">
				<a href="/profile" class="btn btn-primary">Go to profile</a>
				<a href="/" class="btn btn-ghost">Home</a>
			</div>
		{/if}
	</div>
</div>

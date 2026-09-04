<script lang="ts">
	import { page } from '$app/state';

	/**
	 * The message comes from `handleError` in hooks.server.ts, which strips
	 * anything sensitive in production and replaces it with a correlation code.
	 */
	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? 'Something went wrong');
	const code = $derived(page.error?.code);

	const headline = $derived(
		status === 404
			? 'Nothing here'
			: status === 403
				? 'Not yours'
				: status === 401
					? 'Sign in first'
					: status === 429
						? 'Slow down'
						: 'That broke'
	);

	const body = $derived(
		status === 404
			? 'That page does not exist — or it belongs to someone else, which as far as this server is concerned is the same thing.'
			: status === 401
				? 'You need to be signed in to see that.'
				: status === 429
					? 'Too many attempts in a short time. Wait a minute and try again.'
					: 'The server hit a problem handling that request. It has been logged.'
	);
</script>

<svelte:head><title>{status} — MotoSwipe</title></svelte:head>

<div class="flex min-h-[70dvh] items-center px-4">
	<div class="mx-auto max-w-lg text-center">
		<p class="numeral text-sodium/50 text-[clamp(5rem,18vw,10rem)] leading-none">
			{status}
		</p>

		<h1 class="display text-bone -mt-2 text-3xl sm:text-4xl">{headline}</h1>
		<p class="text-ash mt-4 text-sm leading-relaxed text-balance">{body}</p>

		{#if status >= 500 && message && message !== 'Something went wrong'}
			<p class="panel-inset text-ash mt-5 px-4 py-3 text-left text-xs break-words">
				{message}
			</p>
		{/if}

		{#if code}
			<p class="text-dim numeral mt-4 text-xs">
				Reference {code} — quote this if you are looking through the server log.
			</p>
		{/if}

		<div class="mt-8 flex flex-wrap justify-center gap-3">
			{#if status === 401}
				<a href="/login?redirectTo={encodeURIComponent(page.url.pathname)}" class="btn btn-primary">
					Sign in
				</a>
			{/if}
			<a href="/dashboard" class="btn btn-secondary">Dashboard</a>
			<a href="/" class="btn btn-ghost">Home</a>
		</div>
	</div>
</div>

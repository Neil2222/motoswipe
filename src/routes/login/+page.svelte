<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let submitting = $state(false);
	const errors = $derived(form?.errors ?? {});
</script>

<svelte:head><title>Sign in — MotoSwipe</title></svelte:head>

<div class="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-md items-center px-4 py-12">
	<div class="w-full">
		<p class="stencil text-sodium mb-3">Welcome back</p>
		<h1 class="display text-bone text-4xl">Sign in</h1>

		<form
			method="POST"
			class="panel mt-8 space-y-5 p-6"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			<input type="hidden" name="redirectTo" value={data.redirectTo} />

			{#if data.justReset}
				<div
					class="border-like/40 bg-like/10 text-like rounded-lg border px-4 py-3 text-sm"
					role="status"
				>
					Password changed. Sign in with the new one.
				</div>
			{/if}

			{#if errors._}
				<div
					class="border-nope/40 bg-nope/10 text-nope rounded-lg border px-4 py-3 text-sm"
					role="alert"
				>
					{errors._}
				</div>
			{/if}

			<div>
				<label class="label" for="identifier">Email or username</label>
				<input
					id="identifier"
					name="identifier"
					class="field"
					autocomplete="username"
					autocapitalize="none"
					spellcheck="false"
					required
					value={form?.identifier ?? ''}
					aria-invalid={errors.identifier ? 'true' : undefined}
				/>
				{#if errors.identifier}
					<p class="text-nope mt-1.5 text-xs">{errors.identifier}</p>
				{/if}
			</div>

			<div>
				<label class="label" for="password">Password</label>
				<input
					id="password"
					name="password"
					type="password"
					class="field"
					autocomplete="current-password"
					required
					aria-invalid={errors.password ? 'true' : undefined}
				/>
				{#if errors.password}
					<p class="text-nope mt-1.5 text-xs">{errors.password}</p>
				{/if}
			</div>

			<button class="btn btn-primary w-full" type="submit" disabled={submitting}>
				{submitting ? 'Signing in…' : 'Sign in'}
			</button>

			{#if data.canReset}
				<p class="text-center text-xs">
					<a href="/forgot-password" class="text-dim hover:text-ash underline"
						>Forgot your password?</a
					>
				</p>
			{/if}
		</form>

		{#if data.fromDemo}
			<p class="text-dim mt-4 text-center text-xs leading-relaxed">
				Signing in moves your demo round to that account.
			</p>
		{/if}

		{#if data.allowRegistration}
			<p class="text-ash mt-6 text-center text-sm">
				No account yet?
				<a href="/register" class="text-sodium hover:underline">Create one</a>
			</p>
		{:else}
			<p class="text-dim mt-6 text-center text-sm">Registration is closed on this instance.</p>
		{/if}
	</div>
</div>

<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let submitting = $state(false);
	let password = $state('');
	const errors = $derived(form?.errors ?? {});
	const dead = $derived(!data.live || form?.expired);
</script>

<svelte:head><title>Choose a new password — MotoSwipe</title></svelte:head>

<div class="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-md items-center px-4 py-12">
	<div class="w-full">
		<p class="stencil text-sodium mb-3">Almost there</p>
		<h1 class="display text-bone text-4xl">Choose a new password</h1>

		{#if dead}
			<div class="panel mt-8 p-6">
				<p class="text-bone text-sm leading-relaxed">This reset link is no longer valid.</p>
				<p class="text-ash mt-2 text-sm leading-relaxed">
					Links work once and expire after an hour. Ask for a fresh one and use it straight away.
				</p>
				<a href="/forgot-password" class="btn btn-primary mt-5">Request a new link</a>
			</div>
		{:else}
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
				{#if errors._}
					<div
						class="border-nope/40 bg-nope/10 text-nope rounded-lg border px-4 py-3 text-sm"
						role="alert"
					>
						{errors._}
					</div>
				{/if}

				<div>
					<label class="label" for="password">New password</label>
					<input
						id="password"
						name="password"
						type="password"
						class="field"
						autocomplete="new-password"
						required
						minlength="12"
						bind:value={password}
						aria-invalid={errors.password ? 'true' : undefined}
					/>
					<p class="text-dim mt-1.5 text-xs">At least 12 characters. Length beats punctuation.</p>
					{#if errors.password}<p class="text-nope mt-1.5 text-xs">{errors.password}</p>{/if}
				</div>

				<div>
					<label class="label" for="confirmPassword">Repeat it</label>
					<input
						id="confirmPassword"
						name="confirmPassword"
						type="password"
						class="field"
						autocomplete="new-password"
						required
						minlength="12"
						aria-invalid={errors.confirmPassword ? 'true' : undefined}
					/>
					{#if errors.confirmPassword}
						<p class="text-nope mt-1.5 text-xs">{errors.confirmPassword}</p>
					{/if}
				</div>

				<button class="btn btn-primary w-full" type="submit" disabled={submitting}>
					{submitting ? 'Saving…' : 'Set new password'}
				</button>

				<p class="text-dim text-center text-xs leading-relaxed">
					Every device signed in to this account is signed out when the password changes.
				</p>
			</form>
		{/if}
	</div>
</div>

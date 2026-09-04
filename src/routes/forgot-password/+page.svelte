<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let submitting = $state(false);
	const errors = $derived(form?.errors ?? {});
</script>

<svelte:head><title>Reset your password — MotoSwipe</title></svelte:head>

<div class="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-md items-center px-4 py-12">
	<div class="w-full">
		<p class="stencil text-sodium mb-3">Locked out</p>
		<h1 class="display text-bone text-4xl">Reset your password</h1>

		{#if form?.sent}
			<div class="panel mt-8 p-6" role="status">
				<p class="text-bone text-sm leading-relaxed">
					If <span class="numeral">{form.email}</span> belongs to an account, a reset link is on its way.
					It works once and expires in an hour.
				</p>
				<p class="text-dim mt-3 text-xs leading-relaxed">
					Nothing arrived? Check the spam folder, and make sure the address is the one you signed up
					with.
				</p>
				<a href="/login" class="btn btn-secondary mt-5">Back to sign in</a>
			</div>
		{:else if !data.enabled}
			<div class="panel mt-8 p-6">
				<p class="text-ash text-sm leading-relaxed">
					This instance has no email configured, so passwords cannot be reset by link. Ask whoever
					runs it to set a new one for you.
				</p>
				<a href="/login" class="btn btn-secondary mt-5">Back to sign in</a>
			</div>
		{:else}
			<p class="text-ash mt-4 text-sm leading-relaxed">
				Enter the email address of your account and we will send a link to choose a new password.
			</p>

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
					<label class="label" for="email">Email</label>
					<input
						id="email"
						name="email"
						type="email"
						class="field"
						autocomplete="email"
						autocapitalize="none"
						spellcheck="false"
						required
						value={form?.email ?? ''}
						aria-invalid={errors.email ? 'true' : undefined}
					/>
					{#if errors.email}<p class="text-nope mt-1.5 text-xs">{errors.email}</p>{/if}
				</div>

				<button class="btn btn-primary w-full" type="submit" disabled={submitting}>
					{submitting ? 'Sending…' : 'Send reset link'}
				</button>
			</form>

			<p class="text-ash mt-6 text-center text-sm">
				Remembered it?
				<a href="/login" class="text-sodium hover:underline">Sign in</a>
			</p>
		{/if}
	</div>
</div>

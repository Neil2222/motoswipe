<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let submitting = $state(false);
	let password = $state('');

	const errors = $derived(form?.errors ?? {});
	const values = $derived(form?.values ?? { email: '', username: '', displayName: '' });

	// Length is the only thing that reliably matters, so that is the only thing
	// the meter reports. No fake "add a symbol!" scoring.
	const strength = $derived(
		password.length === 0
			? null
			: password.length < 12
				? { label: `${12 - password.length} more characters`, tone: 'text-nope', width: '30%' }
				: password.length < 16
					? { label: 'Good', tone: 'text-skip', width: '65%' }
					: { label: 'Strong', tone: 'text-like', width: '100%' }
	);
</script>

<svelte:head>
	<title>{data.claim ? 'Save your demo' : 'Create an account'} — MotoSwipe</title>
</svelte:head>

<div class="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-md items-center px-4 py-12">
	<div class="w-full">
		{#if data.claim}
			<p class="stencil text-sodium mb-3">Keep what you swiped</p>
			<h1 class="display text-bone text-4xl">Save your demo</h1>
			<p class="text-ash mt-4 text-sm leading-relaxed">
				Choose an email and a password and your demo round — every swipe, every comparison — becomes
				the first round of your own account.
			</p>
		{:else}
			<p class="stencil text-sodium mb-3">Get started</p>
			<h1 class="display text-bone text-4xl">Create an account</h1>
		{/if}

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
				<label class="label" for="displayName">Display name</label>
				<input
					id="displayName"
					name="displayName"
					class="field"
					autocomplete="name"
					required
					maxlength="60"
					value={values.displayName}
					placeholder="Neil"
					aria-invalid={errors.displayName ? 'true' : undefined}
				/>
				{#if errors.displayName}<p class="text-nope mt-1.5 text-xs">{errors.displayName}</p>{/if}
			</div>

			<div>
				<label class="label" for="username">Username</label>
				<input
					id="username"
					name="username"
					class="field"
					autocomplete="username"
					autocapitalize="none"
					spellcheck="false"
					required
					maxlength="32"
					value={values.username}
					placeholder="neil"
					aria-invalid={errors.username ? 'true' : undefined}
					aria-describedby="username-hint"
				/>
				<p id="username-hint" class="text-dim mt-1.5 text-xs">
					Lowercase letters, numbers, underscore and hyphen.
				</p>
				{#if errors.username}<p class="text-nope mt-1 text-xs">{errors.username}</p>{/if}
			</div>

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
					value={values.email}
					aria-invalid={errors.email ? 'true' : undefined}
				/>
				{#if errors.email}<p class="text-nope mt-1.5 text-xs">{errors.email}</p>{/if}
			</div>

			<div>
				<label class="label" for="password">Password</label>
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
					aria-describedby="password-hint"
				/>
				{#if strength}
					<div class="mt-2 flex items-center gap-3">
						<div class="bg-graphite h-1 flex-1 overflow-hidden rounded-full">
							<div
								class="h-full rounded-full transition-all duration-300 {strength.tone.replace(
									'text-',
									'bg-'
								)}"
								style:width={strength.width}
							></div>
						</div>
						<span class="text-xs {strength.tone}">{strength.label}</span>
					</div>
				{:else}
					<p id="password-hint" class="text-dim mt-1.5 text-xs">
						At least 12 characters. Length beats punctuation.
					</p>
				{/if}
				{#if errors.password}<p class="text-nope mt-1.5 text-xs">{errors.password}</p>{/if}
			</div>

			<button class="btn btn-primary w-full" type="submit" disabled={submitting}>
				{submitting
					? 'Creating account…'
					: data.claim
						? 'Create account and save my round'
						: 'Create account'}
			</button>
		</form>

		<p class="text-ash mt-6 text-center text-sm">
			Already have an account?
			<a href="/login" class="text-sodium hover:underline">Sign in</a>
			{#if data.claim}
				<span class="text-dim">— your demo round moves to that account.</span>
			{/if}
		</p>
		{#if data.claim && data.demoRoundId}
			<p class="text-dim mt-3 text-center text-xs">
				<a href="/rounds/{data.demoRoundId}" class="hover:text-ash underline">Back to the demo</a>
			</p>
		{/if}
	</div>
</div>

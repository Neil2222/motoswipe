<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import FitBadge from '$lib/components/FitBadge.svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const welcome = $derived(page.url.searchParams.get('welcome') === '1');
	const profileErrors = $derived(form?.section === 'profile' ? (form.errors ?? {}) : {});
	const passwordErrors = $derived(form?.section === 'password' ? (form.errors ?? {}) : {});

	let savingProfile = $state(false);
	let savingPassword = $state(false);
</script>

<svelte:head><title>Profile — MotoSwipe</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-10">
	<p class="stencil text-sodium mb-3">Your account</p>
	<h1 class="display text-bone text-4xl">{page.data.user?.displayName}</h1>
	<p class="text-dim mt-2 text-sm">
		@{page.data.user?.username} · {page.data.user?.email}
	</p>

	{#if welcome}
		<div class="border-sodium/35 bg-sodium/8 mt-6 rounded-lg border p-4">
			<p class="display text-sodium text-sm">Account created</p>
			<p class="text-ash mt-1.5 text-sm leading-relaxed">
				Adding your height and inseam is optional, but it is what lets MotoSwipe put a seat height
				in context later. You can skip straight to
				<a href="/rounds/new" class="text-sodium hover:underline">creating a round</a> instead.
			</p>
		</div>
	{/if}

	<!-- Activity -->
	<div class="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-lg">
		{#each [{ label: 'Rounds', value: data.stats.roundCount }, { label: 'Swipes', value: data.stats.swipeCount }, { label: 'Superlikes', value: data.stats.superlikeCount }] as stat (stat.label)}
			<div class="panel rounded-none px-4 py-4 text-center">
				<p class="numeral text-bone text-2xl">{stat.value}</p>
				<p class="stencil mt-1">{stat.label}</p>
			</div>
		{/each}
	</div>

	<!-- ================= Rider measurements ================= -->
	<section class="mt-10">
		<h2 class="display text-bone text-xl">Rider details</h2>
		<p class="text-ash mt-2 text-sm leading-relaxed">
			Used only to put seat heights in context for you. Nothing here is shared, and nothing is ever
			hidden from your deck because of it unless you explicitly add a seat-height filter to a round.
		</p>

		<form
			method="POST"
			action="?/profile"
			class="panel mt-5 space-y-5 p-6"
			use:enhance={() => {
				savingProfile = true;
				return async ({ update, result }) => {
					await update({ reset: false });
					savingProfile = false;
					if (result.type === 'success') toasts.success('Profile saved');
				};
			}}
		>
			<div>
				<label class="label" for="displayName">Display name</label>
				<input
					id="displayName"
					name="displayName"
					class="field"
					required
					maxlength="60"
					value={page.data.user?.displayName ?? ''}
				/>
				{#if profileErrors.displayName}
					<p class="text-nope mt-1.5 text-xs">{profileErrors.displayName}</p>
				{/if}
			</div>

			<div class="grid gap-5 sm:grid-cols-2">
				<div>
					<label class="label" for="heightCm">Height (cm)</label>
					<input
						id="heightCm"
						name="heightCm"
						type="number"
						inputmode="numeric"
						class="field"
						min="100"
						max="250"
						placeholder="175"
						value={data.profile.heightCm ?? ''}
					/>
					{#if profileErrors.heightCm}
						<p class="text-nope mt-1.5 text-xs">{profileErrors.heightCm}</p>
					{/if}
				</div>

				<div>
					<label class="label" for="inseamCm">Inseam (cm) — optional</label>
					<input
						id="inseamCm"
						name="inseamCm"
						type="number"
						inputmode="numeric"
						class="field"
						min="40"
						max="130"
						placeholder="78"
						value={data.profile.inseamCm ?? ''}
						aria-describedby="inseam-hint"
					/>
					<p id="inseam-hint" class="text-dim mt-1.5 text-xs leading-relaxed">
						Inside leg, floor to crotch, without shoes. This is the measurement that actually
						matters — without it we estimate from your height and say so.
					</p>
					{#if profileErrors.inseamCm}
						<p class="text-nope mt-1.5 text-xs">{profileErrors.inseamCm}</p>
					{/if}
				</div>

				<div>
					<label class="label" for="countryCode">Country (2 letters)</label>
					<input
						id="countryCode"
						name="countryCode"
						class="field uppercase"
						maxlength="2"
						placeholder="NL"
						value={data.profile.countryCode ?? ''}
					/>
					{#if profileErrors.countryCode}
						<p class="text-nope mt-1.5 text-xs">{profileErrors.countryCode}</p>
					{/if}
				</div>

				<div>
					<label class="label" for="preferredCurrency">Currency (3 letters)</label>
					<input
						id="preferredCurrency"
						name="preferredCurrency"
						class="field uppercase"
						maxlength="3"
						placeholder="EUR"
						value={data.profile.preferredCurrency ?? ''}
					/>
					{#if profileErrors.preferredCurrency}
						<p class="text-nope mt-1.5 text-xs">{profileErrors.preferredCurrency}</p>
					{/if}
				</div>
			</div>

			<button class="btn btn-primary" type="submit" disabled={savingProfile}>
				{savingProfile ? 'Saving…' : 'Save details'}
			</button>
		</form>
	</section>

	<!-- ================= Fit preview ================= -->
	<section class="mt-10">
		<h2 class="display text-bone text-xl">What that means for seat heights</h2>
		<p class="text-ash mt-2 text-sm leading-relaxed">
			Three reference bikes, run through the same estimate you will see on every motorcycle page.
		</p>

		<div class="mt-5 grid gap-4 sm:grid-cols-3">
			{#each data.examples as example (example.label)}
				<div class="panel p-4">
					<p class="stencil">{example.label}</p>
					<p class="numeral text-bone mt-1 text-lg">{example.seatHeightMm} mm</p>
					<div class="mt-3">
						<FitBadge fit={example.fit} disclaimer={data.fitDisclaimer} compact />
					</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- ================= Password ================= -->
	<section class="mt-10">
		<h2 class="display text-bone text-xl">Password</h2>

		<form
			method="POST"
			action="?/password"
			class="panel mt-5 space-y-5 p-6"
			use:enhance={() => {
				savingPassword = true;
				return async ({ update, result }) => {
					await update();
					savingPassword = false;
					if (result.type === 'success') {
						const revoked = (result.data as { revoked?: number } | undefined)?.revoked ?? 0;
						toasts.success(
							revoked > 0
								? `Password changed. ${revoked} other session${revoked === 1 ? '' : 's'} signed out.`
								: 'Password changed.'
						);
					}
				};
			}}
		>
			{#if passwordErrors._}
				<div
					class="border-nope/40 bg-nope/10 text-nope rounded-lg border px-4 py-3 text-sm"
					role="alert"
				>
					{passwordErrors._}
				</div>
			{/if}

			<div>
				<label class="label" for="currentPassword">Current password</label>
				<input
					id="currentPassword"
					name="currentPassword"
					type="password"
					class="field"
					autocomplete="current-password"
					required
				/>
				{#if passwordErrors.currentPassword}
					<p class="text-nope mt-1.5 text-xs">{passwordErrors.currentPassword}</p>
				{/if}
			</div>

			<div class="grid gap-5 sm:grid-cols-2">
				<div>
					<label class="label" for="newPassword">New password</label>
					<input
						id="newPassword"
						name="newPassword"
						type="password"
						class="field"
						autocomplete="new-password"
						minlength="12"
						required
					/>
					{#if passwordErrors.newPassword}
						<p class="text-nope mt-1.5 text-xs">{passwordErrors.newPassword}</p>
					{/if}
				</div>
				<div>
					<label class="label" for="confirmPassword">Repeat new password</label>
					<input
						id="confirmPassword"
						name="confirmPassword"
						type="password"
						class="field"
						autocomplete="new-password"
						required
					/>
					{#if passwordErrors.confirmPassword}
						<p class="text-nope mt-1.5 text-xs">{passwordErrors.confirmPassword}</p>
					{/if}
				</div>
			</div>

			<p class="text-dim text-xs">Changing your password signs out every other device.</p>

			<button class="btn btn-secondary" type="submit" disabled={savingPassword}>
				{savingPassword ? 'Changing…' : 'Change password'}
			</button>
		</form>
	</section>

	<!-- ================= Privacy ================= -->
	<section class="mt-10 mb-4">
		<div class="panel p-6">
			<h2 class="display text-bone text-lg">Privacy</h2>
			<p class="text-ash mt-2 text-sm leading-relaxed">
				Everything is private. Your rounds, swipes and rankings are visible only to you — there is
				no public profile, no sharing and no aggregate anyone else can see. The database has
				visibility fields ready for a future social layer, and they all default to private.
			</p>
			<p class="text-dim mt-3 text-xs">
				Current profile visibility: <span class="numeral">{data.profile.profileVisibility}</span>
			</p>
		</div>
	</section>
</div>

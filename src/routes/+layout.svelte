<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import Toaster from '$lib/components/Toaster.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	/**
	 * The swipe deck owns the whole viewport — a sticky header would steal the
	 * ~64px that makes a card feel full-bleed on a phone. Those routes render
	 * their own minimal chrome instead.
	 */
	const isImmersive = $derived(/^\/rounds\/[^/]+\/(swipe|compare)$/.test(page.url.pathname));

	let menuOpen = $state(false);

	const nav = [
		{ href: '/dashboard', label: 'Dashboard' },
		{ href: '/rounds', label: 'Rounds' },
		{ href: '/motorcycles', label: 'Browse' },
		{ href: '/garage', label: 'Garage' },
		{ href: '/profile', label: 'Profile' }
	];

	// Close the mobile menu on navigation without an explicit afterNavigate.
	$effect(() => {
		void page.url.pathname;
		menuOpen = false;
	});
</script>

<div class="flex min-h-dvh flex-col">
	{#if !isImmersive}
		<header
			class="border-graphite/80 bg-void/80 pt-safe sticky top-0 z-40 border-b backdrop-blur-xl"
		>
			<div class="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
				<a
					href={data.user?.isGuest
						? data.demoRoundId
							? `/rounds/${data.demoRoundId}`
							: '/demo'
						: data.user
							? '/dashboard'
							: '/'}
					class="display text-bone hover:text-sodium shrink-0 text-lg tracking-tight transition-colors"
				>
					Moto<span class="text-sodium">Swipe</span>
				</a>

				{#if data.user?.isGuest}
					<span class="chip ml-1">Demo</span>
					<div class="ml-auto flex items-center gap-2">
						{#if data.demoRoundId}
							<a
								href="/rounds/{data.demoRoundId}"
								class="btn btn-ghost btn-sm hidden sm:inline-flex"
							>
								My round
							</a>
						{/if}
						<a href="/login" class="btn btn-ghost btn-sm hidden sm:inline-flex">Sign in</a>
						<a href="/register?claim=1" class="btn btn-primary btn-sm">Create account &amp; save</a>
					</div>
				{:else if data.user}
					<nav class="ml-4 hidden items-center gap-1 sm:flex" aria-label="Main">
						{#each nav as item (item.href)}
							<a
								href={item.href}
								class="rounded-md px-3 py-1.5 text-sm transition-colors {page.url.pathname.startsWith(
									item.href
								)
									? 'text-bone bg-white/6'
									: 'text-ash hover:text-bone hover:bg-white/4'}"
								aria-current={page.url.pathname.startsWith(item.href) ? 'page' : undefined}
							>
								{item.label}
							</a>
						{/each}
						{#if data.user.role === 'ADMIN'}
							<a
								href="/admin"
								class="rounded-md px-3 py-1.5 text-sm transition-colors {page.url.pathname.startsWith(
									'/admin'
								)
									? 'text-sodium bg-sodium/10'
									: 'text-dim hover:text-sodium'}"
							>
								Admin
							</a>
						{/if}
					</nav>

					<div class="ml-auto flex items-center gap-2">
						<a href="/rounds/new" class="btn btn-primary btn-sm hidden sm:inline-flex">
							New round
						</a>
						<form method="POST" action="/logout" class="hidden sm:block">
							<button class="btn btn-ghost btn-sm" type="submit">Sign out</button>
						</form>

						<button
							class="btn btn-secondary btn-sm sm:hidden"
							onclick={() => (menuOpen = !menuOpen)}
							aria-expanded={menuOpen}
							aria-controls="mobile-nav"
						>
							{menuOpen ? 'Close' : 'Menu'}
						</button>
					</div>
				{:else}
					<div class="ml-auto flex items-center gap-2">
						<a href="/demo" class="btn btn-ghost btn-sm hidden sm:inline-flex">Try the demo</a>
						<a href="/login" class="btn btn-ghost btn-sm">Sign in</a>
						<a href="/register" class="btn btn-primary btn-sm">Create account</a>
					</div>
				{/if}
			</div>

			{#if menuOpen && data.user && !data.user.isGuest}
				<nav id="mobile-nav" class="border-graphite/80 border-t px-4 py-3 sm:hidden">
					<div class="flex flex-col gap-1">
						{#each nav as item (item.href)}
							<a href={item.href} class="text-ash hover:text-bone rounded-md px-3 py-2 text-sm">
								{item.label}
							</a>
						{/each}
						{#if data.user.role === 'ADMIN'}
							<a href="/admin" class="text-sodium rounded-md px-3 py-2 text-sm">Admin</a>
						{/if}
						<a href="/rounds/new" class="btn btn-primary mt-2">New round</a>
						<form method="POST" action="/logout" class="mt-1">
							<button class="btn btn-ghost w-full" type="submit">Sign out</button>
						</form>
					</div>
				</nav>
			{/if}
		</header>

		{#if data.user?.isGuest}
			<div class="border-sodium/30 bg-sodium/8 border-b">
				<div
					class="text-ash mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-xs"
				>
					<p class="min-w-0 flex-1">
						<span class="text-bone">You are trying MotoSwipe as a guest.</span>
						Your round is kept on this device for a while. Create an account to keep it for good.
					</p>
					<div class="flex items-center gap-2">
						<a href="/register?claim=1" class="text-sodium hover:underline"
							>Create account &amp; save</a
						>
						<span class="text-steel" aria-hidden="true">·</span>
						<form method="POST" action="/demo?/discard">
							<button type="submit" class="hover:text-bone underline">Discard demo</button>
						</form>
					</div>
				</div>
			</div>
		{:else if data.user && !data.user.emailVerified && data.mailEnabled && !page.url.pathname.startsWith('/profile')}
			<div class="border-graphite/80 bg-charcoal/60 border-b">
				<p class="text-dim mx-auto max-w-6xl px-4 py-2 text-xs">
					Your email address is not confirmed yet, so a password reset could not reach you.
					<a href="/profile#email" class="text-ash hover:text-bone underline"
						>Confirm it from your profile</a
					>.
				</p>
			</div>
		{/if}
	{/if}

	<main class="flex-1">
		{@render children()}
	</main>

	{#if !isImmersive}
		<footer class="border-graphite/60 mt-auto border-t">
			<div
				class="text-dim mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs sm:flex-row sm:items-center sm:justify-between"
			>
				<p>
					MotoSwipe — self-hosted. Specifications come from third-party sources and may be
					incomplete or out of date. Verify anything that matters before you buy a motorcycle.
				</p>
				<p class="stencil">Built for the garage, not the spec sheet</p>
			</div>
		</footer>
	{/if}
</div>

<Toaster />

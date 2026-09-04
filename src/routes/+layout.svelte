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
					href={data.user ? '/dashboard' : '/'}
					class="display text-bone hover:text-sodium shrink-0 text-lg tracking-tight transition-colors"
				>
					Moto<span class="text-sodium">Swipe</span>
				</a>

				{#if data.user}
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
						<a href="/login" class="btn btn-ghost btn-sm">Sign in</a>
						<a href="/register" class="btn btn-primary btn-sm">Create account</a>
					</div>
				{/if}
			</div>

			{#if menuOpen && data.user}
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

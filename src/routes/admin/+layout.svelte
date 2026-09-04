<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const tabs = [
		{ href: '/admin', label: 'Overview' },
		{ href: '/admin/motorcycles', label: 'Motorcycles' },
		{ href: '/admin/manufacturers', label: 'Manufacturers' }
	];
</script>

<div class="mx-auto max-w-6xl px-4 py-10">
	<p class="stencil text-sodium mb-2">Operations</p>
	<h1 class="display text-bone text-4xl">Admin</h1>

	<nav class="border-graphite mt-6 flex gap-1 border-b" aria-label="Admin sections">
		{#each tabs as tab (tab.href)}
			{@const active =
				tab.href === '/admin'
					? page.url.pathname === '/admin'
					: page.url.pathname.startsWith(tab.href)}
			<a
				href={tab.href}
				class="-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors {active
					? 'border-sodium text-bone'
					: 'text-ash hover:text-bone border-transparent'}"
				aria-current={active ? 'page' : undefined}
			>
				{tab.label}
			</a>
		{/each}
	</nav>

	<div class="mt-8">
		{@render children()}
	</div>
</div>

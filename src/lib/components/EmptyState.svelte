<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		body?: string;
		/** Single glyph shown above the title. Kept decorative. */
		glyph?: string;
		children?: Snippet;
	}

	let { title, body = '', glyph = '', children }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center px-6 py-16 text-center">
	{#if glyph}
		<div class="text-steel mb-4 text-5xl select-none" aria-hidden="true">{glyph}</div>
	{/if}
	<h2 class="display text-bone text-2xl">{title}</h2>
	{#if body}
		<p class="text-ash mt-3 max-w-md text-sm leading-relaxed text-balance">{body}</p>
	{/if}
	{#if children}
		<div class="mt-6 flex flex-wrap justify-center gap-3">
			{@render children()}
		</div>
	{/if}
</div>

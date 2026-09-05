<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { toasts } from '$lib/stores/toast.svelte';

	/**
	 * Saves a motorcycle to the garage.
	 *
	 * The state flips the moment you tap it, before the server has answered. A
	 * heart is a small, private, entirely reversible act; making somebody watch a
	 * spinner for it would be worse than the rare case of putting it back because
	 * the request failed.
	 *
	 * It posts to a plain endpoint rather than a form action so the same button
	 * works everywhere a bike appears — a grid tile, a detail page, a garage
	 * row — without each of those pages having to own an action.
	 */
	interface Props {
		motorcycleId: string;
		favorited: boolean;
		/** For the accessible label, so a grid of hearts is navigable. */
		label: string;
		size?: 'sm' | 'md';
		/** Refresh the page's data after a change. On the garage page, that removes the row. */
		reloadOnChange?: boolean;
		class?: string;
	}

	let {
		motorcycleId,
		favorited,
		label,
		size = 'md',
		reloadOnChange = false,
		class: className = ''
	}: Props = $props();

	/**
	 * The optimistic state, or null to mean "whatever the server last said".
	 *
	 * Holding it separately rather than copying the prop into state keeps the
	 * server as the single source of truth: clearing this is all it takes to
	 * fall back to it, which is exactly what a failed request should do.
	 */
	let pending = $state<boolean | null>(null);
	const saved = $derived(pending ?? favorited);

	let busy = $state(false);

	async function toggle(event: MouseEvent) {
		// A heart inside a link tile must not follow the link.
		event.preventDefault();
		event.stopPropagation();
		if (busy) return;

		const next = !saved;
		pending = next;
		busy = true;

		try {
			const response = await fetch('/api/favorites', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ motorcycleId, favorited: next })
			});
			if (!response.ok) throw new Error(String(response.status));

			const result = (await response.json()) as { favorited: boolean };
			pending = result.favorited;

			if (reloadOnChange) {
				await invalidateAll();
				// The server has spoken; stop overriding it.
				pending = null;
			}
		} catch {
			// Fall back to the server's answer. Showing a heart that was never
			// saved is the one outcome here worth interrupting somebody for.
			pending = null;
			toasts.error('Could not save that. Try again in a moment.');
		} finally {
			busy = false;
		}
	}
</script>

<button
	type="button"
	onclick={toggle}
	aria-pressed={saved}
	aria-label={saved ? `Remove ${label} from your garage` : `Save ${label} to your garage`}
	title={saved ? 'Saved — tap to remove' : 'Save to your garage'}
	class="grid place-items-center rounded-full border transition-colors
	       {size === 'sm' ? 'h-9 w-9' : 'h-11 w-11'}
	       {saved
		? 'border-like/60 bg-like/15 text-like'
		: 'border-graphite/80 bg-void/85 text-ash hover:border-like/40 hover:text-like'}
	       {busy ? 'opacity-70' : ''}
	       {className}"
>
	<!-- Filled when saved, outlined when not: readable at a glance in a grid,
	     and readable without colour. -->
	<svg
		viewBox="0 0 24 24"
		class="{size === 'sm' ? 'h-4.5 w-4.5' : 'h-5 w-5'} transition-transform duration-200"
		class:scale-110={saved}
		fill={saved ? 'currentColor' : 'none'}
		stroke="currentColor"
		stroke-width="1.8"
		aria-hidden="true"
	>
		<path
			d="M12 20.7 4.4 13.3a4.7 4.7 0 0 1 0-6.7 4.7 4.7 0 0 1 6.7 0l.9.9.9-.9a4.7 4.7 0 0 1 6.7 0 4.7 4.7 0 0 1 0 6.7Z"
			stroke-linejoin="round"
		/>
	</svg>
</button>

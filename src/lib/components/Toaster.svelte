<script lang="ts">
	import { fly } from 'svelte/transition';
	import { toasts } from '$lib/stores/toast.svelte';

	const tones: Record<string, { border: string; text: string; bar: string }> = {
		info: { border: 'border-graphite', text: 'text-bone', bar: 'bg-chrome' },
		success: { border: 'border-like/40', text: 'text-bone', bar: 'bg-like' },
		error: { border: 'border-nope/50', text: 'text-bone', bar: 'bg-nope' },
		like: { border: 'border-like/40', text: 'text-bone', bar: 'bg-like' },
		superlike: { border: 'border-superlike/50', text: 'text-bone', bar: 'bg-superlike' }
	};
</script>

<!-- Bottom on mobile (thumb reach, clear of the swipe deck's action row is
     handled by the deck's own padding), top-right on desktop. -->
<div
	class="pb-safe pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:top-0 sm:right-0 sm:bottom-auto sm:items-end"
	aria-live="polite"
	aria-atomic="false"
>
	{#each toasts.items as toast (toast.id)}
		{@const tone = tones[toast.tone] ?? tones.info}
		<div
			transition:fly={{ y: 12, duration: 220 }}
			class="panel pointer-events-auto flex w-full max-w-sm items-center gap-3 overflow-hidden py-3 pr-3 pl-0 {tone.border}"
			role={toast.tone === 'error' ? 'alert' : 'status'}
		>
			<div class="h-full w-1 self-stretch {tone.bar}"></div>
			<p class="flex-1 text-sm {tone.text}">{toast.message}</p>

			{#if toast.action}
				<button
					class="btn btn-sm btn-secondary"
					onclick={() => {
						toast.action?.run();
						toasts.dismiss(toast.id);
					}}
				>
					{toast.action.label}
				</button>
			{/if}

			<button
				class="text-dim hover:text-bone shrink-0 px-1 text-lg leading-none transition-colors"
				onclick={() => toasts.dismiss(toast.id)}
				aria-label="Dismiss notification"
			>
				&times;
			</button>
		</div>
	{/each}
</div>

<script lang="ts">
	import { fade, scale } from 'svelte/transition';

	interface Props {
		open: boolean;
		title: string;
		body?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		danger?: boolean;
		onconfirm: () => void;
		oncancel: () => void;
	}

	let {
		open = $bindable(),
		title,
		body = '',
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		danger = false,
		onconfirm,
		oncancel
	}: Props = $props();

	let dialog = $state<HTMLDivElement | null>(null);

	// Focus the panel when it opens so Escape and Tab work without a click, and
	// so a screen reader announces the dialog rather than leaving focus behind
	// on the button that triggered it.
	$effect(() => {
		if (open && dialog) dialog.focus();
	});

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			oncancel();
		}
	}
</script>

<svelte:window on:keydown={open ? onkeydown : undefined} />

{#if open}
	<div
		class="fixed inset-0 z-[70] flex items-center justify-center p-4"
		transition:fade={{ duration: 140 }}
	>
		<button
			class="absolute inset-0 cursor-default bg-black/75 backdrop-blur-sm"
			onclick={oncancel}
			aria-label="Cancel"
			tabindex="-1"
		></button>

		<div
			bind:this={dialog}
			transition:scale={{ duration: 180, start: 0.96 }}
			class="panel relative w-full max-w-md p-6 outline-none"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="confirm-title"
			tabindex="-1"
		>
			<h2 id="confirm-title" class="display text-bone text-xl">{title}</h2>
			{#if body}
				<p class="text-ash mt-3 text-sm leading-relaxed">{body}</p>
			{/if}

			<div class="mt-6 flex justify-end gap-2">
				<button class="btn btn-ghost" onclick={oncancel}>{cancelLabel}</button>
				<button class="btn {danger ? 'btn-danger' : 'btn-primary'}" onclick={onconfirm}>
					{confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}

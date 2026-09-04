<script lang="ts">
	import type { FitAssessment } from '$lib/domain/fit';

	/**
	 * Displays a rider-fit estimate.
	 *
	 * The disclaimer is part of the component, not something a caller can forget
	 * to add — an unqualified "likely comfortable" is exactly the claim this
	 * feature must not make.
	 */
	interface Props {
		fit: FitAssessment;
		disclaimer: string;
		compact?: boolean;
	}

	let { fit, disclaimer, compact = false }: Props = $props();

	const tone = $derived(
		{
			LIKELY_EASY: { dot: 'bg-like', text: 'text-like', ring: 'border-like/35' },
			LIKELY_OK: { dot: 'bg-cyan', text: 'text-cyan', ring: 'border-cyan/35' },
			MAY_FEEL_TALL: { dot: 'bg-skip', text: 'text-skip', ring: 'border-skip/40' },
			UNKNOWN: { dot: 'bg-chrome', text: 'text-ash', ring: 'border-graphite' }
		}[fit.rating]
	);
</script>

{#if compact}
	<span class="chip {tone.ring} {tone.text}" title="{fit.explanation} — {disclaimer}">
		<span class="h-1.5 w-1.5 rounded-full {tone.dot}"></span>
		{fit.headline}
	</span>
{:else}
	<div class="panel-inset border {tone.ring} p-4">
		<div class="flex items-center gap-2">
			<span class="h-2 w-2 rounded-full {tone.dot}"></span>
			<span class="display text-sm {tone.text}">{fit.headline}</span>
			{#if fit.confidence === 'ESTIMATED'}
				<span class="stencil ml-auto">Estimated</span>
			{/if}
		</div>

		<p class="text-ash mt-2.5 text-sm leading-relaxed">{fit.explanation}</p>

		{#if fit.notes.length}
			<ul class="text-dim mt-3 space-y-1.5 text-xs leading-relaxed">
				{#each fit.notes as note (note)}
					<li class="flex gap-2">
						<span class="text-steel mt-px shrink-0" aria-hidden="true">·</span>
						<span>{note}</span>
					</li>
				{/each}
			</ul>
		{/if}

		<p class="text-dim border-graphite mt-3 border-t pt-3 text-[11px] leading-relaxed italic">
			{disclaimer}
		</p>
	</div>
{/if}

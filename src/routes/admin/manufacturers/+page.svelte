<script lang="ts">
	import { EMPTY, shortDate } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Manufacturers — Admin</title></svelte:head>

<p class="text-dim text-sm">{data.manufacturers.length} manufacturers</p>

<div class="panel mt-4 overflow-x-auto">
	<table class="w-full min-w-3xl text-left text-sm">
		<thead class="border-graphite text-dim border-b">
			<tr>
				<th class="stencil px-4 py-3">Name</th>
				<th class="stencil px-4 py-3">Slug</th>
				<th class="stencil px-4 py-3">Country</th>
				<th class="stencil px-4 py-3 text-right">Motorcycles</th>
				<th class="stencil px-4 py-3 text-right">Retired</th>
				<th class="stencil px-4 py-3">Website</th>
				<th class="stencil px-4 py-3">Added</th>
			</tr>
		</thead>
		<tbody>
			{#each data.manufacturers as m (m.id)}
				<tr class="border-graphite/60 border-b last:border-0 hover:bg-white/3">
					<td class="text-bone px-4 py-3">{m.name}</td>
					<td class="numeral text-ash px-4 py-3 text-xs">{m.slug}</td>
					<td class="numeral text-ash px-4 py-3">{m.countryCode ?? EMPTY}</td>
					<td class="numeral text-bone px-4 py-3 text-right">{m._count.motorcycles}</td>
					<td class="numeral px-4 py-3 text-right {m.retired > 0 ? 'text-skip' : 'text-dim'}">
						{m.retired}
					</td>
					<td class="px-4 py-3">
						{#if m.website}
							<a
								href={m.website}
								class="text-sodium text-xs hover:underline"
								target="_blank"
								rel="noopener noreferrer nofollow"
							>
								{m.website.replace(/^https?:\/\//, '')}
							</a>
						{:else}
							<span class="text-dim">{EMPTY}</span>
						{/if}
					</td>
					<td class="text-ash px-4 py-3 text-xs">{shortDate(m.createdAt)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

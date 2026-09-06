<script lang="ts">
	import { EMPTY, queryString, relativeTime, shortDate } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	function pageHref(n: number) {
		return queryString({ q: data.query, guests: data.includeGuests ? '1' : '', page: n });
	}
</script>

<svelte:head><title>Users — Admin</title></svelte:head>

<form method="GET" class="flex flex-wrap items-end gap-3">
	<div class="min-w-56 flex-1">
		<label class="label" for="q">Search</label>
		<input id="q" name="q" class="field" value={data.query} placeholder="Email, username or name" />
	</div>
	<label class="text-ash flex items-center gap-2 py-2.5 text-sm">
		<input type="checkbox" name="guests" value="1" checked={data.includeGuests} />
		Include guests ({data.guestCount})
	</label>
	<button class="btn btn-secondary" type="submit">Filter</button>
	{#if data.query || data.includeGuests}
		<a href="/admin/users" class="btn btn-ghost">Reset</a>
	{/if}
</form>

<p class="text-dim mt-4 text-sm">
	{data.total} user{data.total === 1 ? '' : 's'}{data.includeGuests ? '' : ', guests excluded'} · page
	{data.page} of {data.pages}
</p>

<div class="panel mt-4 overflow-x-auto">
	<table class="w-full min-w-3xl text-left text-sm">
		<thead class="border-graphite text-dim border-b">
			<tr>
				<th class="stencil px-4 py-3">Name</th>
				<th class="stencil px-4 py-3">Username</th>
				<th class="stencil px-4 py-3">Email</th>
				<th class="stencil px-4 py-3">Role</th>
				<th class="stencil px-4 py-3 text-right">Rounds</th>
				<th class="stencil px-4 py-3 text-right">Favorites</th>
				<th class="stencil px-4 py-3 text-right">Sessions</th>
				<th class="stencil px-4 py-3">Signed up</th>
				<th class="stencil px-4 py-3">Last login</th>
			</tr>
		</thead>
		<tbody>
			{#each data.rows as u (u.id)}
				<tr class="border-graphite/60 border-b last:border-0 hover:bg-white/3">
					<td class="text-bone px-4 py-3">
						{u.displayName}
						{#if u.isGuest}<span class="chip ml-2">guest</span>{/if}
					</td>
					<td class="numeral text-ash px-4 py-3 text-xs">{u.username}</td>
					<td class="text-ash px-4 py-3 text-xs">
						{u.email}
						{#if !u.isGuest && !u.emailVerifiedAt}
							<span class="text-skip ml-1 text-xs">unverified</span>
						{/if}
					</td>
					<td class="px-4 py-3">
						<span class="chip {u.role === 'ADMIN' ? 'border-sodium/40 text-sodium' : ''}">
							{u.role.toLowerCase()}
						</span>
					</td>
					<td class="numeral text-bone px-4 py-3 text-right">{u._count.rounds}</td>
					<td class="numeral text-bone px-4 py-3 text-right">{u._count.favorites}</td>
					<td
						class="numeral px-4 py-3 text-right {u.activeSessions > 0 ? 'text-bone' : 'text-dim'}"
					>
						{u.activeSessions}
					</td>
					<td class="text-ash px-4 py-3 text-xs">{shortDate(u.createdAt)}</td>
					<td class="text-ash px-4 py-3 text-xs">
						{u.lastLoginAt ? relativeTime(u.lastLoginAt) : EMPTY}
					</td>
				</tr>
			{:else}
				<tr><td class="text-dim px-4 py-6" colspan="9">No users match.</td></tr>
			{/each}
		</tbody>
	</table>
</div>

{#if data.pages > 1}
	<nav class="mt-4 flex items-center gap-3 text-sm" aria-label="Pagination">
		{#if data.page > 1}<a class="text-sodium hover:underline" href={pageHref(data.page - 1)}
				>Previous</a
			>{/if}
		<span class="text-dim">Page {data.page} of {data.pages}</span>
		{#if data.page < data.pages}<a
				class="text-sodium hover:underline"
				href={pageHref(data.page + 1)}>Next</a
			>{/if}
	</nav>
{/if}

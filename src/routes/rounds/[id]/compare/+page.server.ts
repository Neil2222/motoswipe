import { redirect } from '@sveltejs/kit';
import { requireOwnedRound } from '$lib/server/guards';
import { nextComparison } from '$lib/server/services/ranking.service';
import { getRoundProgress } from '$lib/server/services/round.service';
import type { PageServerLoad } from './$types';

/**
 * Head-to-head comparison.
 *
 * The pair itself is chosen server-side (see `elo.selectPair`) so the client
 * cannot cherry-pick easy matchups, and votes are submitted through the API
 * endpoint next door.
 */
export const load: PageServerLoad = async (event) => {
	const { round } = await requireOwnedRound(event, event.params.id);

	const progress = await getRoundProgress(round.id, round.filters);

	// Fewer than two liked motorcycles means there is nothing to compare; send
	// the user somewhere useful rather than showing an empty arena.
	if (progress.shortlist < 2) {
		redirect(303, `/rounds/${round.id}`);
	}

	const comparison = await nextComparison(round.id);

	return {
		round: { id: round.id, name: round.name },
		comparison,
		progress
	};
};

import { json } from '@sveltejs/kit';
import { requireOwnedRoundApi } from '$lib/server/guards';
import { getRoundProgress } from '$lib/server/services/round.service';
import type { RequestHandler } from './$types';

/**
 * Authoritative counters for a round. The deck falls back to this when an
 * optimistic update has been rolled back, so the header never stays wrong.
 */
export const GET: RequestHandler = async (event) => {
	const { round } = await requireOwnedRoundApi(event, event.params.id);
	return json(await getRoundProgress(round.id, round.filters));
};

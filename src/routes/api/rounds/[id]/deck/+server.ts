import { json } from '@sveltejs/kit';
import { requireOwnedRoundApi } from '$lib/server/guards';
import { getDeck, DECK_BATCH_SIZE } from '$lib/server/services/swipe.service';
import type { RequestHandler } from './$types';

/**
 * Deck top-up.
 *
 * `exclude` carries the ids the client is still holding but has not reported a
 * decision for, so a refill never hands back a card already on screen.
 */
export const GET: RequestHandler = async (event) => {
	const { round } = await requireOwnedRoundApi(event, event.params.id);

	const limit = Math.min(
		Math.max(Number(event.url.searchParams.get('limit') ?? DECK_BATCH_SIZE), 1),
		30
	);
	const exclude = (event.url.searchParams.get('exclude') ?? '').split(',').filter(Boolean);

	const cards = await getDeck(round.id, round.filters, { limit, exclude });

	return json({ cards });
};

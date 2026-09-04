import { error, json } from '@sveltejs/kit';
import { requireOwnedRoundApi } from '$lib/server/guards';
import { swipeSchema } from '$lib/domain/validation';
import { recordSwipe, undoSwipe, getDeck } from '$lib/server/services/swipe.service';
import { getRoundProgress } from '$lib/server/services/round.service';
import { isDomainError } from '$lib/server/errors';
import type { RequestHandler } from './$types';

/**
 * Swipe recording.
 *
 * Kept as a JSON endpoint rather than a form action because the deck fires
 * these while a card is still animating out — a form action would re-run the
 * page load and re-render the deck under the user's thumb.
 *
 * Ownership is checked on every call through `requireOwnedRoundApi`, which
 * answers 404 for someone else's round.
 */
export const POST: RequestHandler = async (event) => {
	const { round } = await requireOwnedRoundApi(event, event.params.id);

	const body = await event.request.json().catch(() => null);
	const parsed = swipeSchema.safeParse(body);
	if (!parsed.success) {
		error(422, { message: 'That is not a valid swipe.' });
	}

	try {
		const result = await recordSwipe(round.id, parsed.data.motorcycleId, parsed.data.decision);

		// The client needs a fresh progress count and, when it is running low, a
		// top-up. Returning both here saves a second round trip mid-swipe.
		const wantsMore = Number(event.url.searchParams.get('more') ?? 0);
		const exclude = (event.url.searchParams.get('exclude') ?? '').split(',').filter(Boolean);

		const [progress, cards] = await Promise.all([
			getRoundProgress(round.id, round.filters),
			wantsMore > 0
				? getDeck(round.id, round.filters, { limit: wantsMore, exclude })
				: Promise.resolve([])
		]);

		return json({ ok: true, ...result, progress, cards });
	} catch (err) {
		if (isDomainError(err)) error(err.status, { message: err.message });
		throw err;
	}
};

/**
 * Undo: removes the swipe entirely so the motorcycle returns to the deck in its
 * original position. Setting it to SKIP instead would leave a trace in the
 * statistics for a decision the user retracted.
 */
export const DELETE: RequestHandler = async (event) => {
	const { round } = await requireOwnedRoundApi(event, event.params.id);

	const body = await event.request.json().catch(() => null);
	const motorcycleId = typeof body?.motorcycleId === 'string' ? body.motorcycleId : null;
	if (!motorcycleId) error(422, { message: 'Which motorcycle?' });

	const removed = await undoSwipe(round.id, motorcycleId);
	const progress = await getRoundProgress(round.id, round.filters);

	return json({ ok: true, removed, progress });
};

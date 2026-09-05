import { redirect } from '@sveltejs/kit';
import { requireOwnedRound } from '$lib/server/guards';
import { getDeck, DECK_BATCH_SIZE } from '$lib/server/services/swipe.service';
import { getRoundProgress } from '$lib/server/services/round.service';
import type { PageServerLoad } from './$types';

/**
 * The deck.
 *
 * Resume works because "where we are" is derived entirely from Swipe rows —
 * there is no cursor or required session state. Saved choices are preserved
 * across devices; unseen cards are selected using the latest preferences.
 */
export const load: PageServerLoad = async (event) => {
	const { round } = await requireOwnedRound(event, event.params.id);

	// Reopening an archived round to swipe it would be surprising; send the
	// user to the results they were presumably looking for.
	if (round.status === 'ARCHIVED') {
		redirect(303, `/rounds/${round.id}/results`);
	}

	const [cards, progress] = await Promise.all([
		getDeck(round.id, round.filters, {
			limit: DECK_BATCH_SIZE,
			resumeMotorcycleId: event.url.searchParams.get('resume')
		}),
		getRoundProgress(round.id, round.filters)
	]);

	return {
		round: { id: round.id, name: round.name, status: round.status },
		cards,
		progress,
		batchSize: DECK_BATCH_SIZE
	};
};

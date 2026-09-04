import { error, json } from '@sveltejs/kit';
import { requireOwnedRoundApi } from '$lib/server/guards';
import { comparisonVoteSchema } from '$lib/domain/validation';
import { nextComparison, recordVote } from '$lib/server/services/ranking.service';
import { isDomainError } from '$lib/server/errors';
import type { RequestHandler } from './$types';

/**
 * Records a head-to-head vote and returns the next pair.
 *
 * One round trip per vote keeps the arena responsive: the next two motorcycles
 * are already in the response by the time the previous pair fades out.
 */
export const POST: RequestHandler = async (event) => {
	const { round } = await requireOwnedRoundApi(event, event.params.id);

	const body = await event.request.json().catch(() => null);
	const parsed = comparisonVoteSchema.safeParse(body);
	if (!parsed.success) {
		error(422, { message: parsed.error.issues[0]?.message ?? 'That is not a valid vote.' });
	}

	try {
		await recordVote(round.id, parsed.data);
	} catch (err) {
		if (isDomainError(err)) error(err.status, { message: err.message });
		throw err;
	}

	return json({ ok: true, next: await nextComparison(round.id) });
};

/** Next pair without voting — used to skip a matchup. */
export const GET: RequestHandler = async (event) => {
	const { round } = await requireOwnedRoundApi(event, event.params.id);
	return json({ next: await nextComparison(round.id) });
};

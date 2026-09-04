import { fail } from '@sveltejs/kit';
import { requireOwnedRound } from '$lib/server/guards';
import { getShortlist, recordSwipe, type ShortlistSort } from '$lib/server/services/swipe.service';
import { getRoundProgress } from '$lib/server/services/round.service';
import { prisma } from '$lib/server/db/client';
import { assessFit } from '$lib/server/fit/fit';
import { FIT_DISCLAIMER } from '$lib/domain/fit';
import { swipeSchema, formError, type FormErrors } from '$lib/domain/validation';
import { isDomainError } from '$lib/server/errors';
import type { Actions, PageServerLoad } from './$types';

const SORTS: ShortlistSort[] = [
	'recent',
	'name',
	'power',
	'displacement',
	'price',
	'seatHeight',
	'year'
];

export const load: PageServerLoad = async (event) => {
	const { user, round } = await requireOwnedRound(event, event.params.id);

	const sortParam = event.url.searchParams.get('sort') as ShortlistSort | null;
	const sort: ShortlistSort = sortParam && SORTS.includes(sortParam) ? sortParam : 'recent';
	const only = event.url.searchParams.get('only');

	const decisions =
		only === 'superlikes' ? (['SUPERLIKE'] as const) : (['LIKE', 'SUPERLIKE'] as const);

	const [entries, progress, profile] = await Promise.all([
		getShortlist(round.id, { decisions: [...decisions], sort }),
		getRoundProgress(round.id, round.filters),
		prisma.userProfile.findUnique({
			where: { userId: user.id },
			select: { heightCm: true, inseamCm: true }
		})
	]);

	// Fit is computed server-side so the rules live in exactly one place.
	const rider = { heightCm: profile?.heightCm ?? null, inseamCm: profile?.inseamCm ?? null };
	const withFit = entries.map((entry) => ({
		...entry,
		fit: assessFit(rider, {
			seatHeightMm: entry.motorcycle.seatHeightMm,
			seatWidthMm: entry.motorcycle.seatWidthMm,
			wetWeightKg: entry.motorcycle.wetWeightKg
		})
	}));

	return {
		round: { id: round.id, name: round.name, status: round.status },
		entries: withFit,
		progress,
		sort,
		only,
		hasMeasurements: Boolean(rider.heightCm || rider.inseamCm),
		fitDisclaimer: FIT_DISCLAIMER
	};
};

export const actions: Actions = {
	/**
	 * Changes a decision from the shortlist. Uses the same `recordSwipe` path as
	 * the deck, so the unique (roundId, motorcycleId) constraint keeps one
	 * current decision per motorcycle per round.
	 */
	setDecision: async (event) => {
		const { round } = await requireOwnedRound(event, event.params.id);
		const form = await event.request.formData();

		const parsed = swipeSchema.safeParse({
			motorcycleId: String(form.get('motorcycleId') ?? ''),
			decision: String(form.get('decision') ?? '')
		});

		if (!parsed.success) {
			const errors: FormErrors = formError('That is not a valid decision.');
			return fail(422, { errors });
		}

		try {
			await recordSwipe(round.id, parsed.data.motorcycleId, parsed.data.decision);
			return { updated: true, decision: parsed.data.decision };
		} catch (error) {
			if (isDomainError(error)) {
				const errors: FormErrors = formError(error.message);
				return fail(error.status, { errors });
			}
			throw error;
		}
	}
};

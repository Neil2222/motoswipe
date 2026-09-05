import { prisma } from '../db/client';
import { NotFoundError, ValidationError } from '../errors';
import {
	buildMotorcycleWhere,
	candidateIds,
	getCardsByIds,
	type MotorcycleCard
} from './motorcycle.service';
import { personalizedDeck } from './deck-preferences';
import type { SwipeDecision } from '$lib/domain/enums';

/**
 * Swiping: recording decisions and serving the next cards.
 *
 * Resume is the requirement that shapes this file. A round can be picked up
 * days later on a different device. Saved decisions determine both what is
 * left and its preference weights; unseen cards can reorder when resuming.
 */

/** Small buffer: preload smoothly, then learn again after a few decisions. */
export const DECK_BATCH_SIZE = 4;

/**
 * Records or changes a decision.
 *
 * Upsert on the (roundId, motorcycleId) unique constraint, so a double-tap or a
 * retried request is idempotent rather than a duplicate-key 500, and changing
 * a decision later from the likes list uses this same path.
 */
export async function recordSwipe(
	roundId: string,
	motorcycleId: string,
	decision: SwipeDecision
): Promise<{ changed: boolean; previous: SwipeDecision | null }> {
	const bike = await prisma.motorcycle.findUnique({
		where: { id: motorcycleId },
		select: { id: true }
	});
	if (!bike) throw new NotFoundError('That motorcycle');

	const existing = await prisma.swipe.findUnique({
		where: { roundId_motorcycleId: { roundId, motorcycleId } },
		select: { decision: true }
	});

	if (existing?.decision === decision) {
		return { changed: false, previous: existing.decision };
	}

	await prisma.swipe.upsert({
		where: { roundId_motorcycleId: { roundId, motorcycleId } },
		create: { roundId, motorcycleId, decision },
		update: { decision }
	});

	// Touch the round so the dashboard orders by genuine activity.
	await prisma.discoveryRound.update({
		where: { id: roundId },
		data: { updatedAt: new Date() }
	});

	return { changed: true, previous: existing?.decision ?? null };
}

/**
 * Removes a swipe entirely, putting the motorcycle back in the deck.
 *
 * Backs the undo button. Deleting rather than setting SKIP is deliberate: an
 * undone swipe should leave no trace in the statistics.
 */
export async function undoSwipe(roundId: string, motorcycleId: string): Promise<boolean> {
	const result = await prisma.swipe.deleteMany({ where: { roundId, motorcycleId } });
	return result.count > 0;
}

/** The most recent decision in a round, for "undo last". */
export async function lastSwipe(roundId: string) {
	return prisma.swipe.findFirst({
		where: { roundId },
		orderBy: { updatedAt: 'desc' },
		select: {
			motorcycleId: true,
			decision: true,
			updatedAt: true,
			motorcycle: { select: { model: true, manufacturer: { select: { name: true } } } }
		}
	});
}

export async function swipedIdsFor(roundId: string): Promise<Set<string>> {
	const rows = await prisma.swipe.findMany({
		where: { roundId },
		select: { motorcycleId: true }
	});
	return new Set(rows.map((r) => r.motorcycleId));
}

/**
 * The next batch of cards for a round.
 *
 * Learn only from this round: a holiday-bike search should not inherit the
 * preferences from a first-bike search. Eligibility and explicit filters
 * still determine the candidate pool; preferences only influence its order.
 */
export async function getDeck(
	roundId: string,
	filters: unknown,
	options: { limit?: number; exclude?: readonly string[]; resumeMotorcycleId?: string | null } = {}
): Promise<MotorcycleCard[]> {
	const requested = options.limit ?? DECK_BATCH_SIZE;
	const limit = Number.isFinite(requested)
		? Math.min(Math.max(Math.floor(requested), 1), 30)
		: DECK_BATCH_SIZE;
	const [candidates, swipes] = await Promise.all([
		prisma.motorcycle.findMany({
			where: buildMotorcycleWhere(filters),
			select: { id: true, category: true, manufacturerId: true }
		}),
		prisma.swipe.findMany({
			where: { roundId },
			select: {
				motorcycleId: true,
				decision: true,
				motorcycle: { select: { category: true, manufacturerId: true } }
			}
		})
	]);
	const excluded = new Set([
		...(options.exclude ?? []),
		...swipes.map((swipe) => swipe.motorcycleId)
	]);
	const ids = personalizedDeck(roundId, candidates, swipes, excluded, limit);
	// Returning from details should keep the card the rider was considering.
	// This hint cannot restore a saved choice or bypass the round's eligibility.
	const resume = options.resumeMotorcycleId;
	if (resume && !excluded.has(resume) && candidates.some((candidate) => candidate.id === resume)) {
		const index = ids.indexOf(resume);
		if (index !== -1) ids.splice(index, 1);
		ids.unshift(resume);
		ids.length = Math.min(ids.length, limit);
	}

	return getCardsByIds(ids);
}

/**
 * Liked and superliked motorcycles for a round — the shortlist.
 *
 * `sort` is applied in SQL where the column allows it. NULLs sort last for
 * every numeric sort, because a bike with no published horsepower should not
 * head a "most powerful" list.
 */
export type ShortlistSort =
	'recent' | 'name' | 'power' | 'displacement' | 'price' | 'seatHeight' | 'year';

export async function getShortlist(
	roundId: string,
	options: { decisions?: SwipeDecision[]; sort?: ShortlistSort } = {}
) {
	const decisions = options.decisions ?? ['LIKE', 'SUPERLIKE'];
	const sort = options.sort ?? 'recent';

	const orderBy = (() => {
		switch (sort) {
			case 'name':
				return [
					{ motorcycle: { manufacturer: { name: 'asc' } } },
					{ motorcycle: { model: 'asc' } }
				];
			case 'power':
				return [{ motorcycle: { powerHp: { sort: 'desc', nulls: 'last' } } }];
			case 'displacement':
				return [{ motorcycle: { displacementCc: { sort: 'desc', nulls: 'last' } } }];
			case 'price':
				return [{ motorcycle: { msrpAmount: { sort: 'asc', nulls: 'last' } } }];
			case 'seatHeight':
				return [{ motorcycle: { seatHeightMm: { sort: 'asc', nulls: 'last' } } }];
			case 'year':
				return [{ motorcycle: { modelYear: { sort: 'desc', nulls: 'last' } } }];
			default:
				return [{ updatedAt: 'desc' as const }];
		}
	})();

	return prisma.swipe.findMany({
		where: { roundId, decision: { in: decisions } },
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- orderBy union is wider than Prisma's inferred literal type
		orderBy: orderBy as any,
		select: {
			decision: true,
			updatedAt: true,
			motorcycle: {
				select: {
					id: true,
					model: true,
					variant: true,
					modelYear: true,
					firstRegistrationYear: true,
					lastRegistrationYear: true,
					category: true,
					displacementCc: true,
					powerHp: true,
					torqueNm: true,
					wetWeightKg: true,
					seatHeightMm: true,
					seatWidthMm: true,
					msrpAmount: true,
					msrpCurrency: true,
					passengerAllowed: true,
					seatCount: true,
					passengerPegs: true,
					ridingPosition: true,
					manufacturer: { select: { id: true, name: true } },
					images: { where: { isPrimary: true }, take: 1, select: { url: true } }
				}
			}
		}
	});
}

/** Every decision a user has made about one motorcycle, across their rounds. */
export async function decisionsForMotorcycle(userId: string, motorcycleId: string) {
	return prisma.swipe.findMany({
		where: { motorcycleId, round: { userId } },
		orderBy: { updatedAt: 'desc' },
		select: {
			decision: true,
			updatedAt: true,
			round: { select: { id: true, name: true, status: true } }
		}
	});
}

/**
 * Marks a round complete. Refuses when cards remain, unless forced — a user
 * who deliberately stops early should be able to, but not by accident.
 */
export async function completeRound(roundId: string, filters: unknown, force = false) {
	const candidates = await candidateIds(filters);
	const swiped = await swipedIdsFor(roundId);
	const remaining = candidates.filter((id) => !swiped.has(id)).length;

	if (remaining > 0 && !force) {
		throw new ValidationError(`${remaining} motorcycles are still unswiped in this round.`);
	}

	return prisma.discoveryRound.update({
		where: { id: roundId },
		data: { status: 'COMPLETED', completedAt: new Date() }
	});
}

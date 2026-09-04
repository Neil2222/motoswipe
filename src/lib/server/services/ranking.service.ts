import { prisma } from '../db/client';
import { ValidationError } from '../errors';
import {
	applyResult,
	pairKey,
	selectPair,
	startingElo,
	suggestedComparisonCount,
	type PairCandidate
} from '../ranking/elo';
import type { ComparisonVoteInput } from '$lib/domain/validation';
import { DISCOVERY_IMAGES } from './motorcycle.service';

/**
 * The comparison phase: head-to-head votes and the Elo table they produce.
 *
 * Only motorcycles liked or superliked in the round take part. Comparing a bike
 * the user already rejected against one they liked answers a question nobody
 * asked.
 */

/** Ensures a ranking row exists for every shortlisted bike in the round. */
export async function ensureRankings(roundId: string): Promise<number> {
	const shortlist = await prisma.swipe.findMany({
		where: { roundId, decision: { in: ['LIKE', 'SUPERLIKE'] } },
		select: { motorcycleId: true, decision: true }
	});

	if (shortlist.length === 0) return 0;

	const existing = await prisma.roundMotorcycleRanking.findMany({
		where: { roundId },
		select: { motorcycleId: true }
	});
	const have = new Set(existing.map((r) => r.motorcycleId));

	const missing = shortlist.filter((s) => !have.has(s.motorcycleId));
	if (missing.length > 0) {
		await prisma.roundMotorcycleRanking.createMany({
			data: missing.map((s) => ({
				roundId,
				motorcycleId: s.motorcycleId,
				eloScore: startingElo(s.decision === 'SUPERLIKE')
			})),
			skipDuplicates: true
		});
	}

	// A bike demoted out of the shortlist after ranking began keeps its row but
	// must stop appearing. Rows are removed only when they have no history worth
	// preserving; otherwise the results page would lose past comparisons.
	const shortlistIds = new Set(shortlist.map((s) => s.motorcycleId));
	await prisma.roundMotorcycleRanking.deleteMany({
		where: {
			roundId,
			comparisons: 0,
			motorcycleId: { notIn: [...shortlistIds] }
		}
	});

	return shortlist.length;
}

export interface NextComparison {
	a: ComparisonCard;
	b: ComparisonCard;
	votes: number;
	suggested: number;
	shortlistSize: number;
}

export const COMPARISON_SELECT = {
	id: true,
	model: true,
	variant: true,
	modelYear: true,
	firstRegistrationYear: true,
	lastRegistrationYear: true,
	category: true,
	displacementCc: true,
	powerHp: true,
	wetWeightKg: true,
	seatHeightMm: true,
	msrpAmount: true,
	msrpCurrency: true,
	manufacturer: { select: { name: true } },
	images: DISCOVERY_IMAGES
} as const;

export type ComparisonCard = Awaited<
	ReturnType<typeof prisma.motorcycle.findFirstOrThrow<{ select: typeof COMPARISON_SELECT }>>
>;

/**
 * Picks the next pair to show. Returns null when there is nothing left to
 * compare (fewer than two shortlisted motorcycles).
 */
export async function nextComparison(roundId: string): Promise<NextComparison | null> {
	await ensureRankings(roundId);

	const rankings = await prisma.roundMotorcycleRanking.findMany({
		where: { roundId },
		select: { motorcycleId: true, eloScore: true, comparisons: true }
	});

	if (rankings.length < 2) return null;

	const votes = await prisma.comparisonVote.findMany({
		where: { roundId },
		select: { motorcycleAId: true, motorcycleBId: true }
	});
	const seenPairs = new Set(votes.map((v) => pairKey(v.motorcycleAId, v.motorcycleBId)));

	const candidates: PairCandidate[] = rankings.map((r) => ({
		motorcycleId: r.motorcycleId,
		eloScore: r.eloScore,
		comparisons: r.comparisons
	}));

	const pair = selectPair(candidates, { seenPairs });
	if (!pair) return null;

	const bikes = await prisma.motorcycle.findMany({
		where: { id: { in: [pair[0].motorcycleId, pair[1].motorcycleId] } },
		select: COMPARISON_SELECT
	});

	const a = bikes.find((x) => x.id === pair[0].motorcycleId);
	const b = bikes.find((x) => x.id === pair[1].motorcycleId);
	if (!a || !b) return null;

	return {
		a: a as ComparisonCard,
		b: b as ComparisonCard,
		votes: votes.length,
		suggested: suggestedComparisonCount(rankings.length),
		shortlistSize: rankings.length
	};
}

/**
 * Records a head-to-head result and updates both Elo scores.
 *
 * Wrapped in a transaction: an interrupted write must not leave a vote counted
 * with only one rating adjusted, because the table would then disagree with a
 * rebuild from the votes.
 */
export async function recordVote(roundId: string, input: ComparisonVoteInput): Promise<void> {
	const { motorcycleAId, motorcycleBId, winnerMotorcycleId } = input;

	// Make sure every shortlisted motorcycle has a ranking row before we look
	// for one. `nextComparison` normally does this, but a vote must not depend
	// on the caller having asked for a pair first — and a vote arriving for a
	// motorcycle liked in another tab should still work.
	await ensureRankings(roundId);

	await prisma.$transaction(async (tx) => {
		const rankings = await tx.roundMotorcycleRanking.findMany({
			where: { roundId, motorcycleId: { in: [motorcycleAId, motorcycleBId] } }
		});

		const rankA = rankings.find((r) => r.motorcycleId === motorcycleAId);
		const rankB = rankings.find((r) => r.motorcycleId === motorcycleBId);

		// Both must be in the shortlist. After ensureRankings above, a missing
		// row means the motorcycle is not liked in this round at all — a stale
		// or forged submission, rejected rather than silently creating rows.
		if (!rankA || !rankB) {
			throw new ValidationError('Those motorcycles are not both in this round shortlist any more.');
		}

		const aWon = winnerMotorcycleId === motorcycleAId;
		const outcome = applyResult(
			rankA.eloScore,
			rankB.eloScore,
			rankA.comparisons,
			rankB.comparisons,
			aWon ? 1 : 0
		);

		await tx.comparisonVote.create({
			data: { roundId, motorcycleAId, motorcycleBId, winnerMotorcycleId }
		});

		await tx.roundMotorcycleRanking.update({
			where: { id: rankA.id },
			data: {
				eloScore: outcome.ratingA,
				comparisons: { increment: 1 },
				wins: { increment: aWon ? 1 : 0 },
				losses: { increment: aWon ? 0 : 1 }
			}
		});

		await tx.roundMotorcycleRanking.update({
			where: { id: rankB.id },
			data: {
				eloScore: outcome.ratingB,
				comparisons: { increment: 1 },
				wins: { increment: aWon ? 0 : 1 },
				losses: { increment: aWon ? 1 : 0 }
			}
		});

		await tx.discoveryRound.update({ where: { id: roundId }, data: { updatedAt: new Date() } });
	});
}

/**
 * Recomputes the whole table from the stored votes.
 *
 * The ranking table is a cache; this is the proof. Useful after changing the
 * Elo constants, and as the repair path if a table is ever suspected wrong.
 */
export async function rebuildRound(roundId: string): Promise<void> {
	const shortlist = await prisma.swipe.findMany({
		where: { roundId, decision: { in: ['LIKE', 'SUPERLIKE'] } },
		select: { motorcycleId: true, decision: true }
	});

	const state = new Map<
		string,
		{ elo: number; comparisons: number; wins: number; losses: number }
	>();
	for (const s of shortlist) {
		state.set(s.motorcycleId, {
			elo: startingElo(s.decision === 'SUPERLIKE'),
			comparisons: 0,
			wins: 0,
			losses: 0
		});
	}

	const votes = await prisma.comparisonVote.findMany({
		where: { roundId },
		orderBy: { createdAt: 'asc' }
	});

	for (const vote of votes) {
		const a = state.get(vote.motorcycleAId);
		const b = state.get(vote.motorcycleBId);
		if (!a || !b) continue; // No longer shortlisted; its history is inert.

		const aWon = vote.winnerMotorcycleId === vote.motorcycleAId;
		const outcome = applyResult(a.elo, b.elo, a.comparisons, b.comparisons, aWon ? 1 : 0);
		a.elo = outcome.ratingA;
		b.elo = outcome.ratingB;
		a.comparisons++;
		b.comparisons++;
		if (aWon) {
			a.wins++;
			b.losses++;
		} else {
			b.wins++;
			a.losses++;
		}
	}

	await prisma.$transaction([
		prisma.roundMotorcycleRanking.deleteMany({ where: { roundId } }),
		prisma.roundMotorcycleRanking.createMany({
			data: [...state.entries()].map(([motorcycleId, s]) => ({
				roundId,
				motorcycleId,
				eloScore: s.elo,
				comparisons: s.comparisons,
				wins: s.wins,
				losses: s.losses
			}))
		})
	]);
}

export async function getRanking(roundId: string) {
	await ensureRankings(roundId);

	return prisma.roundMotorcycleRanking.findMany({
		where: { roundId },
		orderBy: [{ eloScore: 'desc' }, { wins: 'desc' }],
		select: {
			eloScore: true,
			comparisons: true,
			wins: true,
			losses: true,
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
					msrpAmount: true,
					msrpCurrency: true,
					seatHeightMm: true,
					wetWeightKg: true,
					manufacturer: { select: { name: true } },
					images: DISCOVERY_IMAGES
				}
			}
		}
	});
}

export async function comparisonCount(roundId: string): Promise<number> {
	return prisma.comparisonVote.count({ where: { roundId } });
}

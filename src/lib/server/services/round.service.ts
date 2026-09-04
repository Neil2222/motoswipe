import { prisma } from '../db/client';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { normalizeFilters, RoundFiltersSchema } from '$lib/domain/filters';
import type { RoundCreateInput } from '$lib/domain/validation';
import { countCandidates } from './motorcycle.service';
import type { RoundStatus } from '$lib/domain/enums';
import type { RoundSummary } from '$lib/domain/view-types';

export type { RoundSummary };

/**
 * Discovery rounds: create, list, duplicate, archive.
 *
 * Every function takes a `userId` and scopes its query by it. Ownership is
 * enforced twice — here and in `guards.ts` — because a single missed check is
 * the difference between a private shortlist and a public one.
 */

const MAX_ROUNDS_PER_USER = 100;

export async function createRound(userId: string, input: RoundCreateInput) {
	const existing = await prisma.discoveryRound.count({ where: { userId } });
	if (existing >= MAX_ROUNDS_PER_USER) {
		throw new ConflictError(
			`You have reached the limit of ${MAX_ROUNDS_PER_USER} rounds. Archive or delete one first.`
		);
	}

	const filters = normalizeFilters(RoundFiltersSchema.parse(input.filters ?? {}));

	// A round nobody can swipe is a dead end. Reject it at creation with a
	// message that points at the cause, rather than showing an empty deck.
	const candidates = await countCandidates(filters);
	if (candidates === 0) {
		throw new ValidationError('No motorcycles match those filters.', {
			filters:
				'No motorcycles in the catalogue match this combination. Loosen a filter, or choose "Show me everything".'
		});
	}

	return prisma.discoveryRound.create({
		data: {
			userId,
			name: input.name,
			description: input.description ?? null,
			goal: input.goal ?? null,
			visibility: input.visibility ?? 'PRIVATE',
			status: 'ACTIVE',
			filters
		}
	});
}

/**
 * Rounds for the dashboard, with their counters.
 *
 * Counts come from two grouped queries rather than N per round: a user with 30
 * rounds should still be one round-trip's worth of work.
 */
export async function listRounds(
	userId: string,
	options: { includeArchived?: boolean } = {}
): Promise<RoundSummary[]> {
	const rounds = await prisma.discoveryRound.findMany({
		where: {
			userId,
			...(options.includeArchived ? {} : { status: { not: 'ARCHIVED' } })
		},
		orderBy: [{ updatedAt: 'desc' }]
	});

	if (rounds.length === 0) return [];
	const roundIds = rounds.map((r) => r.id);

	const [swipeGroups, comparisonGroups] = await Promise.all([
		prisma.swipe.groupBy({
			by: ['roundId', 'decision'],
			where: { roundId: { in: roundIds } },
			_count: { _all: true }
		}),
		prisma.comparisonVote.groupBy({
			by: ['roundId'],
			where: { roundId: { in: roundIds } },
			_count: { _all: true }
		})
	]);

	const swipeCounts = new Map<string, Record<string, number>>();
	for (const g of swipeGroups) {
		const entry = swipeCounts.get(g.roundId) ?? {};
		entry[g.decision] = g._count._all;
		swipeCounts.set(g.roundId, entry);
	}
	const comparisonCounts = new Map(comparisonGroups.map((g) => [g.roundId, g._count._all]));

	// Leaders: only rounds that actually have comparisons need a lookup.
	const roundsWithComparisons = roundIds.filter((id) => (comparisonCounts.get(id) ?? 0) > 0);
	const leaders = roundsWithComparisons.length
		? await prisma.roundMotorcycleRanking.findMany({
				where: { roundId: { in: roundsWithComparisons }, comparisons: { gt: 0 } },
				orderBy: [{ roundId: 'asc' }, { eloScore: 'desc' }],
				select: {
					roundId: true,
					eloScore: true,
					motorcycle: {
						select: { id: true, model: true, manufacturer: { select: { name: true } } }
					}
				}
			})
		: [];

	const winnerByRound = new Map<string, RoundSummary['winner']>();
	for (const row of leaders) {
		if (winnerByRound.has(row.roundId)) continue; // first per round = highest Elo
		winnerByRound.set(row.roundId, {
			id: row.motorcycle.id,
			model: row.motorcycle.model,
			manufacturerName: row.motorcycle.manufacturer.name
		});
	}

	// Deck sizes are computed per distinct filter set — several rounds often
	// share "everything", and that becomes one count instead of many.
	const totals = new Map<string, number>();
	for (const round of rounds) {
		const key = JSON.stringify(round.filters ?? {});
		if (!totals.has(key)) totals.set(key, await countCandidates(round.filters));
	}

	return rounds.map((round) => {
		const counts = swipeCounts.get(round.id) ?? {};
		const likes = counts.LIKE ?? 0;
		const superlikes = counts.SUPERLIKE ?? 0;
		const dislikes = counts.DISLIKE ?? 0;
		const skips = counts.SKIP ?? 0;
		return {
			id: round.id,
			name: round.name,
			description: round.description,
			goal: round.goal,
			status: round.status,
			visibility: round.visibility,
			filters: round.filters,
			createdAt: round.createdAt,
			updatedAt: round.updatedAt,
			completedAt: round.completedAt,
			archivedAt: round.archivedAt,
			total: totals.get(JSON.stringify(round.filters ?? {})) ?? 0,
			swiped: likes + superlikes + dislikes + skips,
			likes,
			superlikes,
			dislikes,
			skips,
			comparisons: comparisonCounts.get(round.id) ?? 0,
			winner: winnerByRound.get(round.id) ?? null
		};
	});
}

/** Counters for a single round. */
export async function getRoundProgress(roundId: string, filters: unknown) {
	const [groups, total] = await Promise.all([
		prisma.swipe.groupBy({
			by: ['decision'],
			where: { roundId },
			_count: { _all: true }
		}),
		countCandidates(filters)
	]);

	const counts: Record<string, number> = {};
	for (const g of groups) counts[g.decision] = g._count._all;

	const likes = counts.LIKE ?? 0;
	const superlikes = counts.SUPERLIKE ?? 0;
	const dislikes = counts.DISLIKE ?? 0;
	const skips = counts.SKIP ?? 0;
	const swiped = likes + superlikes + dislikes + skips;

	return {
		total,
		swiped,
		remaining: Math.max(total - swiped, 0),
		likes,
		superlikes,
		dislikes,
		skips,
		shortlist: likes + superlikes
	};
}

/**
 * Duplicates a round's *configuration*.
 *
 * Copies name (caller supplies a new one), description, goal, filters and
 * visibility. Deliberately does NOT copy swipes, comparisons or rankings — the
 * whole point is a clean second experiment over the same brief.
 */
export async function duplicateRound(userId: string, roundId: string, newName: string) {
	const source = await prisma.discoveryRound.findFirst({
		where: { id: roundId, userId }
	});
	if (!source) throw new NotFoundError('That round');

	return prisma.discoveryRound.create({
		data: {
			userId,
			name: newName,
			description: source.description,
			goal: source.goal,
			visibility: source.visibility,
			filters: source.filters ?? {},
			status: 'ACTIVE'
		}
	});
}

export async function setRoundStatus(userId: string, roundId: string, status: RoundStatus) {
	const round = await prisma.discoveryRound.findFirst({ where: { id: roundId, userId } });
	if (!round) throw new NotFoundError('That round');

	return prisma.discoveryRound.update({
		where: { id: roundId },
		data: {
			status,
			completedAt: status === 'COMPLETED' ? (round.completedAt ?? new Date()) : round.completedAt,
			archivedAt: status === 'ARCHIVED' ? new Date() : status === 'ACTIVE' ? null : round.archivedAt
		}
	});
}

export async function renameRound(
	userId: string,
	roundId: string,
	data: { name?: string; description?: string | null; goal?: string | null }
) {
	const round = await prisma.discoveryRound.findFirst({ where: { id: roundId, userId } });
	if (!round) throw new NotFoundError('That round');

	return prisma.discoveryRound.update({ where: { id: roundId }, data });
}

/**
 * Permanently deletes a round and everything scoped to it (swipes, votes,
 * rankings cascade). Motorcycles are untouched.
 */
export async function deleteRound(userId: string, roundId: string) {
	const round = await prisma.discoveryRound.findFirst({ where: { id: roundId, userId } });
	if (!round) throw new NotFoundError('That round');
	await prisma.discoveryRound.delete({ where: { id: roundId } });
}

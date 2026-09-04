import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	createRoundFor,
	createUser,
	ensureCatalogue,
	prisma,
	resetDatabase,
	someMotorcycleIds
} from './helpers';
import {
	comparisonCount,
	ensureRankings,
	getRanking,
	nextComparison,
	rebuildRound,
	recordVote
} from '../src/lib/server/services/ranking.service';
import { recordSwipe } from '../src/lib/server/services/swipe.service';
import { getRoundStatistics } from '../src/lib/server/statistics/statistics.service';
import { INITIAL_ELO, SUPERLIKE_ELO_BONUS, pairKey } from '../src/lib/server/ranking/elo';
import { ValidationError } from '../src/lib/server/errors';

beforeAll(async () => {
	await resetDatabase();
	await ensureCatalogue();
});

beforeEach(async () => {
	await resetDatabase();
});

/** A round with `likes` liked and `supers` superliked motorcycles. */
async function roundWithShortlist(likes: number, supers = 0) {
	const { user } = await createUser();
	const round = await createRoundFor(user.id);
	const ids = await someMotorcycleIds(likes + supers);

	for (let i = 0; i < likes; i++) await recordSwipe(round.id, ids[i], 'LIKE');
	for (let i = likes; i < likes + supers; i++) await recordSwipe(round.id, ids[i], 'SUPERLIKE');

	return { user, round, ids, liked: ids.slice(0, likes), superliked: ids.slice(likes) };
}

describe('ensureRankings', () => {
	it('creates a row for each shortlisted motorcycle', async () => {
		const { round } = await roundWithShortlist(4);
		await ensureRankings(round.id);
		expect(await prisma.roundMotorcycleRanking.count({ where: { roundId: round.id } })).toBe(4);
	});

	it('ignores disliked and skipped motorcycles', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const ids = await someMotorcycleIds(4);

		await recordSwipe(round.id, ids[0], 'LIKE');
		await recordSwipe(round.id, ids[1], 'DISLIKE');
		await recordSwipe(round.id, ids[2], 'SKIP');
		await recordSwipe(round.id, ids[3], 'SUPERLIKE');

		await ensureRankings(round.id);
		expect(await prisma.roundMotorcycleRanking.count({ where: { roundId: round.id } })).toBe(2);
	});

	it('seeds a like at the baseline and a superlike above it', async () => {
		const { round, liked, superliked } = await roundWithShortlist(1, 1);
		await ensureRankings(round.id);

		const likeRow = await prisma.roundMotorcycleRanking.findFirst({
			where: { roundId: round.id, motorcycleId: liked[0] }
		});
		const superRow = await prisma.roundMotorcycleRanking.findFirst({
			where: { roundId: round.id, motorcycleId: superliked[0] }
		});

		expect(likeRow?.eloScore).toBe(INITIAL_ELO);
		expect(superRow?.eloScore).toBe(INITIAL_ELO + SUPERLIKE_ELO_BONUS);
	});

	it('is idempotent', async () => {
		const { round } = await roundWithShortlist(3);
		await ensureRankings(round.id);
		await ensureRankings(round.id);
		expect(await prisma.roundMotorcycleRanking.count({ where: { roundId: round.id } })).toBe(3);
	});

	it('drops a demoted motorcycle that has no comparison history', async () => {
		const { round, liked } = await roundWithShortlist(3);
		await ensureRankings(round.id);

		await recordSwipe(round.id, liked[0], 'DISLIKE');
		await ensureRankings(round.id);

		expect(
			await prisma.roundMotorcycleRanking.count({
				where: { roundId: round.id, motorcycleId: liked[0] }
			})
		).toBe(0);
	});

	it('keeps a demoted motorcycle that has already been compared', async () => {
		const { round, liked } = await roundWithShortlist(3);
		await recordVote(round.id, {
			motorcycleAId: liked[0],
			motorcycleBId: liked[1],
			winnerMotorcycleId: liked[0]
		});

		await recordSwipe(round.id, liked[0], 'DISLIKE');
		await ensureRankings(round.id);

		// Its history is still referenced by a ComparisonVote; dropping the row
		// would lose the record of a comparison the user actually made.
		expect(
			await prisma.roundMotorcycleRanking.count({
				where: { roundId: round.id, motorcycleId: liked[0] }
			})
		).toBe(1);
	});
});

describe('nextComparison', () => {
	it('returns null with fewer than two shortlisted motorcycles', async () => {
		const { round } = await roundWithShortlist(1);
		expect(await nextComparison(round.id)).toBeNull();
	});

	it('returns a distinct pair drawn from the shortlist', async () => {
		const { round, liked } = await roundWithShortlist(5);
		const comparison = await nextComparison(round.id);

		expect(comparison).not.toBeNull();
		expect(comparison!.a.id).not.toBe(comparison!.b.id);
		expect(liked).toContain(comparison!.a.id);
		expect(liked).toContain(comparison!.b.id);
	});

	it('never offers a motorcycle the user disliked', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const ids = await someMotorcycleIds(5);

		await recordSwipe(round.id, ids[0], 'LIKE');
		await recordSwipe(round.id, ids[1], 'LIKE');
		await recordSwipe(round.id, ids[2], 'DISLIKE');
		await recordSwipe(round.id, ids[3], 'DISLIKE');

		for (let i = 0; i < 12; i++) {
			const comparison = await nextComparison(round.id);
			if (!comparison) break;
			expect([ids[2], ids[3]]).not.toContain(comparison.a.id);
			expect([ids[2], ids[3]]).not.toContain(comparison.b.id);
		}
	});

	it('reports vote and target counts', async () => {
		const { round } = await roundWithShortlist(4);
		const comparison = await nextComparison(round.id);
		expect(comparison!.votes).toBe(0);
		expect(comparison!.shortlistSize).toBe(4);
		expect(comparison!.suggested).toBeGreaterThan(0);
	});

	it('works its way through fresh pairings', async () => {
		const { round } = await roundWithShortlist(4);
		const seen = new Set<string>();

		for (let i = 0; i < 6; i++) {
			const comparison = await nextComparison(round.id);
			if (!comparison) break;
			await recordVote(round.id, {
				motorcycleAId: comparison.a.id,
				motorcycleBId: comparison.b.id,
				winnerMotorcycleId: comparison.a.id
			});
			seen.add(pairKey(comparison.a.id, comparison.b.id));
		}

		// 4 bikes have 6 distinct pairings; all should be reachable.
		expect(seen.size).toBe(6);
	});
});

describe('recordVote', () => {
	it('moves the winner above the loser', async () => {
		const { round, liked } = await roundWithShortlist(2);

		await recordVote(round.id, {
			motorcycleAId: liked[0],
			motorcycleBId: liked[1],
			winnerMotorcycleId: liked[0]
		});

		const ranking = await getRanking(round.id);
		expect(ranking[0].motorcycle.id).toBe(liked[0]);
		expect(ranking[0].eloScore).toBeGreaterThan(ranking[1].eloScore);
	});

	it('records wins, losses and comparison counts', async () => {
		const { round, liked } = await roundWithShortlist(2);

		await recordVote(round.id, {
			motorcycleAId: liked[0],
			motorcycleBId: liked[1],
			winnerMotorcycleId: liked[1]
		});

		const rows = await prisma.roundMotorcycleRanking.findMany({ where: { roundId: round.id } });
		const winner = rows.find((r) => r.motorcycleId === liked[1])!;
		const loser = rows.find((r) => r.motorcycleId === liked[0])!;

		expect(winner.wins).toBe(1);
		expect(winner.losses).toBe(0);
		expect(winner.comparisons).toBe(1);
		expect(loser.wins).toBe(0);
		expect(loser.losses).toBe(1);
		expect(loser.comparisons).toBe(1);
	});

	it('stores the vote itself', async () => {
		const { round, liked } = await roundWithShortlist(2);
		await recordVote(round.id, {
			motorcycleAId: liked[0],
			motorcycleBId: liked[1],
			winnerMotorcycleId: liked[0]
		});

		expect(await comparisonCount(round.id)).toBe(1);
		const vote = await prisma.comparisonVote.findFirst({ where: { roundId: round.id } });
		expect(vote?.winnerMotorcycleId).toBe(liked[0]);
	});

	it('rejects a vote for a motorcycle that is not shortlisted', async () => {
		const { round, liked } = await roundWithShortlist(2);
		const outsider = (await someMotorcycleIds(30)).at(-1)!;

		await expect(
			recordVote(round.id, {
				motorcycleAId: liked[0],
				motorcycleBId: outsider,
				winnerMotorcycleId: liked[0]
			})
		).rejects.toBeInstanceOf(ValidationError);

		// And the failed vote left nothing behind.
		expect(await comparisonCount(round.id)).toBe(0);
	});

	it('leaves the table consistent when a vote is rejected', async () => {
		const { round, liked } = await roundWithShortlist(2);
		const outsider = (await someMotorcycleIds(30)).at(-1)!;

		await recordVote(round.id, {
			motorcycleAId: liked[0],
			motorcycleBId: liked[1],
			winnerMotorcycleId: liked[0]
		});

		await recordVote(round.id, {
			motorcycleAId: liked[0],
			motorcycleBId: outsider,
			winnerMotorcycleId: liked[0]
		}).catch(() => {});

		const rows = await prisma.roundMotorcycleRanking.findMany({ where: { roundId: round.id } });
		// The transaction rolled back: still exactly one comparison each.
		expect(rows.every((r) => r.comparisons === 1)).toBe(true);
	});

	it('lets the comparison phase overrule a superlike', async () => {
		const { round, liked, superliked } = await roundWithShortlist(1, 1);

		for (let i = 0; i < 6; i++) {
			await recordVote(round.id, {
				motorcycleAId: superliked[0],
				motorcycleBId: liked[0],
				winnerMotorcycleId: liked[0]
			});
		}

		const ranking = await getRanking(round.id);
		expect(ranking[0].motorcycle.id).toBe(liked[0]);
	});
});

describe('rebuildRound', () => {
	it('reproduces the table exactly from the stored votes', async () => {
		const { round, liked } = await roundWithShortlist(5);

		// A deterministic sequence of results.
		for (let i = 0; i < 8; i++) {
			const comparison = await nextComparison(round.id);
			if (!comparison) break;
			await recordVote(round.id, {
				motorcycleAId: comparison.a.id,
				motorcycleBId: comparison.b.id,
				winnerMotorcycleId: i % 2 === 0 ? comparison.a.id : comparison.b.id
			});
		}

		const before = (await getRanking(round.id)).map((r) => ({
			id: r.motorcycle.id,
			elo: Math.round(r.eloScore * 1000),
			wins: r.wins,
			losses: r.losses,
			comparisons: r.comparisons
		}));

		await rebuildRound(round.id);

		const after = (await getRanking(round.id)).map((r) => ({
			id: r.motorcycle.id,
			elo: Math.round(r.eloScore * 1000),
			wins: r.wins,
			losses: r.losses,
			comparisons: r.comparisons
		}));

		// The ranking table is a cache; a rebuild must agree with it exactly.
		expect(after).toEqual(before);
		expect(liked).toContain(after[0].id);
	});
});

describe('statistics', () => {
	it('counts decisions and computes rates excluding skips', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const ids = await someMotorcycleIds(10);

		for (let i = 0; i < 4; i++) await recordSwipe(round.id, ids[i], 'LIKE');
		for (let i = 4; i < 6; i++) await recordSwipe(round.id, ids[i], 'SUPERLIKE');
		for (let i = 6; i < 9; i++) await recordSwipe(round.id, ids[i], 'DISLIKE');
		await recordSwipe(round.id, ids[9], 'SKIP');

		const stats = await getRoundStatistics(round.id);

		expect(stats.totals.seen).toBe(10);
		expect(stats.totals.likes).toBe(4);
		expect(stats.totals.superlikes).toBe(2);
		expect(stats.totals.dislikes).toBe(3);
		expect(stats.totals.skips).toBe(1);
		// (4 + 2) / (10 - 1 skip) = 6/9
		expect(stats.totals.likeRate).toBeCloseTo(6 / 9, 6);
		expect(stats.totals.superlikeRate).toBeCloseTo(2 / 9, 6);
	});

	it('reports zeroes rather than NaN for an untouched round', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);

		const stats = await getRoundStatistics(round.id);
		expect(stats.totals.seen).toBe(0);
		expect(stats.totals.likeRate).toBe(0);
		expect(stats.likedAverages.displacementCc).toBeNull();
		expect(stats.manufacturers).toEqual([]);
	});

	it('groups by manufacturer with per-group like rates', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);

		const kawasakis = await prisma.motorcycle.findMany({
			where: { manufacturer: { name: 'Kawasaki' } },
			select: { id: true }
		});
		expect(kawasakis.length).toBeGreaterThan(1);

		await recordSwipe(round.id, kawasakis[0].id, 'LIKE');
		await recordSwipe(round.id, kawasakis[1].id, 'DISLIKE');

		const stats = await getRoundStatistics(round.id);
		const kawasaki = stats.manufacturers.find((m) => m.key === 'Kawasaki');

		expect(kawasaki?.shown).toBe(2);
		expect(kawasaki?.liked).toBe(1);
		expect(kawasaki?.likeRate).toBeCloseTo(0.5, 6);
	});

	it('marks a small sample as not significant', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const [id] = await someMotorcycleIds(1);
		await recordSwipe(round.id, id, 'LIKE');

		const stats = await getRoundStatistics(round.id);
		// One bike at 100% is not "your favourite manufacturer".
		expect(stats.manufacturers[0].significant).toBe(false);
	});

	it('averages only over motorcycles that publish the figure', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);

		const withCc = await prisma.motorcycle.findFirst({
			where: { displacementCc: { not: null } },
			select: { id: true, displacementCc: true }
		});
		const withoutCc = await prisma.motorcycle.findFirst({
			where: { displacementCc: null },
			select: { id: true }
		});

		await recordSwipe(round.id, withCc!.id, 'LIKE');
		await recordSwipe(round.id, withoutCc!.id, 'LIKE');

		const stats = await getRoundStatistics(round.id);
		// The null is excluded rather than counted as zero, which would halve it.
		expect(stats.likedAverages.displacementCc).toBe(withCc!.displacementCc);
	});

	it('averages price only within one currency', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const priced = await prisma.motorcycle.findMany({
			where: { msrpAmount: { not: null } },
			select: { id: true },
			take: 3
		});
		for (const bike of priced) await recordSwipe(round.id, bike.id, 'LIKE');

		const stats = await getRoundStatistics(round.id);
		expect(stats.likedAverages.price?.currency).toBeTruthy();
		expect(stats.likedAverages.price?.amount).toBeGreaterThan(0);
	});

	it('reports the passenger-capable ratio over bikes with a published answer', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);

		const yes = await prisma.motorcycle.findFirst({
			where: { passengerAllowed: true },
			select: { id: true }
		});
		const no = await prisma.motorcycle.findFirst({
			where: { passengerAllowed: false },
			select: { id: true }
		});

		await recordSwipe(round.id, yes!.id, 'LIKE');
		await recordSwipe(round.id, no!.id, 'LIKE');

		const stats = await getRoundStatistics(round.id);
		expect(stats.likedAverages.passengerCapableRatio).toBeCloseTo(0.5, 6);
	});

	it('scopes statistics to one round', async () => {
		const { user } = await createUser();
		const roundA = await createRoundFor(user.id, {}, 'A');
		const roundB = await createRoundFor(user.id, {}, 'B');
		const ids = await someMotorcycleIds(4);

		await recordSwipe(roundA.id, ids[0], 'LIKE');
		await recordSwipe(roundA.id, ids[1], 'LIKE');
		await recordSwipe(roundB.id, ids[2], 'DISLIKE');

		expect((await getRoundStatistics(roundA.id)).totals.seen).toBe(2);
		expect((await getRoundStatistics(roundB.id)).totals.seen).toBe(1);
	});
});

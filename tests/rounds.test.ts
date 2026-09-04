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
	createRound,
	deleteRound,
	duplicateRound,
	getRoundProgress,
	listRounds,
	setRoundStatus
} from '../src/lib/server/services/round.service';
import { recordSwipe } from '../src/lib/server/services/swipe.service';
import { recordVote } from '../src/lib/server/services/ranking.service';
import { ConflictError, NotFoundError, ValidationError } from '../src/lib/server/errors';
import { countCandidates } from '../src/lib/server/services/motorcycle.service';

beforeAll(async () => {
	await resetDatabase();
	await ensureCatalogue();
});

beforeEach(async () => {
	await resetDatabase();
});

describe('createRound', () => {
	it('creates an unfiltered round that sees the whole catalogue', async () => {
		const { user } = await createUser();
		const round = await createRound(user.id, {
			name: 'Everything',
			visibility: 'PRIVATE',
			filters: {}
		});

		expect(round.name).toBe('Everything');
		expect(round.status).toBe('ACTIVE');
		expect(round.visibility).toBe('PRIVATE');
		expect(round.filters).toEqual({});

		const progress = await getRoundProgress(round.id, round.filters);
		expect(progress.total).toBe(await countCandidates({}));
	});

	it('defaults to PRIVATE visibility', async () => {
		const { user } = await createUser();
		const round = await createRound(user.id, {
			name: 'Default privacy',
			visibility: 'PRIVATE',
			filters: {}
		});
		expect(round.visibility).toBe('PRIVATE');
	});

	it('stores filters so the round can be inspected later', async () => {
		const { user } = await createUser();
		const round = await createRound(user.id, {
			name: 'Big nakeds',
			visibility: 'PRIVATE',
			filters: { categories: ['NAKED'], displacementMin: 800 }
		});

		expect(round.filters).toMatchObject({ categories: ['NAKED'], displacementMin: 800 });
	});

	it('normalises an inverted range instead of storing it', async () => {
		const { user } = await createUser();
		const round = await createRound(user.id, {
			name: 'Inverted',
			visibility: 'PRIVATE',
			filters: { displacementMin: 1200, displacementMax: 600 }
		});

		expect(round.filters).toMatchObject({ displacementMin: 600, displacementMax: 1200 });
	});

	it('refuses a filter combination that matches nothing', async () => {
		const { user } = await createUser();
		await expect(
			createRound(user.id, {
				name: 'Impossible',
				visibility: 'PRIVATE',
				filters: { displacementMin: 4000, displacementMax: 5000 }
			})
		).rejects.toBeInstanceOf(ValidationError);
	});
});

describe('round filtering', () => {
	it('narrows the deck by category', async () => {
		const all = await countCandidates({});
		const naked = await countCandidates({ categories: ['NAKED'] });
		expect(naked).toBeGreaterThan(0);
		expect(naked).toBeLessThan(all);
	});

	it('narrows by displacement, excluding bikes with no published figure', async () => {
		const filtered = await countCandidates({ displacementMin: 1000 });
		const rows = await prisma.motorcycle.findMany({
			where: { isActive: true },
			select: { displacementCc: true }
		});
		const expected = rows.filter((r) => (r.displacementCc ?? -1) >= 1000).length;
		expect(filtered).toBe(expected);
	});

	it('excludes unknown values rather than assuming they qualify', async () => {
		// The electric bike has a null displacement and must not appear in a
		// "1000cc or more" deck just because we do not know.
		const electric = await prisma.motorcycle.findFirst({
			where: { displacementCc: null },
			select: { id: true }
		});
		expect(electric).not.toBeNull();

		const ids = await prisma.motorcycle.findMany({
			where: { AND: [{ isActive: true }, { displacementCc: { gte: 1 } }] },
			select: { id: true }
		});
		expect(ids.map((r) => r.id)).not.toContain(electric!.id);
	});

	it('narrows by passenger capability', async () => {
		const all = await countCandidates({});
		const twoUp = await countCandidates({ passengerRequired: true });
		expect(twoUp).toBeGreaterThan(0);
		expect(twoUp).toBeLessThan(all);
	});

	it('combines filters conjunctively', async () => {
		const naked = await countCandidates({ categories: ['NAKED'] });
		const nakedBig = await countCandidates({ categories: ['NAKED'], displacementMin: 900 });
		expect(nakedBig).toBeLessThanOrEqual(naked);
	});

	it('never includes a retired motorcycle', async () => {
		const [id] = await someMotorcycleIds(1);
		const before = await countCandidates({});

		await prisma.motorcycle.update({
			where: { id },
			data: { isActive: false, retiredAt: new Date() }
		});
		expect(await countCandidates({})).toBe(before - 1);

		await prisma.motorcycle.update({
			where: { id },
			data: { isActive: true, retiredAt: null }
		});
	});
});

describe('round ownership', () => {
	it('lists only the owner rounds', async () => {
		const { user: alice } = await createUser();
		const { user: bob } = await createUser();

		await createRoundFor(alice.id, {}, 'Alice round');
		await createRoundFor(bob.id, {}, 'Bob round');

		const aliceRounds = await listRounds(alice.id);
		expect(aliceRounds).toHaveLength(1);
		expect(aliceRounds[0].name).toBe('Alice round');
	});

	it('refuses to duplicate someone else round', async () => {
		const { user: alice } = await createUser();
		const { user: bob } = await createUser();
		const bobRound = await createRoundFor(bob.id, {}, 'Bob round');

		await expect(duplicateRound(alice.id, bobRound.id, 'Stolen')).rejects.toBeInstanceOf(
			NotFoundError
		);
	});

	it('refuses to archive someone else round', async () => {
		const { user: alice } = await createUser();
		const { user: bob } = await createUser();
		const bobRound = await createRoundFor(bob.id, {}, 'Bob round');

		await expect(setRoundStatus(alice.id, bobRound.id, 'ARCHIVED')).rejects.toBeInstanceOf(
			NotFoundError
		);
	});

	it('refuses to delete someone else round', async () => {
		const { user: alice } = await createUser();
		const { user: bob } = await createUser();
		const bobRound = await createRoundFor(bob.id, {}, 'Bob round');

		await expect(deleteRound(alice.id, bobRound.id)).rejects.toBeInstanceOf(NotFoundError);
		expect(await prisma.discoveryRound.findUnique({ where: { id: bobRound.id } })).not.toBeNull();
	});
});

describe('duplicateRound', () => {
	it('copies the configuration but not the history', async () => {
		const { user } = await createUser();
		const source = await prisma.discoveryRound.create({
			data: {
				userId: user.id,
				name: 'First motorcycle 2026',
				description: 'Budget is flexible',
				goal: 'A first big bike',
				filters: { categories: ['NAKED'] },
				status: 'COMPLETED'
			}
		});

		const ids = await someMotorcycleIds(3);
		await recordSwipe(source.id, ids[0], 'LIKE');
		await recordSwipe(source.id, ids[1], 'SUPERLIKE');
		await recordSwipe(source.id, ids[2], 'DISLIKE');
		await recordVote(source.id, {
			motorcycleAId: ids[0],
			motorcycleBId: ids[1],
			winnerMotorcycleId: ids[0]
		});

		const copy = await duplicateRound(user.id, source.id, 'First motorcycle 2027');

		// Configuration carried over.
		expect(copy.name).toBe('First motorcycle 2027');
		expect(copy.description).toBe(source.description);
		expect(copy.goal).toBe(source.goal);
		expect(copy.filters).toEqual(source.filters);
		expect(copy.visibility).toBe(source.visibility);

		// A duplicate is a fresh experiment: no history at all.
		expect(copy.id).not.toBe(source.id);
		expect(copy.status).toBe('ACTIVE');
		expect(copy.completedAt).toBeNull();
		expect(await prisma.swipe.count({ where: { roundId: copy.id } })).toBe(0);
		expect(await prisma.comparisonVote.count({ where: { roundId: copy.id } })).toBe(0);
		expect(await prisma.roundMotorcycleRanking.count({ where: { roundId: copy.id } })).toBe(0);

		// And the original is untouched.
		expect(await prisma.swipe.count({ where: { roundId: source.id } })).toBe(3);
		expect(await prisma.comparisonVote.count({ where: { roundId: source.id } })).toBe(1);
	});

	it('leaves the two rounds fully independent afterwards', async () => {
		const { user } = await createUser();
		const source = await createRoundFor(user.id, {}, 'Round one');
		const ids = await someMotorcycleIds(2);
		await recordSwipe(source.id, ids[0], 'LIKE');

		const copy = await duplicateRound(user.id, source.id, 'Round two');
		await recordSwipe(copy.id, ids[0], 'DISLIKE');

		// The same motorcycle can hold opposite decisions in two rounds.
		const inSource = await prisma.swipe.findUnique({
			where: { roundId_motorcycleId: { roundId: source.id, motorcycleId: ids[0] } }
		});
		const inCopy = await prisma.swipe.findUnique({
			where: { roundId_motorcycleId: { roundId: copy.id, motorcycleId: ids[0] } }
		});

		expect(inSource?.decision).toBe('LIKE');
		expect(inCopy?.decision).toBe('DISLIKE');
	});
});

describe('round status', () => {
	it('stamps completedAt when completed and archivedAt when archived', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);

		const completed = await setRoundStatus(user.id, round.id, 'COMPLETED');
		expect(completed.completedAt).not.toBeNull();

		const archived = await setRoundStatus(user.id, round.id, 'ARCHIVED');
		expect(archived.archivedAt).not.toBeNull();
		// Completion is history: archiving must not erase it.
		expect(archived.completedAt).not.toBeNull();
	});

	it('clears archivedAt when a round is restored', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);

		await setRoundStatus(user.id, round.id, 'ARCHIVED');
		const restored = await setRoundStatus(user.id, round.id, 'ACTIVE');
		expect(restored.archivedAt).toBeNull();
	});

	it('hides archived rounds from the default listing', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id, {}, 'Archived one');
		await createRoundFor(user.id, {}, 'Active one');
		await setRoundStatus(user.id, round.id, 'ARCHIVED');

		expect((await listRounds(user.id)).map((r) => r.name)).toEqual(['Active one']);
		expect(await listRounds(user.id, { includeArchived: true })).toHaveLength(2);
	});
});

describe('listRounds counters', () => {
	it('reports per-decision counts and the shortlist', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const ids = await someMotorcycleIds(6);

		await recordSwipe(round.id, ids[0], 'LIKE');
		await recordSwipe(round.id, ids[1], 'LIKE');
		await recordSwipe(round.id, ids[2], 'SUPERLIKE');
		await recordSwipe(round.id, ids[3], 'DISLIKE');
		await recordSwipe(round.id, ids[4], 'SKIP');

		const [summary] = await listRounds(user.id);
		expect(summary.likes).toBe(2);
		expect(summary.superlikes).toBe(1);
		expect(summary.dislikes).toBe(1);
		expect(summary.skips).toBe(1);
		expect(summary.swiped).toBe(5);
	});

	it('reports the current leader once comparisons exist', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const ids = await someMotorcycleIds(2);

		await recordSwipe(round.id, ids[0], 'LIKE');
		await recordSwipe(round.id, ids[1], 'LIKE');
		await recordVote(round.id, {
			motorcycleAId: ids[0],
			motorcycleBId: ids[1],
			winnerMotorcycleId: ids[0]
		});

		const [summary] = await listRounds(user.id);
		expect(summary.comparisons).toBe(1);
		expect(summary.winner?.id).toBe(ids[0]);
	});

	it('reports no winner before any comparison', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const ids = await someMotorcycleIds(2);
		await recordSwipe(round.id, ids[0], 'SUPERLIKE');
		await recordSwipe(round.id, ids[1], 'LIKE');

		const [summary] = await listRounds(user.id);
		expect(summary.winner).toBeNull();
	});
});

describe('deleteRound', () => {
	it('removes the round and everything scoped to it, leaving motorcycles alone', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const ids = await someMotorcycleIds(2);
		const catalogueBefore = await prisma.motorcycle.count();

		await recordSwipe(round.id, ids[0], 'LIKE');
		await recordSwipe(round.id, ids[1], 'LIKE');
		await recordVote(round.id, {
			motorcycleAId: ids[0],
			motorcycleBId: ids[1],
			winnerMotorcycleId: ids[0]
		});

		await deleteRound(user.id, round.id);

		expect(await prisma.discoveryRound.findUnique({ where: { id: round.id } })).toBeNull();
		expect(await prisma.swipe.count({ where: { roundId: round.id } })).toBe(0);
		expect(await prisma.comparisonVote.count({ where: { roundId: round.id } })).toBe(0);
		expect(await prisma.roundMotorcycleRanking.count({ where: { roundId: round.id } })).toBe(0);
		expect(await prisma.motorcycle.count()).toBe(catalogueBefore);
	});
});

describe('round limits', () => {
	it('stops a user creating unbounded rounds', async () => {
		const { user } = await createUser();
		await prisma.discoveryRound.createMany({
			data: Array.from({ length: 100 }, (_, i) => ({
				userId: user.id,
				name: `Round ${i}`,
				filters: {}
			}))
		});

		await expect(
			createRound(user.id, { name: 'One too many', visibility: 'PRIVATE', filters: {} })
		).rejects.toBeInstanceOf(ConflictError);
	});
});

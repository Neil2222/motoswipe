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
	completeRound,
	DECK_BATCH_SIZE,
	decisionsForMotorcycle,
	getDeck,
	getShortlist,
	lastSwipe,
	recordSwipe,
	swipedIdsFor,
	undoSwipe
} from '../src/lib/server/services/swipe.service';
import { getRoundProgress } from '../src/lib/server/services/round.service';
import { countCandidates } from '../src/lib/server/services/motorcycle.service';
import { NotFoundError, ValidationError } from '../src/lib/server/errors';

beforeAll(async () => {
	await resetDatabase();
	await ensureCatalogue();
});

beforeEach(async () => {
	await resetDatabase();
});

describe('recordSwipe', () => {
	it('records a decision', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const [id] = await someMotorcycleIds(1);

		const result = await recordSwipe(round.id, id, 'LIKE');
		expect(result.changed).toBe(true);
		expect(result.previous).toBeNull();

		const row = await prisma.swipe.findUnique({
			where: { roundId_motorcycleId: { roundId: round.id, motorcycleId: id } }
		});
		expect(row?.decision).toBe('LIKE');
	});

	it('enforces one decision per motorcycle per round', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const [id] = await someMotorcycleIds(1);

		await recordSwipe(round.id, id, 'LIKE');
		await recordSwipe(round.id, id, 'DISLIKE');

		expect(await prisma.swipe.count({ where: { roundId: round.id, motorcycleId: id } })).toBe(1);
	});

	it('rejects a duplicate row at the database level', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const [id] = await someMotorcycleIds(1);

		await prisma.swipe.create({ data: { roundId: round.id, motorcycleId: id, decision: 'LIKE' } });

		// The unique constraint is the real guarantee, not just the service.
		await expect(
			prisma.swipe.create({
				data: { roundId: round.id, motorcycleId: id, decision: 'DISLIKE' }
			})
		).rejects.toThrow();
	});

	it('changes an existing decision and reports the previous one', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const [id] = await someMotorcycleIds(1);

		await recordSwipe(round.id, id, 'LIKE');
		const result = await recordSwipe(round.id, id, 'SUPERLIKE');

		expect(result.changed).toBe(true);
		expect(result.previous).toBe('LIKE');
	});

	it('is idempotent when the decision is unchanged', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const [id] = await someMotorcycleIds(1);

		await recordSwipe(round.id, id, 'LIKE');
		const again = await recordSwipe(round.id, id, 'LIKE');

		expect(again.changed).toBe(false);
	});

	it('keeps decisions in different rounds independent', async () => {
		const { user } = await createUser();
		const roundA = await createRoundFor(user.id, {}, 'A');
		const roundB = await createRoundFor(user.id, {}, 'B');
		const [id] = await someMotorcycleIds(1);

		await recordSwipe(roundA.id, id, 'SUPERLIKE');
		await recordSwipe(roundB.id, id, 'DISLIKE');

		expect(await prisma.swipe.count({ where: { motorcycleId: id } })).toBe(2);
	});

	it('records all four decision types', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const ids = await someMotorcycleIds(4);

		await recordSwipe(round.id, ids[0], 'LIKE');
		await recordSwipe(round.id, ids[1], 'DISLIKE');
		await recordSwipe(round.id, ids[2], 'SUPERLIKE');
		await recordSwipe(round.id, ids[3], 'SKIP');

		const decisions = await prisma.swipe.groupBy({
			by: ['decision'],
			where: { roundId: round.id },
			_count: { _all: true }
		});
		expect(decisions).toHaveLength(4);
	});

	it('rejects a motorcycle that does not exist', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		await expect(
			recordSwipe(round.id, '11111111-1111-4111-8111-111111111111', 'LIKE')
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('touches the round so the dashboard orders by real activity', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const [id] = await someMotorcycleIds(1);
		const before = round.updatedAt;

		await new Promise((r) => setTimeout(r, 12));
		await recordSwipe(round.id, id, 'LIKE');

		const after = await prisma.discoveryRound.findUnique({ where: { id: round.id } });
		expect(after!.updatedAt.getTime()).toBeGreaterThan(before.getTime());
	});
});

describe('undoSwipe', () => {
	it('removes the row entirely so the bike returns to the deck', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const [id] = await someMotorcycleIds(1);

		await recordSwipe(round.id, id, 'LIKE');
		expect(await undoSwipe(round.id, id)).toBe(true);

		// Not "set to SKIP": an undone swipe must leave no statistical trace.
		expect(await prisma.swipe.count({ where: { roundId: round.id } })).toBe(0);
		expect((await swipedIdsFor(round.id)).has(id)).toBe(false);
	});

	it('reports false when there was nothing to undo', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const [id] = await someMotorcycleIds(1);
		expect(await undoSwipe(round.id, id)).toBe(false);
	});

	it('puts the motorcycle back in its original deck position', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);

		const first = await getDeck(round.id, {}, { limit: 3 });
		await recordSwipe(round.id, first[0].id, 'LIKE');

		const afterSwipe = await getDeck(round.id, {}, { limit: 3 });
		expect(afterSwipe.some((card) => card.id === first[0].id)).toBe(false);

		await undoSwipe(round.id, first[0].id);
		const afterUndo = await getDeck(round.id, {}, { limit: 3 });
		expect(afterUndo.map((c) => c.id)).toEqual(first.map((c) => c.id));
	});
});

describe('getDeck / resume', () => {
	it('returns a batch of cards', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);

		const deck = await getDeck(round.id, {}, { limit: DECK_BATCH_SIZE });
		expect(deck).toHaveLength(DECK_BATCH_SIZE);
		expect(deck[0].manufacturer.name).toBeTruthy();
		expect(deck[0].images.length).toBeGreaterThan(0);
	});

	it('never serves a motorcycle already swiped in that round', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);

		const first = await getDeck(round.id, {}, { limit: 5 });
		for (const card of first) await recordSwipe(round.id, card.id, 'DISLIKE');

		const next = await getDeck(round.id, {}, { limit: 5 });
		const swipedIds = new Set(first.map((c) => c.id));
		expect(next.some((c) => swipedIds.has(c.id))).toBe(false);
	});

	it('resumes with saved preferences and excludes all previous decisions', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);

		const initial = await getDeck(round.id, {}, { limit: 10 });
		for (const card of initial.slice(0, 4)) await recordSwipe(round.id, card.id, 'LIKE');

		// A completely fresh call, as a new session would make.
		const resumed = await getDeck(round.id, {}, { limit: 6 });
		const swiped = new Set(initial.slice(0, 4).map((c) => c.id));
		expect(resumed).toHaveLength(6);
		expect(resumed.some((c) => swiped.has(c.id))).toBe(false);
		expect((await getDeck(round.id, {}, { limit: 6 })).map((c) => c.id)).toEqual(
			resumed.map((c) => c.id)
		);
	});

	it('does not learn from another round, including another user’s round', async () => {
		const { user } = await createUser();
		const { user: other } = await createUser();
		const round = await createRoundFor(user.id);
		const ownOtherRound = await createRoundFor(user.id);
		const otherRound = await createRoundFor(other.id);
		const before = await getDeck(round.id, {}, { limit: 12 });
		for (const card of before.slice(0, 5)) {
			await recordSwipe(ownOtherRound.id, card.id, 'SUPERLIKE');
			await recordSwipe(otherRound.id, card.id, 'DISLIKE');
		}
		expect((await getDeck(round.id, {}, { limit: 12 })).map((c) => c.id)).toEqual(
			before.map((c) => c.id)
		);
	});

	it('gives the same order on repeated calls', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);

		const a = await getDeck(round.id, {}, { limit: 8 });
		const b = await getDeck(round.id, {}, { limit: 8 });
		expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
	});

	it('gives two rounds different orders', async () => {
		const { user } = await createUser();
		const roundA = await createRoundFor(user.id, {}, 'A');
		const roundB = await createRoundFor(user.id, {}, 'B');

		const a = await getDeck(roundA.id, {}, { limit: 12 });
		const b = await getDeck(roundB.id, {}, { limit: 12 });
		expect(a.map((c) => c.id)).not.toEqual(b.map((c) => c.id));
	});

	it('honours the exclude list for cards already on screen', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);

		const held = await getDeck(round.id, {}, { limit: 3 });
		const next = await getDeck(round.id, {}, { limit: 3, exclude: held.map((c) => c.id) });

		expect(next.some((c) => held.some((h) => h.id === c.id))).toBe(false);
	});

	it('respects the round filters', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id, { categories: ['CRUISER'] });

		const deck = await getDeck(round.id, { categories: ['CRUISER'] }, { limit: 20 });
		expect(deck.length).toBeGreaterThan(0);
		for (const card of deck) expect(card.category).toBe('CRUISER');
	});

	it('empties out once the deck is exhausted', async () => {
		const { user } = await createUser();
		const filters = { categories: ['BOBBER'] as const };
		const round = await createRoundFor(user.id, filters);
		const total = await countCandidates(filters);

		let swiped = 0;
		for (;;) {
			const deck = await getDeck(round.id, filters, { limit: 5 });
			if (deck.length === 0) break;
			for (const card of deck) {
				await recordSwipe(round.id, card.id, 'DISLIKE');
				swiped++;
			}
		}

		expect(swiped).toBe(total);
		expect(await getDeck(round.id, filters, { limit: 5 })).toHaveLength(0);
	});
});

describe('progress', () => {
	it('tracks counts and remaining accurately', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const total = await countCandidates({});
		const ids = await someMotorcycleIds(5);

		await recordSwipe(round.id, ids[0], 'LIKE');
		await recordSwipe(round.id, ids[1], 'SUPERLIKE');
		await recordSwipe(round.id, ids[2], 'DISLIKE');
		await recordSwipe(round.id, ids[3], 'SKIP');

		const progress = await getRoundProgress(round.id, {});
		expect(progress.total).toBe(total);
		expect(progress.swiped).toBe(4);
		expect(progress.remaining).toBe(total - 4);
		expect(progress.likes).toBe(1);
		expect(progress.superlikes).toBe(1);
		expect(progress.shortlist).toBe(2);
	});

	it('does not double count when a decision is changed', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const [id] = await someMotorcycleIds(1);

		await recordSwipe(round.id, id, 'LIKE');
		await recordSwipe(round.id, id, 'DISLIKE');

		const progress = await getRoundProgress(round.id, {});
		expect(progress.swiped).toBe(1);
		expect(progress.likes).toBe(0);
		expect(progress.dislikes).toBe(1);
	});
});

describe('getShortlist', () => {
	it('returns likes and superlikes only', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const ids = await someMotorcycleIds(4);

		await recordSwipe(round.id, ids[0], 'LIKE');
		await recordSwipe(round.id, ids[1], 'SUPERLIKE');
		await recordSwipe(round.id, ids[2], 'DISLIKE');
		await recordSwipe(round.id, ids[3], 'SKIP');

		const shortlist = await getShortlist(round.id);
		expect(shortlist).toHaveLength(2);
		expect(shortlist.map((s) => s.decision).sort()).toEqual(['LIKE', 'SUPERLIKE']);
	});

	it('can return superlikes alone', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const ids = await someMotorcycleIds(3);

		await recordSwipe(round.id, ids[0], 'LIKE');
		await recordSwipe(round.id, ids[1], 'SUPERLIKE');
		await recordSwipe(round.id, ids[2], 'SUPERLIKE');

		const supers = await getShortlist(round.id, { decisions: ['SUPERLIKE'] });
		expect(supers).toHaveLength(2);
	});

	it('sorts by power with unknown values last', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);

		const bikes = await prisma.motorcycle.findMany({
			where: { isActive: true },
			select: { id: true, powerHp: true },
			take: 12
		});
		for (const bike of bikes) await recordSwipe(round.id, bike.id, 'LIKE');

		const sorted = await getShortlist(round.id, { sort: 'power' });
		const powers = sorted.map((s) => s.motorcycle.powerHp);

		const known = powers.filter((p): p is number => p !== null);
		const firstNullAt = powers.findIndex((p) => p === null);
		if (firstNullAt !== -1) {
			// Every null comes after every known figure.
			expect(powers.slice(firstNullAt).every((p) => p === null)).toBe(true);
		}
		for (let i = 1; i < known.length; i++) {
			expect(known[i]).toBeLessThanOrEqual(known[i - 1]);
		}
	});
});

describe('lastSwipe and cross-round decisions', () => {
	it('returns the most recent decision', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const ids = await someMotorcycleIds(2);

		await recordSwipe(round.id, ids[0], 'LIKE');
		await new Promise((r) => setTimeout(r, 12));
		await recordSwipe(round.id, ids[1], 'SUPERLIKE');

		const last = await lastSwipe(round.id);
		expect(last?.motorcycleId).toBe(ids[1]);
	});

	it('shows a user their decisions about one motorcycle across rounds', async () => {
		const { user } = await createUser();
		const roundA = await createRoundFor(user.id, {}, 'First motorcycle 2026');
		const roundB = await createRoundFor(user.id, {}, 'Cruiser search');
		const [id] = await someMotorcycleIds(1);

		await recordSwipe(roundA.id, id, 'SUPERLIKE');
		await recordSwipe(roundB.id, id, 'LIKE');

		const decisions = await decisionsForMotorcycle(user.id, id);
		expect(decisions).toHaveLength(2);
		expect(decisions.map((d) => d.round.name).sort()).toEqual([
			'Cruiser search',
			'First motorcycle 2026'
		]);
	});

	it('never leaks another user decisions', async () => {
		const { user: alice } = await createUser();
		const { user: bob } = await createUser();
		const aliceRound = await createRoundFor(alice.id);
		const bobRound = await createRoundFor(bob.id);
		const [id] = await someMotorcycleIds(1);

		await recordSwipe(aliceRound.id, id, 'SUPERLIKE');
		await recordSwipe(bobRound.id, id, 'DISLIKE');

		const aliceView = await decisionsForMotorcycle(alice.id, id);
		expect(aliceView).toHaveLength(1);
		expect(aliceView[0].decision).toBe('SUPERLIKE');
	});
});

describe('completeRound', () => {
	it('refuses to complete a round with cards remaining', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		await expect(completeRound(round.id, {}, false)).rejects.toBeInstanceOf(ValidationError);
	});

	it('completes early when forced', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);

		const completed = await completeRound(round.id, {}, true);
		expect(completed.status).toBe('COMPLETED');
		expect(completed.completedAt).not.toBeNull();
	});

	it('completes without force once the deck is empty', async () => {
		const { user } = await createUser();
		const filters = { categories: ['SCOOTER'] as const };
		const round = await createRoundFor(user.id, filters);

		for (;;) {
			const deck = await getDeck(round.id, filters, { limit: 10 });
			if (deck.length === 0) break;
			for (const card of deck) await recordSwipe(round.id, card.id, 'DISLIKE');
		}

		const completed = await completeRound(round.id, filters, false);
		expect(completed.status).toBe('COMPLETED');
	});
});

describe('motorcycle deletion safety', () => {
	it('refuses to delete a motorcycle that carries swipe history', async () => {
		const { user } = await createUser();
		const round = await createRoundFor(user.id);
		const [id] = await someMotorcycleIds(1);
		await recordSwipe(round.id, id, 'LIKE');

		// onDelete: Restrict. A user shortlist must not vanish because a
		// scraper stopped listing a model.
		await expect(prisma.motorcycle.delete({ where: { id } })).rejects.toThrow();
	});
});

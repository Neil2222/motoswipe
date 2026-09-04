import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma, resetDatabase, ensureCatalogue, createUser } from './helpers';
import {
	DEMO_DECK_SIZE,
	DEMO_ROUND_NAME,
	adoptGuestInto,
	claimGuest,
	demoCandidates,
	demoRoundFor,
	discardGuest,
	purgeStaleGuests,
	startDemo
} from '../src/lib/server/services/demo.service';
import { login, register } from '../src/lib/server/services/auth.service';
import { nextDemoComparison, demoBracket } from '../src/lib/server/services/demo.service';
import { recordVote, getRanking } from '../src/lib/server/services/ranking.service';
import { createSession } from '../src/lib/server/auth/session';
import { getDeck } from '../src/lib/server/services/swipe.service';
import { ConflictError, ForbiddenError, ValidationError } from '../src/lib/server/errors';

/**
 * The demo end to end at the service level: a guest, a round over the popular
 * bikes, and the three ways out — claim, sign in to another account, discard.
 */

/**
 * The sample catalogue carries no registry data, so the fields the demo
 * selects on are set here: every sample bike becomes a modern, eligible
 * generation with a registration count, and two of them share a family.
 */
async function makeSampleCataloguePopular() {
	const bikes = await prisma.motorcycle.findMany({
		select: { id: true, model: true, manufacturerId: true },
		orderBy: { slug: 'asc' }
	});
	expect(bikes.length).toBeGreaterThan(DEMO_DECK_SIZE);

	const family = await prisma.modelFamily.create({
		data: {
			manufacturerId: bikes[0].manufacturerId,
			name: 'Test family',
			slug: `test-family-${Date.now()}`,
			familyKey: `test-family-${Date.now()}`
		}
	});

	await Promise.all(
		bikes.map((bike, i) =>
			prisma.motorcycle.update({
				where: { id: bike.id },
				data: {
					isActive: true,
					discoveryEligible: true,
					ineligibleReasons: [],
					registrationCount: 5000 - i * 10,
					generationTo: null,
					lastRegistrationYear: 2025,
					// The two most popular share a family: only one may appear.
					familyId: i < 2 ? family.id : null
				}
			})
		)
	);
	return bikes;
}

beforeAll(async () => {
	await resetDatabase();
	await ensureCatalogue();
});

beforeEach(async () => {
	await resetDatabase();
});

describe('demo deck', () => {
	it('is chosen from eligible, modern, registered generations only', async () => {
		await makeSampleCataloguePopular();
		const [first] = await prisma.motorcycle.findMany({ orderBy: { slug: 'asc' }, take: 1 });
		await prisma.motorcycle.update({
			where: { id: first.id },
			data: { discoveryEligible: false, ineligibleReasons: ['no-image'] }
		});

		const candidates = await demoCandidates();
		expect(candidates.map((c) => c.id)).not.toContain(first.id);
		expect(candidates[0].registrationCount).toBeGreaterThanOrEqual(
			candidates.at(-1)!.registrationCount!
		);
	});
});

describe('startDemo', () => {
	it('creates a guest with one hand-picked round of the most popular bikes', async () => {
		const bikes = await makeSampleCataloguePopular();
		const { user, roundId } = await startDemo('10.0.0.1');

		expect(user.isGuest).toBe(true);
		expect(user.email).toMatch(/@guest\.invalid$/);

		const round = await prisma.discoveryRound.findUniqueOrThrow({ where: { id: roundId } });
		expect(round.userId).toBe(user.id);
		expect(round.name).toBe(DEMO_ROUND_NAME);

		const ids = (round.filters as { motorcycleIds: string[] }).motorcycleIds;
		expect(ids).toHaveLength(DEMO_DECK_SIZE);
		// The most popular bike is in; its family-mate (second most popular) is not.
		expect(ids).toContain(bikes[0].id);
		expect(ids).not.toContain(bikes[1].id);

		// And the deck actually serves those cards.
		const deck = await getDeck(round.id, round.filters, { limit: 30 });
		expect(deck).toHaveLength(DEMO_DECK_SIZE);
		expect(new Set(deck.map((c) => c.id))).toEqual(new Set(ids));
	});

	it('refuses when the catalogue has no popular eligible bikes', async () => {
		await prisma.motorcycle.updateMany({ data: { discoveryEligible: false } });
		await expect(startDemo('10.0.0.2')).rejects.toBeInstanceOf(ValidationError);
		expect(await prisma.user.count({ where: { isGuest: true } })).toBe(0);
	});

	it('a guest cannot sign in with a password', async () => {
		await makeSampleCataloguePopular();
		const { user } = await startDemo('10.0.0.3');
		await expect(
			login({ identifier: user.username, password: 'anything-at-all-really' }, '10.0.0.3')
		).rejects.toBeInstanceOf(ValidationError);
	});

	it('demoRoundFor finds the round for a guest and nothing for a real user', async () => {
		await makeSampleCataloguePopular();
		const { user, roundId } = await startDemo('10.0.0.4');
		expect(await demoRoundFor(user.id)).toEqual({ id: roundId });

		const { user: real } = await createUser();
		expect(await demoRoundFor(real.id)).toBeNull();
	});
});

describe('claimGuest', () => {
	const CLAIM = {
		email: 'kept@example.test',
		username: 'kept',
		displayName: 'Kept',
		password: 'correct-horse-battery-staple'
	};

	it('turns the guest into a real account and keeps the round', async () => {
		await makeSampleCataloguePopular();
		const { user: guest, roundId } = await startDemo('10.0.1.1');
		await prisma.swipe.create({
			data: {
				roundId,
				motorcycleId: (await prisma.motorcycle.findFirstOrThrow()).id,
				decision: 'LIKE'
			}
		});

		const user = await claimGuest(guest.id, CLAIM, '10.0.1.1');
		expect(user.id).toBe(guest.id);
		expect(user.isGuest).toBe(false);
		expect(user.email).toBe(CLAIM.email);

		const row = await prisma.user.findUniqueOrThrow({ where: { id: guest.id } });
		expect(row.isGuest).toBe(false);
		expect(row.username).toBe('kept');
		expect(await prisma.swipe.count({ where: { roundId } })).toBe(1);
		expect(await demoRoundFor(guest.id)).toBeNull();

		// And the chosen password works from now on.
		const signedIn = await login({ identifier: 'kept', password: CLAIM.password }, '10.0.1.1');
		expect(signedIn.id).toBe(guest.id);
	});

	it('the first real account is admin, even after guests came first', async () => {
		await makeSampleCataloguePopular();
		const { user: guest } = await startDemo('10.0.1.2');
		const user = await claimGuest(guest.id, CLAIM, '10.0.1.2');
		expect(user.role).toBe('ADMIN');

		const { user: other } = await startDemo('10.0.1.3');
		const second = await claimGuest(
			other.id,
			{ ...CLAIM, email: 'second@example.test', username: 'second' },
			'10.0.1.3'
		);
		expect(second.role).toBe('USER');
	});

	it('rejects an email or username another account holds', async () => {
		await makeSampleCataloguePopular();
		await createUser({ email: CLAIM.email });
		const { user: guest } = await startDemo('10.0.1.4');
		await expect(claimGuest(guest.id, CLAIM, '10.0.1.4')).rejects.toBeInstanceOf(ConflictError);
		const row = await prisma.user.findUniqueOrThrow({ where: { id: guest.id } });
		expect(row.isGuest).toBe(true);
	});

	it('refuses to "claim" a real account', async () => {
		const { user } = await createUser();
		await expect(claimGuest(user.id, CLAIM, '10.0.1.5')).rejects.toBeInstanceOf(ForbiddenError);
	});
});

describe('adoptGuestInto', () => {
	it('moves the demo round to the signed-in account and deletes the guest', async () => {
		await makeSampleCataloguePopular();
		const { user: guest, roundId } = await startDemo('10.0.2.1');
		await createSession(guest.id, null);
		const { user: real } = await createUser();

		expect(await adoptGuestInto(guest.id, real.id)).toBe(1);

		const round = await prisma.discoveryRound.findUniqueOrThrow({ where: { id: roundId } });
		expect(round.userId).toBe(real.id);
		expect(await prisma.user.findUnique({ where: { id: guest.id } })).toBeNull();
		expect(await prisma.authSession.count({ where: { userId: guest.id } })).toBe(0);
	});

	it('does nothing for a non-guest source', async () => {
		const { user: a } = await createUser();
		const { user: b } = await createUser();
		expect(await adoptGuestInto(a.id, b.id)).toBe(0);
		expect(await prisma.user.findUnique({ where: { id: a.id } })).not.toBeNull();
	});
});

describe('discardGuest', () => {
	it('deletes the guest and its round, and refuses on a real account', async () => {
		await makeSampleCataloguePopular();
		const { user: guest, roundId } = await startDemo('10.0.3.1');
		expect(await discardGuest(guest.id)).toBe(true);
		expect(await prisma.discoveryRound.findUnique({ where: { id: roundId } })).toBeNull();

		const { user } = await createUser();
		expect(await discardGuest(user.id)).toBe(false);
		expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
	});
});

describe('purgeStaleGuests', () => {
	it('removes only old guests without a session', async () => {
		await makeSampleCataloguePopular();
		const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

		const { user: abandoned } = await startDemo('10.0.4.1');
		await prisma.user.update({ where: { id: abandoned.id }, data: { createdAt: old } });

		const { user: active } = await startDemo('10.0.4.2');
		await prisma.user.update({ where: { id: active.id }, data: { createdAt: old } });
		await createSession(active.id, null);

		const { user: fresh } = await startDemo('10.0.4.3');

		const realOld = await register(
			{ email: 'r@example.test', username: 'realold', displayName: 'R', password: 'x'.repeat(12) },
			'10.0.4.4'
		);
		await prisma.user.update({ where: { id: realOld.id }, data: { createdAt: old } });

		expect(await purgeStaleGuests()).toBe(1);
		const remaining = new Set(
			(await prisma.user.findMany({ select: { id: true } })).map((u) => u.id)
		);
		expect(remaining.has(abandoned.id)).toBe(false);
		expect(remaining.has(active.id)).toBe(true);
		expect(remaining.has(fresh.id)).toBe(true);
		expect(remaining.has(realOld.id)).toBe(true);
	});
});

describe('demo knockout', () => {
	it('asks n-1 questions and leaves the winner with the highest Elo', async () => {
		await makeSampleCataloguePopular();
		const { roundId } = await startDemo('10.0.5.1');
		const round = await prisma.discoveryRound.findUniqueOrThrow({ where: { id: roundId } });
		const ids = (round.filters as { motorcycleIds: string[] }).motorcycleIds.slice(0, 5);
		for (const [i, motorcycleId] of ids.entries()) {
			await prisma.swipe.create({
				data: { roundId, motorcycleId, decision: i === 2 ? 'SUPERLIKE' : 'LIKE' }
			});
		}

		let asked = 0;
		let lastWinner: string | null = null;
		for (;;) {
			const next = await nextDemoComparison(roundId);
			if (!next) break;
			expect(next.suggested).toBe(4);
			expect(next.votes).toBe(asked);
			// The superliked bike is seeded first and always wins its matches.
			const winner = next.a.id === ids[2] || next.b.id === ids[2] ? ids[2] : next.a.id;
			await recordVote(roundId, {
				motorcycleAId: next.a.id,
				motorcycleBId: next.b.id,
				winnerMotorcycleId: winner
			});
			lastWinner = winner;
			asked++;
		}
		expect(asked).toBe(4);

		const bracket = await demoBracket(roundId);
		expect(bracket.next).toBeNull();
		expect(bracket.champion).toBe(ids[2]);
		expect(lastWinner).toBe(ids[2]);

		const ranking = await getRanking(roundId);
		expect(ranking[0].motorcycle.id).toBe(ids[2]);
		expect(ranking[0].eloScore).toBeGreaterThan(ranking[1].eloScore);
	});
});

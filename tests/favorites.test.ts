import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser, ensureCatalogue, prisma, resetDatabase, someMotorcycleIds } from './helpers';
import {
	countFavorites,
	favoriteIdsAmong,
	isFavorite,
	listFavorites,
	setFavorite,
	toggleFavorite
} from '../src/lib/server/services/favorite.service';
import { createRound } from '../src/lib/server/services/round.service';
import { countCandidates } from '../src/lib/server/services/motorcycle.service';

beforeAll(async () => {
	await resetDatabase();
	await ensureCatalogue();
});

beforeEach(async () => {
	await resetDatabase();
});

describe('toggleFavorite', () => {
	it('saves a motorcycle and takes it back off', async () => {
		const { user } = await createUser();
		const [id] = await someMotorcycleIds(1);

		expect(await toggleFavorite(user.id, id)).toEqual({ favorited: true });
		expect(await isFavorite(user.id, id)).toBe(true);

		expect(await toggleFavorite(user.id, id)).toEqual({ favorited: false });
		expect(await isFavorite(user.id, id)).toBe(false);
	});

	it('never produces two rows for one bike', async () => {
		const { user } = await createUser();
		const [id] = await someMotorcycleIds(1);

		// Two taps landing at once — a double tap, or two tabs on the same page.
		await Promise.all([setFavorite(user.id, id, true), setFavorite(user.id, id, true)]);

		expect(await countFavorites(user.id)).toBe(1);
	});
});

describe('setFavorite', () => {
	it('is idempotent in both directions', async () => {
		const { user } = await createUser();
		const [id] = await someMotorcycleIds(1);

		await setFavorite(user.id, id, true);
		await setFavorite(user.id, id, true);
		expect(await countFavorites(user.id)).toBe(1);

		await setFavorite(user.id, id, false);
		await setFavorite(user.id, id, false);
		expect(await countFavorites(user.id)).toBe(0);
	});
});

describe('listFavorites', () => {
	it("returns one user's garage and never another's", async () => {
		const { user: mine } = await createUser();
		const { user: theirs } = await createUser();
		const [a, b] = await someMotorcycleIds(2);

		await setFavorite(mine.id, a, true);
		await setFavorite(theirs.id, b, true);

		const saved = await listFavorites(mine.id);
		expect(saved).toHaveLength(1);
		expect(saved[0].bike.id).toBe(a);
		expect(await listFavorites(theirs.id)).toHaveLength(1);
	});

	it('lists the most recently saved first', async () => {
		const { user } = await createUser();
		const [a, b, c] = await someMotorcycleIds(3);

		for (const id of [a, b, c]) {
			await setFavorite(user.id, id, true);
			// Distinct timestamps; the column has millisecond resolution.
			await new Promise((resolve) => setTimeout(resolve, 5));
		}

		expect((await listFavorites(user.id)).map((entry) => entry.bike.id)).toEqual([c, b, a]);
	});

	it('carries the fields a card needs', async () => {
		const { user } = await createUser();
		const [id] = await someMotorcycleIds(1);
		await setFavorite(user.id, id, true);

		const [entry] = await listFavorites(user.id);
		expect(entry.bike.manufacturer.name).toBeTruthy();
		expect(entry.bike).toHaveProperty('images');
		expect(entry.savedAt).toBeInstanceOf(Date);
	});
});

describe('favoriteIdsAmong', () => {
	it('marks only the saved ones, in a single query', async () => {
		const { user } = await createUser();
		const ids = await someMotorcycleIds(4);
		await setFavorite(user.id, ids[1], true);
		await setFavorite(user.id, ids[3], true);

		const marked = await favoriteIdsAmong(user.id, ids);
		expect([...marked].sort()).toEqual([ids[1], ids[3]].sort());
	});

	it('handles an empty page without touching the database', async () => {
		const { user } = await createUser();
		expect(await favoriteIdsAmong(user.id, [])).toEqual(new Set());
	});
});

describe('a garage becomes a round', () => {
	it('builds a deck of exactly the saved motorcycles', async () => {
		const { user } = await createUser();
		const ids = await someMotorcycleIds(3);
		for (const id of ids) await setFavorite(user.id, id, true);

		const round = await createRound(user.id, {
			name: 'From my garage',
			visibility: 'PRIVATE',
			filters: { motorcycleIds: ids }
		});

		expect(await countCandidates(round.filters)).toBe(3);
	});
});

describe('a saved motorcycle survives the catalogue', () => {
	it('cannot be deleted out from under the user', async () => {
		const { user } = await createUser();
		const [id] = await someMotorcycleIds(1);
		await setFavorite(user.id, id, true);

		// Restrict, like every other reference: a retired import must not take
		// somebody's saved bike with it.
		await expect(prisma.motorcycle.delete({ where: { id } })).rejects.toThrow();
	});

	it('goes away with the user, though', async () => {
		const { user } = await createUser();
		const [id] = await someMotorcycleIds(1);
		await setFavorite(user.id, id, true);

		await prisma.user.delete({ where: { id: user.id } });
		expect(await prisma.favorite.count({ where: { userId: user.id } })).toBe(0);
	});
});

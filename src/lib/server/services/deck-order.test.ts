import { describe, expect, it } from 'vitest';
import { deckSortKey, fnv1a, nextFromDeck, orderDeck } from './deck-order';

/**
 * Deck ordering is what makes "close the tab, come back next week" work. These
 * tests pin the two properties that matter: the order is stable for a round,
 * and it differs between rounds.
 */

const ids = Array.from({ length: 40 }, (_, i) => `bike-${String(i).padStart(3, '0')}`);
const ROUND_A = '11111111-1111-4111-8111-111111111111';
const ROUND_B = '22222222-2222-4222-8222-222222222222';

describe('fnv1a', () => {
	it('is deterministic', () => {
		expect(fnv1a('kawasaki-z900')).toBe(fnv1a('kawasaki-z900'));
	});

	it('separates similar inputs', () => {
		expect(fnv1a('bike-001')).not.toBe(fnv1a('bike-002'));
	});

	it('stays inside the unsigned 32-bit range', () => {
		for (const id of ids) {
			const h = fnv1a(id);
			expect(h).toBeGreaterThanOrEqual(0);
			expect(h).toBeLessThanOrEqual(0xffffffff);
			expect(Number.isInteger(h)).toBe(true);
		}
	});
});

describe('deckSortKey', () => {
	it('depends on both the round and the motorcycle', () => {
		expect(deckSortKey(ROUND_A, 'x')).not.toBe(deckSortKey(ROUND_B, 'x'));
		expect(deckSortKey(ROUND_A, 'x')).not.toBe(deckSortKey(ROUND_A, 'y'));
	});
});

describe('orderDeck', () => {
	it('is stable across calls — the whole point of resume', () => {
		expect(orderDeck(ROUND_A, ids)).toEqual(orderDeck(ROUND_A, ids));
	});

	it('does not depend on the order the database returned rows in', () => {
		const shuffled = [...ids].reverse();
		expect(orderDeck(ROUND_A, shuffled)).toEqual(orderDeck(ROUND_A, ids));
	});

	it('does not mutate its input', () => {
		const input = [...ids];
		orderDeck(ROUND_A, input);
		expect(input).toEqual(ids);
	});

	it('keeps every id exactly once', () => {
		const ordered = orderDeck(ROUND_A, ids);
		expect(ordered).toHaveLength(ids.length);
		expect(new Set(ordered).size).toBe(ids.length);
	});

	it('gives two rounds different sequences over the same catalogue', () => {
		expect(orderDeck(ROUND_A, ids)).not.toEqual(orderDeck(ROUND_B, ids));
	});

	it('does not simply return them alphabetically', () => {
		// If it did, the deck would be every Aprilia followed by every BMW.
		expect(orderDeck(ROUND_A, ids)).not.toEqual([...ids].sort());
	});

	it('keeps existing positions when the catalogue grows', () => {
		const before = orderDeck(ROUND_A, ids);
		const after = orderDeck(ROUND_A, [...ids, 'bike-999', 'bike-998']);
		// The relative order of the original ids is unchanged; new ones slot in.
		const filtered = after.filter((id) => ids.includes(id));
		expect(filtered).toEqual(before);
	});
});

describe('nextFromDeck', () => {
	it('returns the first unswiped ids in deck order', () => {
		const ordered = orderDeck(ROUND_A, ids);
		const next = nextFromDeck(ROUND_A, ids, new Set(), 5);
		expect(next).toEqual(ordered.slice(0, 5));
	});

	it('skips everything already swiped', () => {
		const ordered = orderDeck(ROUND_A, ids);
		const swiped = new Set(ordered.slice(0, 10));
		const next = nextFromDeck(ROUND_A, ids, swiped, 5);
		expect(next).toEqual(ordered.slice(10, 15));
		expect(next.some((id) => swiped.has(id))).toBe(false);
	});

	it('resumes exactly where it stopped, whatever order the swipes happened in', () => {
		const ordered = orderDeck(ROUND_A, ids);
		// Swipes recorded out of order, as an undo or a shortlist edit would do.
		const swiped = new Set([ordered[3], ordered[0], ordered[7], ordered[1], ordered[2]]);
		const next = nextFromDeck(ROUND_A, ids, swiped, 3);
		expect(next).toEqual([ordered[4], ordered[5], ordered[6]]);
	});

	it('honours the exclude set for cards already on screen', () => {
		const ordered = orderDeck(ROUND_A, ids);
		const exclude = new Set([ordered[0], ordered[1]]);
		const next = nextFromDeck(ROUND_A, ids, new Set(), 3, exclude);
		expect(next).toEqual([ordered[2], ordered[3], ordered[4]]);
	});

	it('returns an empty array once every motorcycle is swiped', () => {
		expect(nextFromDeck(ROUND_A, ids, new Set(ids), 5)).toEqual([]);
	});

	it('returns fewer than the limit rather than padding', () => {
		const swiped = new Set(ids.slice(0, ids.length - 2));
		expect(nextFromDeck(ROUND_A, ids, swiped, 10)).toHaveLength(2);
	});

	it('never returns a duplicate', () => {
		const next = nextFromDeck(ROUND_A, ids, new Set(), 40);
		expect(new Set(next).size).toBe(next.length);
	});
});

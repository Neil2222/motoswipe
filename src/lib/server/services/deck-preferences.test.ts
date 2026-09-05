import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	deckPreferences,
	personalizedDeck,
	type DeckCandidate,
	type PreferenceSwipe
} from './deck-preferences';
import { orderDeck } from './deck-order';

const bikes: DeckCandidate[] = Array.from({ length: 10 }, (_, i) => ({
	id: createHash('sha256').update(`motorcycle-${i}`).digest('hex'),
	category: i < 5 ? 'NAKED' : 'CRUISER',
	manufacturerId: 'same-brand'
}));
const choices: PreferenceSwipe[] = [
	{ motorcycle: bikes[5], decision: 'DISLIKE' },
	{ motorcycle: bikes[0], decision: 'LIKE' }
];
const excluded = new Set([bikes[0].id, bikes[5].id]);

describe('adaptive discovery', () => {
	it('starts with the existing shuffle and treats skips as neutral', () => {
		const expected = orderDeck(
			'round',
			bikes.map((bike) => bike.id)
		);
		expect(personalizedDeck('round', bikes, [], new Set(), 10)).toEqual(expected);
		expect(
			personalizedDeck('round', bikes, [{ motorcycle: bikes[0], decision: 'SKIP' }], new Set(), 10)
		).toEqual(expected);
	});

	it('makes a naked more likely after liking a naked and rejecting a cruiser', () => {
		let neutralNaked = 0;
		let learnedNaked = 0;
		const nakedIds = new Set(bikes.slice(0, 5).map((bike) => bike.id));
		// Fixed seeds make this a repeatable probability check, not a flaky test.
		for (let i = 0; i < 2000; i++) {
			const round = createHash('sha256').update(`round-${i}`).digest('hex');
			neutralNaked += Number(nakedIds.has(personalizedDeck(round, bikes, [], excluded, 1)[0]));
			learnedNaked += Number(nakedIds.has(personalizedDeck(round, bikes, choices, excluded, 1)[0]));
		}
		expect(neutralNaked / 2000).toBeGreaterThan(0.4);
		expect(neutralNaked / 2000).toBeLessThan(0.6);
		expect(learnedNaked - neutralNaked).toBeGreaterThan(200);
		// There must still be opportunities to discover a cruiser.
		expect(learnedNaked / 2000).toBeLessThan(0.85);
	});

	it('gives a superlike more influence and a category more influence than a brand', () => {
		const liked = deckPreferences([{ motorcycle: bikes[0], decision: 'LIKE' }]);
		const superliked = deckPreferences([{ motorcycle: bikes[0], decision: 'SUPERLIKE' }]);
		expect(superliked(bikes[1])).toBeGreaterThan(liked(bikes[1]));
		expect(liked({ ...bikes[1], manufacturerId: 'another-brand' })).toBeGreaterThan(
			liked(bikes[6])
		);
	});

	it('does not turn unclassified motorcycles into a preferred category', () => {
		const weight = deckPreferences([
			{ motorcycle: { category: 'OTHER', manufacturerId: 'a' }, decision: 'LIKE' }
		]);
		expect(weight({ id: 'unknown', category: 'OTHER', manufacturerId: 'b' })).toBe(1);
	});

	it('keeps every remaining candidate available, even after repeated dislikes', () => {
		const dislikes = Array.from({ length: 100 }, (): PreferenceSwipe => ({
			motorcycle: bikes[5],
			decision: 'DISLIKE'
		}));
		const weight = deckPreferences(dislikes);
		expect(weight(bikes[6])).toBeGreaterThan(0.25);
		const result = personalizedDeck('round', bikes, dislikes, excluded, 30);
		expect(new Set(result)).toEqual(
			new Set(bikes.filter((bike) => !excluded.has(bike.id)).map((bike) => bike.id))
		);
	});

	it('is stable for the same decisions and never repeats held or swiped cards', () => {
		const held = new Set([...excluded, bikes[2].id]);
		const result = personalizedDeck('round', bikes, choices, held, 4);
		expect(
			personalizedDeck('round', [...bikes].reverse(), [...choices].reverse(), held, 4)
		).toEqual(result);
		expect(result).toHaveLength(4);
		expect(new Set(result).size).toBe(4);
		expect(result.some((id) => held.has(id))).toBe(false);
	});

	it('handles an exhausted pool and invalid limits', () => {
		expect(personalizedDeck('round', [], choices, new Set(), 4)).toEqual([]);
		for (const limit of [0, -1, NaN, Infinity]) {
			expect(personalizedDeck('round', bikes, choices, excluded, limit)).toEqual([]);
		}
	});
});

import { describe, expect, it } from 'vitest';
import { pickDemoDeck, type DemoCandidate } from './demo.service';

function candidate(
	id: string,
	regs: number,
	overrides: Partial<DemoCandidate> = {}
): DemoCandidate {
	return {
		id,
		familyId: `family-${id}`,
		registrationCount: regs,
		manufacturerName: 'Honda',
		model: `Model ${id}`,
		...overrides
	};
}

describe('pickDemoDeck', () => {
	it('takes the first N candidates in the order given', () => {
		const candidates = Array.from({ length: 30 }, (_, i) => candidate(`b${i}`, 1000 - i));
		const deck = pickDemoDeck(candidates, 20);
		expect(deck).toHaveLength(20);
		expect(deck.map((c) => c.id)).toEqual(candidates.slice(0, 20).map((c) => c.id));
	});

	it('keeps one generation per model family, the first (most registered) one', () => {
		const candidates = [
			candidate('mt07-2021', 2700, { familyId: 'mt07', model: 'MT-07' }),
			candidate('mt07-2018', 2500, { familyId: 'mt07', model: 'MT-07' }),
			candidate('z650', 2400, { familyId: 'z650', model: 'Z650' }),
			candidate('mt07-2025', 900, { familyId: 'mt07', model: 'MT-07' })
		];
		const deck = pickDemoDeck(candidates, 20);
		expect(deck.map((c) => c.id)).toEqual(['mt07-2021', 'z650']);
	});

	it('treats generations without a family as distinct', () => {
		const candidates = [
			candidate('a', 10, { familyId: null }),
			candidate('b', 9, { familyId: null }),
			candidate('c', 8, { familyId: null })
		];
		expect(pickDemoDeck(candidates, 20)).toHaveLength(3);
	});

	it('guarantees the Kawasaki Z900 a place when it is a candidate', () => {
		const candidates = Array.from({ length: 25 }, (_, i) => candidate(`b${i}`, 1000 - i));
		candidates.push(
			candidate('z900', 1, { manufacturerName: 'Kawasaki', model: 'Z900', familyId: 'z900' })
		);
		const deck = pickDemoDeck(candidates, 20);
		expect(deck).toHaveLength(20);
		expect(deck.at(-1)?.id).toBe('z900');
		// The 20th ordinary candidate gave up its seat.
		expect(deck.map((c) => c.id)).not.toContain('b19');
	});

	it('matches "Z 900" with a space and ignores case, but not the Z900RS', () => {
		const candidates = [
			candidate('rs', 5000, { manufacturerName: 'Kawasaki', model: 'Z900RS', familyId: 'rs' }),
			candidate('z', 1, { manufacturerName: 'Kawasaki', model: 'z 900', familyId: 'z' })
		];
		const deck = pickDemoDeck(candidates, 1);
		expect(deck.map((c) => c.id)).toEqual(['z']);
	});

	it('does not add a Z900 that is not among the eligible candidates', () => {
		const candidates = Array.from({ length: 25 }, (_, i) => candidate(`b${i}`, 1000 - i));
		const deck = pickDemoDeck(candidates, 20);
		expect(deck.some((c) => /z900/i.test(c.model))).toBe(false);
		expect(deck).toHaveLength(20);
	});

	it('does not duplicate a Z900 that already made the cut', () => {
		const candidates = [
			candidate('z900', 3000, { manufacturerName: 'Kawasaki', model: 'Z900', familyId: 'z900' }),
			candidate('b', 100)
		];
		expect(pickDemoDeck(candidates, 20).map((c) => c.id)).toEqual(['z900', 'b']);
	});
});

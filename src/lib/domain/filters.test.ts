import { describe, expect, it } from 'vitest';
import { RoundFiltersSchema, describeFilters, isUnfiltered, normalizeFilters } from './filters';

describe('RoundFiltersSchema', () => {
	it('accepts an empty object — "show me everything"', () => {
		const parsed = RoundFiltersSchema.parse({});
		expect(parsed).toEqual({});
		expect(isUnfiltered(parsed)).toBe(true);
	});

	it('coerces the strings an HTML form actually submits', () => {
		const parsed = RoundFiltersSchema.parse({
			displacementMin: '500',
			powerHpMax: '120.5',
			yearMin: '2020'
		});
		expect(parsed.displacementMin).toBe(500);
		expect(parsed.powerHpMax).toBe(120.5);
		expect(parsed.yearMin).toBe(2020);
	});

	it('treats a cleared input as absent, not as zero', () => {
		// This is the difference between "no minimum" and "minimum of 0".
		const parsed = RoundFiltersSchema.parse({ displacementMin: '', priceMax: '' });
		expect(parsed.displacementMin).toBeUndefined();
		expect(parsed.priceMax).toBeUndefined();
	});

	it('rejects out-of-range numbers', () => {
		expect(RoundFiltersSchema.safeParse({ displacementMin: '99999' }).success).toBe(false);
		expect(RoundFiltersSchema.safeParse({ yearMin: '1200' }).success).toBe(false);
	});

	it('rejects an unknown category rather than silently dropping it', () => {
		expect(RoundFiltersSchema.safeParse({ categories: ['SPACESHIP'] }).success).toBe(false);
	});

	it('rejects a non-uuid manufacturer id', () => {
		expect(RoundFiltersSchema.safeParse({ manufacturerIds: ['kawasaki'] }).success).toBe(false);
	});

	it('strips unknown keys instead of failing', () => {
		const parsed = RoundFiltersSchema.parse({ nonsense: true, displacementMin: '600' });
		expect(parsed).not.toHaveProperty('nonsense');
		expect(parsed.displacementMin).toBe(600);
	});

	it('uppercases a currency code', () => {
		expect(RoundFiltersSchema.parse({ priceCurrency: 'eur' }).priceCurrency).toBe('EUR');
	});
});

describe('normalizeFilters', () => {
	it('swaps an inverted range rather than returning nothing', () => {
		const f = normalizeFilters({ displacementMin: 1200, displacementMax: 600 });
		expect(f.displacementMin).toBe(600);
		expect(f.displacementMax).toBe(1200);
	});

	it('swaps inverted price, power and year ranges too', () => {
		const f = normalizeFilters({
			priceMin: 20000,
			priceMax: 5000,
			powerHpMin: 200,
			powerHpMax: 50,
			yearMin: 2026,
			yearMax: 2018
		});
		expect(f.priceMin).toBe(5000);
		expect(f.powerHpMin).toBe(50);
		expect(f.yearMin).toBe(2018);
	});

	it('drops empty arrays', () => {
		const f = normalizeFilters({ categories: [], manufacturerIds: [] });
		expect(f).toEqual({});
	});

	it('drops a currency with no price bound attached', () => {
		expect(normalizeFilters({ priceCurrency: 'EUR' })).toEqual({});
	});

	it('keeps a currency that qualifies a price bound', () => {
		const f = normalizeFilters({ priceCurrency: 'EUR', priceMax: 10000 });
		expect(f.priceCurrency).toBe('EUR');
	});

	it('drops condition BOTH, which filters nothing', () => {
		expect(normalizeFilters({ condition: 'BOTH' })).toEqual({});
	});

	it('drops passengerRequired when false', () => {
		expect(normalizeFilters({ passengerRequired: false })).toEqual({});
	});

	it('keeps passengerRequired when true', () => {
		expect(normalizeFilters({ passengerRequired: true }).passengerRequired).toBe(true);
	});

	it('is idempotent', () => {
		const once = normalizeFilters({ displacementMin: 900, categories: ['NAKED'] });
		expect(normalizeFilters(once)).toEqual(once);
	});

	it('does not mutate its input', () => {
		const input = { displacementMin: 1200, displacementMax: 600 };
		normalizeFilters(input);
		expect(input).toEqual({ displacementMin: 1200, displacementMax: 600 });
	});
});

describe('isUnfiltered', () => {
	it('is true for an object that normalises away to nothing', () => {
		expect(isUnfiltered({ categories: [], condition: 'BOTH', priceCurrency: 'EUR' })).toBe(true);
	});

	it('is false once a real constraint is present', () => {
		expect(isUnfiltered({ displacementMin: 600 })).toBe(false);
	});
});

describe('describeFilters', () => {
	it('returns nothing for an unfiltered round', () => {
		expect(describeFilters({})).toEqual([]);
	});

	it('describes a two-sided range as a range', () => {
		expect(describeFilters({ displacementMin: 600, displacementMax: 900 })).toContain('600–900 cc');
	});

	it('describes one-sided bounds distinctly', () => {
		expect(describeFilters({ displacementMin: 600 })).toContain('600+ cc');
		expect(describeFilters({ displacementMax: 900 })).toContain('max 900 cc');
	});

	it('names a few categories but counts many', () => {
		expect(describeFilters({ categories: ['NAKED', 'BOBBER'] })).toContain('Naked, Bobber');
		expect(
			describeFilters({ categories: ['NAKED', 'BOBBER', 'SPORT', 'CRUISER', 'TOURING'] })
		).toContain('5 categories');
	});

	it('resolves manufacturer names when given the lookup', () => {
		const id = '11111111-1111-4111-8111-111111111111';
		const names = new Map([[id, 'Kawasaki']]);
		expect(describeFilters({ manufacturerIds: [id] }, names)).toContain('Kawasaki');
	});

	it('falls back to a count when names are unavailable', () => {
		const id = '11111111-1111-4111-8111-111111111111';
		expect(describeFilters({ manufacturerIds: [id] })).toContain('1 manufacturer');
	});

	it('mentions a seat-height cap so an opt-in filter is visible', () => {
		expect(describeFilters({ seatHeightMaxMm: 800 }).join(' ')).toContain('800');
	});
});

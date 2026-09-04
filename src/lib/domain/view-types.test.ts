import { describe, expect, it } from 'vitest';
import { describeYears } from './view-types';

/**
 * A round filtered to "2015 and newer" showed a Yamaha YBR125 labelled 2005.
 * Both facts were true — the model dates from 2005 and examples were registered
 * new well after 2015 — but the card said the wrong one.
 */
describe('describeYears', () => {
	const bike = (
		modelYear: number | null,
		firstRegistrationYear: number | null,
		lastRegistrationYear: number | null
	) => ({ modelYear, firstRegistrationYear, lastRegistrationYear });

	it('shows the period a bike was actually sold', () => {
		expect(describeYears(bike(2005, 2005, 2014), 2026)).toBe('2005–2014');
	});

	it('leaves the period open while the bike is still being registered', () => {
		expect(describeYears(bike(2005, 2005, 2026), 2026)).toBe('2005–');
		expect(describeYears(bike(2005, 2005, 2025), 2026)).toBe('2005–');
	});

	it('collapses a single year', () => {
		expect(describeYears(bike(2019, 2019, 2019), 2026)).toBe('2019');
	});

	it('falls back to the model year when the registry knows nothing', () => {
		expect(describeYears(bike(1969, null, null), 2026)).toBe('1969');
		expect(describeYears(bike(null, null, null), 2026)).toBeNull();
	});
});

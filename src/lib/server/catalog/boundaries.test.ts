import { describe, expect, it } from 'vitest';
import { detectBoundaries, spanLabel, toSpans, type YearObservation } from './boundaries';

/**
 * Every table below is real Dutch registration data, pulled per year for the
 * study that produced these rules. The cases that must *not* produce a boundary
 * matter more than the ones that must.
 */

const y = (
	year: number,
	registrationCount: number,
	medianDisplacementCc?: number,
	maxPowerKw?: number
): YearObservation => ({ year, registrationCount, medianDisplacementCc, maxPowerKw });

describe('detectBoundaries — what the registry can see', () => {
	it('finds a new engine', () => {
		// Yamaha MT-09, 847 cc through 2020 and 890 cc from 2021. A real generation.
		const boundaries = detectBoundaries([
			y(2019, 341, 847, 85),
			y(2020, 249, 847, 84.6),
			y(2021, 341, 890, 87.5),
			y(2022, 249, 890, 87.5)
		]);

		expect(boundaries).toHaveLength(1);
		expect(boundaries[0].year).toBe(2021);
		expect(boundaries[0].reason).toContain('847');
	});

	it('finds a material change in rated power', () => {
		// Triumph Street Triple 765, 90.5 kW to 95.6 kW for 2023.
		const boundaries = detectBoundaries([
			y(2021, 62, 765, 90.5),
			y(2022, 96, 765, 90.5),
			y(2023, 70, 765, 95.6),
			y(2024, 87, 765, 95.6)
		]);

		expect(boundaries.map((b) => b.year)).toEqual([2023]);
	});
});

describe('detectBoundaries — what it must refuse to see', () => {
	it('finds nothing in a restyle', () => {
		// Kawasaki Z900: restyled in 2020 and again in 2025, and the registry
		// records three kilograms across nine years. This is the case the whole
		// design turns on — an invisible change must stay invisible.
		const boundaries = detectBoundaries([
			y(2017, 614, 948, 92.2),
			y(2018, 687, 948, 92.2),
			y(2019, 607, 948, 92.2),
			y(2020, 745, 948, 92.2),
			y(2024, 708, 948, 92.2),
			y(2025, 784, 948, 91),
			y(2026, 532, 948, 91)
		]);

		expect(boundaries).toEqual([]);
	});

	it('ignores a year with too few registrations to mean anything', () => {
		// The MT-09's "268 kg" years had 23 to 38 registrations. One unusual
		// vehicle moves a median that small.
		const boundaries = detectBoundaries([
			y(2017, 214, 847, 85),
			y(2018, 38, 1200, 130),
			y(2019, 23, 1200, 130),
			y(2020, 27, 847, 84.6)
		]);

		expect(boundaries).toEqual([]);
	});

	it('ignores the drift between emissions standards', () => {
		// 92.2 → 91 kW is 1.3%: a homologation change, not a new motorcycle.
		expect(detectBoundaries([y(2024, 700, 948, 92.2), y(2025, 780, 948, 91)])).toEqual([]);
	});

	it('says nothing when it knows nothing', () => {
		expect(detectBoundaries([])).toEqual([]);
		expect(detectBoundaries([y(2020, 500), y(2021, 500)])).toEqual([]);
	});
});

describe('toSpans', () => {
	it('gives one span when no boundary was found', () => {
		const observations = [y(2017, 600, 948), y(2020, 700, 948), y(2026, 500, 948)];
		expect(toSpans(observations, [])).toEqual([{ from: 2017, to: 2026, reason: undefined }]);
	});

	it('splits at each boundary', () => {
		const observations = [y(2019, 300, 847), y(2020, 300, 847), y(2021, 300, 890)];
		const spans = toSpans(observations, detectBoundaries(observations));

		expect(spans).toHaveLength(2);
		expect(spans[0]).toMatchObject({ from: 2019, to: 2020 });
		expect(spans[1]).toMatchObject({ from: 2021, to: 2021 });
		expect(spans[1].reason).toContain('capacity');
	});
});

describe('spanLabel', () => {
	it('leaves a current generation open-ended', () => {
		expect(spanLabel(2021, 2026, 2026)).toBe('2021–');
		expect(spanLabel(2017, 2019, 2026)).toBe('2017–2019');
		expect(spanLabel(2024, 2024, 2026)).toBe('2024');
	});
});

import { describe, expect, it } from 'vitest';
import type { YearObservation } from './boundaries';
import {
	CURATED_GENERATIONS,
	findCuratedGenerations,
	planGenerations,
	type CuratedFamilyGenerations
} from './generations';

const y = (year: number, n = 500, cc?: number, kw?: number): YearObservation => ({
	year,
	registrationCount: n,
	medianDisplacementCc: cc,
	maxPowerKw: kw
});

const range = (from: number, to: number, cc?: number) =>
	Array.from({ length: to - from + 1 }, (_, i) => y(from + i, 500, cc));

describe('the curated dataset itself', () => {
	it('gives every boundary a reason and every family a reference', () => {
		for (const family of CURATED_GENERATIONS) {
			expect(family.reference.length, `${family.brand} ${family.family}`).toBeGreaterThan(5);
			for (const gen of family.generations) {
				expect(gen.reason.length, `${family.family} ${gen.from}`).toBeGreaterThan(3);
			}
		}
	});

	it('lists generations in order without overlap', () => {
		for (const family of CURATED_GENERATIONS) {
			const gens = family.generations;
			for (let i = 1; i < gens.length; i++) {
				const previous = gens[i - 1];
				expect(previous.from, `${family.family} ${previous.from}`).toBeLessThan(gens[i].from);
				if (previous.to !== undefined) {
					expect(previous.to, `${family.family} ${previous.from}`).toBeLessThan(gens[i].from);
				}
			}
		}
	});

	it('names each family once', () => {
		const keys = CURATED_GENERATIONS.map((f) => `${f.brand}|${f.family.toLowerCase()}`);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('is found by the canonical name however it is spaced', () => {
		expect(findCuratedGenerations('kawasaki', 'Z900')?.generations).toHaveLength(3);
		expect(findCuratedGenerations('bmw', 'R1200GS')?.family).toBe('R 1200 GS');
		expect(findCuratedGenerations('kawasaki', 'Z900RS')).not.toBe(
			findCuratedGenerations('kawasaki', 'Z900')
		);
	});
});

describe('planGenerations — with nothing curated', () => {
	it('gives one unknown span covering every year', () => {
		expect(planGenerations({ observations: range(2017, 2026, 948) })).toEqual([
			{ from: 2017, to: 2026, source: 'UNKNOWN' }
		]);
	});

	it('splits where the registry sees an engine change', () => {
		const spans = planGenerations({
			observations: [...range(2017, 2020, 847), ...range(2021, 2026, 890)]
		});
		expect(spans.map((s) => [s.from, s.to, s.source])).toEqual([
			[2017, 2020, 'DETECTED'],
			[2021, 2026, 'DETECTED']
		]);
		expect(spans[1].reason).toContain('847');
	});

	it('falls back to the era when there are no per-year figures', () => {
		expect(planGenerations({ observations: [], era: { from: 2005, to: 2012 } })).toEqual([
			{ from: 2005, to: 2012, source: 'UNKNOWN' }
		]);
		expect(planGenerations({ observations: [] })).toEqual([]);
	});
});

describe('planGenerations — with a curated family', () => {
	const z900: CuratedFamilyGenerations = {
		brand: 'kawasaki',
		family: 'Z900',
		reference: 'test',
		generations: [
			{ from: 2017, to: 2019, reason: 'launch' },
			{ from: 2020, to: 2024, reason: 'restyle' },
			{ from: 2025, reason: 'second restyle' }
		]
	};

	it('uses the curated spans and leaves the current one open', () => {
		const spans = planGenerations({ curated: z900, observations: range(2017, 2026, 948) });
		expect(spans.map((s) => [s.from, s.to, s.source])).toEqual([
			[2017, 2019, 'CURATED'],
			[2020, 2024, 'CURATED'],
			[2025, 2026, 'CURATED']
		]);
		expect(spans[2].reason).toBe('second restyle');
		expect(spans[2].reference).toBe('test');
	});

	it('folds a year of pre-registration into the launch generation', () => {
		// The registry has a 2016 Z650 because dealers register demonstrators
		// before the model year. That is not a generation.
		const spans = planGenerations({
			curated: {
				...z900,
				generations: [
					{ from: 2017, to: 2019, reason: 'a' },
					{ from: 2020, reason: 'b' }
				]
			},
			observations: range(2016, 2026)
		});
		expect(spans[0]).toMatchObject({ from: 2016, to: 2019, source: 'CURATED' });
	});

	it('makes an unknown generation of years the curation does not cover', () => {
		// Ninja 650: the 2017 boundary is established; how 2006–2016 divides is not.
		const spans = planGenerations({
			curated: {
				...z900,
				generations: [
					{ from: 2017, to: 2019, reason: 'new frame' },
					{ from: 2020, reason: 'tft' }
				]
			},
			observations: range(2006, 2026)
		});
		expect(spans.map((s) => [s.from, s.to, s.source])).toEqual([
			[2006, 2016, 'UNKNOWN'],
			[2017, 2019, 'CURATED'],
			[2020, 2026, 'CURATED']
		]);
	});

	it('still detects an engine change inside the years it does not cover', () => {
		const spans = planGenerations({
			curated: { ...z900, generations: [{ from: 2021, reason: 'new' }] },
			observations: [
				...range(2010, 2014, 600),
				...range(2015, 2020, 700),
				...range(2021, 2026, 700)
			]
		});
		expect(spans.map((s) => [s.from, s.to, s.source])).toEqual([
			[2010, 2014, 'DETECTED'],
			[2015, 2020, 'DETECTED'],
			[2021, 2026, 'CURATED']
		]);
	});

	it('divides a curated span where the registry sees an engine change', () => {
		// "Street Triple R" is one registry spelling for a 675 and, from 2017, a
		// 765. A curated span drawn over both would blend two machines.
		const spans = planGenerations({
			curated: { ...z900, generations: [{ from: 2013, reason: 'new frame' }] },
			observations: [...range(2013, 2016, 675), ...range(2017, 2026, 765)]
		});
		expect(spans.map((s) => [s.from, s.to, s.source])).toEqual([
			[2013, 2016, 'CURATED'],
			[2017, 2026, 'DETECTED']
		]);
		expect(spans[1].reason).toContain('675');
	});

	it('ignores a straggler registered under a reused name', () => {
		// One 1999 YZF-R7 and a 2021 model that shares the name.
		const spans = planGenerations({
			observations: [y(2000, 1, 749), ...range(2021, 2026, 689)]
		});
		expect(spans).toEqual([{ from: 2021, to: 2026, source: 'UNKNOWN' }]);
	});

	it('drops a curated generation nobody has registered yet', () => {
		const spans = planGenerations({ curated: z900, observations: range(2017, 2023, 948) });
		expect(spans.map((s) => s.from)).toEqual([2017, 2020]);
	});

	it('does not invent a generation for a gap with no registrations', () => {
		// SV650: sold 1999–2012, gone until 2016.
		const spans = planGenerations({
			curated: {
				...z900,
				generations: [
					{ from: 2003, to: 2012, reason: 'fi' },
					{ from: 2016, reason: 'back' }
				]
			},
			observations: [...range(2003, 2012), ...range(2016, 2026)]
		});
		expect(spans.map((s) => [s.from, s.to])).toEqual([
			[2003, 2012],
			[2016, 2026]
		]);
	});
});

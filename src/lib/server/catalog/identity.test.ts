import { describe, expect, it } from 'vitest';
import {
	erasCompatible,
	groupByIdentity,
	identify,
	sameMotorcycle,
	stripTrimMarkers
} from './identity';

/**
 * Every pair below came out of a real import. The ones that must merge were two
 * cards for one motorcycle; the ones that must not were one card for two.
 */

const rec = (manufacturerName: string, model: string, from?: number, to?: number) => ({
	manufacturerName,
	model,
	era: from === undefined && to === undefined ? undefined : { from, to }
});

describe('stripTrimMarkers', () => {
	it('drops markers that never name a motorcycle', () => {
		expect(stripTrimMarkers('Z900 ABS')).toBe('Z900');
		expect(stripTrimMarkers('Ninja 650 ABS')).toBe('Ninja 650');
		expect(stripTrimMarkers('NC750X DCT')).toBe('NC750X');
		expect(stripTrimMarkers('MT-07 A2')).toBe('MT-07');
	});

	it('leaves letters that are part of a name', () => {
		// Substring matching here would maim all three.
		expect(stripTrimMarkers('Absolut')).toBe('Absolut');
		expect(stripTrimMarkers('CB1000R')).toBe('CB1000R');
		expect(stripTrimMarkers('Z900RS')).toBe('Z900RS');
	});

	it('never strips a name away entirely', () => {
		expect(stripTrimMarkers('ABS')).toBe('ABS');
	});
});

describe('identify — the same motorcycle under different names', () => {
	it('merges a trim marker', () => {
		expect(sameMotorcycle(rec('Kawasaki', 'Z900', 2017), rec('Kawasaki', 'Z900 ABS', 2019))).toBe(
			true
		);
		expect(sameMotorcycle(rec('Kawasaki', 'Ninja 650'), rec('Kawasaki', 'Ninja 650 ABS'))).toBe(
			true
		);
	});

	it('merges a registry type code with its marketing name', () => {
		// No string operation turns MTN690 into MT-07; the curated list knows.
		expect(sameMotorcycle(rec('Yamaha', 'MT-07', 2014), rec('Yamaha', 'MTN690', 2020))).toBe(true);
		expect(sameMotorcycle(rec('Suzuki', 'GSX-8S', 2023), rec('Suzuki', 'GSX800', 2024))).toBe(true);
		expect(sameMotorcycle(rec('Yamaha', 'Tracer 9', 2021), rec('Yamaha', 'MTT890D', 2022))).toBe(
			true
		);
		expect(sameMotorcycle(rec('Honda', 'NC750X', 2016), rec('Honda', 'NC750XD', 2021))).toBe(true);
	});

	it('merges across the brand names sources disagree about', () => {
		expect(
			sameMotorcycle(rec('BMW Motorrad', 'R 1250 GS', 2019), rec('BMW', 'R1250GS', 2021))
		).toBe(true);
	});

	it('renames to the curated canonical form', () => {
		expect(identify(rec('Yamaha', 'MTN690', 2020))?.canonicalModel).toBe('MT-07');
		expect(identify(rec('Suzuki', 'GSX800', 2024))?.canonicalModel).toBe('GSX-8S');
		expect(identify(rec('CFMOTO', 'MT800', 2023))?.canonicalModel).toBe('800MT');
	});
});

describe('identify — motorcycles that only look alike', () => {
	it('keeps a suffixed model apart from its base', () => {
		expect(sameMotorcycle(rec('Kawasaki', 'Z900', 2017), rec('Kawasaki', 'Z900RS', 2018))).toBe(
			false
		);
		expect(sameMotorcycle(rec('Honda', 'CB1000', 2024), rec('Honda', 'CB1000R', 2018))).toBe(false);
		expect(sameMotorcycle(rec('Kawasaki', 'Z650', 2017), rec('Kawasaki', 'Z650RS', 2022))).toBe(
			false
		);
	});

	it('keeps generations apart when the name was reused', () => {
		// The whole reason era exists. Both are "Kawasaki Z650".
		expect(
			sameMotorcycle(rec('Kawasaki', 'Z650', 1976, 1983), rec('Kawasaki', 'Z650', 2017, 2026))
		).toBe(false);
		expect(
			sameMotorcycle(rec('Honda', 'CB750', 1969, 2003), rec('Honda', 'CB750 Hornet', 2023))
		).toBe(false);
		expect(
			sameMotorcycle(
				rec('Triumph', 'Street Triple 675', 2007, 2016),
				rec('Triumph', 'Street Triple 765', 2017, 2026)
			)
		).toBe(false);
	});

	it('keeps different machines from the same family apart', () => {
		expect(sameMotorcycle(rec('Yamaha', 'MT-07', 2020), rec('Yamaha', 'MT-09', 2020))).toBe(false);
		expect(sameMotorcycle(rec('Yamaha', 'MT-07', 2020), rec('Yamaha', 'Tracer 7', 2020))).toBe(
			false
		);
		expect(
			sameMotorcycle(rec('Honda', 'CRF1100L Africa Twin', 2021), rec('Honda', 'CRF1000L', 2017))
		).toBe(false);
	});

	it('refuses an identity it cannot build', () => {
		expect(identify(rec('', 'Z900'))).toBeNull();
		expect(identify(rec('Kawasaki', 'ABS'))).toBeNull();
		expect(identify(rec('Kawasaki', '   '))).toBeNull();
	});
});

describe('erasCompatible', () => {
	it('accepts overlapping spans', () => {
		expect(erasCompatible({ from: 2017, to: 2026 }, { from: 2019, to: 2024 })).toBe(true);
	});

	it('accepts a registration span that lags production', () => {
		// A registry only knows when a bike was put on the road, which for a
		// model sold from 2014 can start years later.
		expect(erasCompatible({ from: 2014 }, { from: 2020, to: 2026 })).toBe(true);
	});

	it('rejects spans a generation apart', () => {
		expect(erasCompatible({ from: 1976, to: 1983 }, { from: 2017, to: 2026 })).toBe(false);
	});

	it('lets a record with no era merge with anything', () => {
		expect(erasCompatible({}, { from: 2017, to: 2026 })).toBe(true);
	});
});

describe('curated categories', () => {
	it('overrides the guesses the name classifier gets wrong', () => {
		expect(identify(rec('Kawasaki', 'Ninja 650', 2020))?.category).toBe('SPORT');
		expect(identify(rec('Honda', 'NC750XA', 2021))?.category).toBe('ADVENTURE');
		expect(identify(rec('CFMOTO', '450MT', 2024))?.category).toBe('ADVENTURE');
		expect(identify(rec('CFMOTO', '800MT', 2023))?.category).toBe('ADVENTURE');
	});

	it('says nothing when there is nothing curated', () => {
		expect(identify(rec('Kawasaki', 'ZRX1200', 2004))?.category).toBeUndefined();
	});
});

describe('identify — registry type codes', () => {
	const name = (make: string, model: string, from?: number) =>
		identify(rec(make, model, from))?.canonicalModel;

	it('reads the code off the front of the name and ignores the suffix', () => {
		expect(name('Yamaha', 'MTN890D', 2021)).toBe('MT-09');
		expect(name('Yamaha', 'MTN850-A (MT-09', 2016)).toBe('MT-09');
		expect(name('Yamaha', 'MTN690-U (MT-07)', 2018)).toBe('MT-07');
		expect(name('Yamaha', 'MTT690D-S', 2026)).toBe('Tracer 7');
		expect(name('Yamaha', 'XP560E', 2020)).toBe('TMAX');
		expect(name('Honda', 'CB1000RA', 2008)).toBe('CB1000R');
		expect(name('Honda', 'CB650RAC', 2024)).toBe('CB650R');
		expect(name('Honda', 'CMX500A', 2017)).toBe('CMX500 Rebel');
		expect(name('Suzuki', 'GSX-S750U', 2019)).toBe('GSX-S750');
		expect(name('Harley-Davidson', 'Flhxs', 2012)).toBe('Street Glide Special');
	});

	it('takes the longest code, so a suffix letter that is a model is not lost', () => {
		expect(name('Honda', 'CB1000SP', 2025)).toBe('CB1000 Hornet');
		expect(name('Honda', 'CB1000RA', 2018)).toBe('CB1000R');
		expect(name('Suzuki', 'GSX-S1000T', 2022)).toBe('GSX-S1000GT');
		expect(name('Suzuki', 'GSX-S1000', 2022)).toBe('GSX-S1000');
		expect(name('Suzuki', 'SV650GX', 2026)).toBe('SV-7GX');
		expect(name('Honda', 'CRF300LRA', 2021)).toBe('CRF300 Rally');
		expect(name('Honda', 'CRF300LA', 2021)).toBe('CRF300L');
	});

	it('refuses a digit after the code, because that is a different model', () => {
		expect(name('Honda', 'CRF1100D', 2020)).toBe('CRF1100L Africa Twin');
		expect(name('Honda', 'CRF1100A4', 2020)).toBe('CRF1100L Africa Twin Adventure Sports');
		expect(name('Honda', 'CRF1100D3', 2024)).toBe('CRF1100D3');
	});

	it('does not let a code claim a marketing name that happens to start with it', () => {
		// "MT-07 Tracer" starts with the MT-07 code but is the Tracer 7.
		expect(name('Yamaha', 'MT-07 Tracer', 2017)).toBe('Tracer 7');
	});
});

describe('groupByIdentity', () => {
	const loaded = (make: string, model: string, from?: number, to?: number) => ({
		label: `${make} ${model}`,
		identity: identify(rec(make, model, from, to))!
	});

	it('merges the same name across a decade boundary', () => {
		// Both are the same BMW; the first registration fell either side of 2020.
		const groups = groupByIdentity([
			loaded('BMW', 'F 900 R', 2019, 2026),
			loaded('BMW', 'F900R', 2020, 2026)
		]);
		expect(groups.size).toBe(1);
	});

	it('keeps a reused name apart across a real gap', () => {
		const groups = groupByIdentity([
			loaded('Yamaha', 'XJ600', 1984, 1992),
			loaded('Yamaha', 'XJ600', 2009, 2016)
		]);
		expect(groups.size).toBe(2);
	});

	it('keeps curated generations on their own keys', () => {
		const groups = groupByIdentity([
			loaded('Kawasaki', 'Z650', 1977, 1983),
			loaded('Kawasaki', 'Z650', 2017, 2026),
			loaded('Kawasaki', 'Z650 ABS', 2018, 2020)
		]);
		expect(groups.size).toBe(2);
		expect(groups.get('kawasaki|z650|c2017')).toHaveLength(2);
	});

	it('puts a record with no years in with the largest cluster of its name', () => {
		const groups = groupByIdentity([
			loaded('Yamaha', 'XJ600', 1984, 1992),
			loaded('Yamaha', 'XJ600', 2009, 2016),
			loaded('Yamaha', 'XJ600 ABS', 2010, 2014),
			loaded('Yamaha', 'XJ600')
		]);
		const modern = [...groups.values()].find((g) => g.length === 3);
		expect(modern?.map((r) => r.label)).toContain('Yamaha XJ600');
	});
});

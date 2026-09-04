import { describe, expect, it } from 'vitest';
import { classifyByName, licenceFromEuCategory, tidyName } from './classify';
import { derivePower, plausiblePrice, sampleConfidence } from './rdw.provider';

/**
 * Every model name below is a real `merk` / `handelsbenaming` pair from the RDW
 * registry. The classifier is an inference, so the test does not chase perfect
 * accuracy — it pins the cases that would be embarrassing to get wrong and, just
 * as importantly, the cases where guessing must be refused.
 */

describe('classifyByName', () => {
	it('recognises the ranges manufacturers name by type', () => {
		expect(classifyByName('BMW', 'R 1250 GS')).toBe('ADVENTURE');
		expect(classifyByName('HONDA', 'CRF1100L AFRICA TWIN')).toBe('ADVENTURE');
		expect(classifyByName('KAWASAKI', 'NINJA 650')).toBe('SUPERSPORT');
		expect(classifyByName('YAMAHA', 'YZF-R1')).toBe('SUPERSPORT');
		expect(classifyByName('PIAGGIO', 'VESPA PRIMAVERA')).toBe('SCOOTER');
		expect(classifyByName('YAMAHA', 'TMAX')).toBe('SCOOTER');
		expect(classifyByName('HARLEY-DAVIDSON', 'SPORTSTER XL883N')).toBe('CRUISER');
		expect(classifyByName('KAWASAKI', 'VULCAN S')).toBe('CRUISER');
		expect(classifyByName('YAMAHA', 'MT-07')).toBe('NAKED');
		expect(classifyByName('KTM', '1290 SUPER DUKE R')).toBe('HYPER_NAKED');
		expect(classifyByName('TRIUMPH', 'BONNEVILLE T120')).toBe('CLASSIC');
		expect(classifyByName('DUCATI', 'SCRAMBLER ICON')).toBe('SCRAMBLER');
	});

	it('refuses to guess from a name that is only a displacement or a trim', () => {
		// These would otherwise match a general pattern and produce confident
		// nonsense on a card the user is judging by eye.
		expect(classifyByName('KAWASAKI', '750')).toBe('OTHER');
		expect(classifyByName('HONDA', 'ABS')).toBe('OTHER');
		expect(classifyByName('BMW', 'SPECIAL')).toBe('OTHER');
		expect(classifyByName('SUZUKI', '')).toBe('OTHER');
	});

	it('leaves an unrecognised name as OTHER rather than forcing a bucket', () => {
		expect(classifyByName('URAL', 'GEAR UP')).toBe('OTHER');
	});

	it('puts specific names ahead of the general patterns that would swallow them', () => {
		// "Sport touring" before "sport"; "Z900RS" is a retro, not a naked.
		expect(classifyByName('YAMAHA', 'TRACER 900')).toBe('SPORT_TOURING');
		expect(classifyByName('KAWASAKI', 'Z900RS')).toBe('CLASSIC');
		expect(classifyByName('DUCATI', 'MULTISTRADA V4')).toBe('ADVENTURE');
	});
});

describe('licenceFromEuCategory', () => {
	it('reads the licence off power, which RDW publishes', () => {
		expect(licenceFromEuCategory('L3e', 92.2, 948)).toBe('A');
		expect(licenceFromEuCategory('L3e', 35, 690)).toBe('A2');
		expect(licenceFromEuCategory('L3e', 11, 125)).toBe('A1');
	});

	it('treats a 125 as A1 even when power is unstated', () => {
		expect(licenceFromEuCategory('L3e', undefined, 125)).toBe('A1');
	});

	it('says nothing rather than guessing', () => {
		expect(licenceFromEuCategory('L3e', undefined, undefined)).toBeUndefined();
		expect(licenceFromEuCategory(undefined, 92.2, 948)).toBeUndefined();
	});

	it('maps the light categories to a moped licence', () => {
		expect(licenceFromEuCategory('L1e', 4, 50)).toBe('AM');
	});
});

describe('tidyName', () => {
	it('stops the registry shouting on every card', () => {
		expect(tidyName('NINJA 650')).toBe('Ninja 650');
		expect(tidyName('AFRICA TWIN')).toBe('Africa Twin');
		expect(tidyName('SPORTSTER   XL883N')).toBe('Sportster XL883N');
	});

	it('leaves designations exactly as they are', () => {
		// Title-casing these produces "Gs", "Zx-6R", "Mt-09" — obviously broken.
		expect(tidyName('R 1250 GS')).toBe('R 1250 GS');
		expect(tidyName('ZX-6R')).toBe('ZX-6R');
		expect(tidyName('MT-09')).toBe('MT-09');
	});
});

describe('plausiblePrice', () => {
	const model = (pricedCount: number, priceEur: number | undefined) => ({
		pricedCount,
		priceEur
	});

	it('believes a price enough examples agree on', () => {
		expect(plausiblePrice(model(6140, 10599))).toBe(10599);
		expect(plausiblePrice(model(3, 7198))).toBe(7198);
	});

	it('refuses a price only one registration carries', () => {
		// The Suzuki GS500: 37 registered, one with a price, and that one said
		// 611. The card read "€611" for a bike that cost about ten times that.
		expect(plausiblePrice(model(1, 611))).toBeNull();
		expect(plausiblePrice(model(2, 5000))).toBeNull();
	});

	it('refuses a figure no motorcycle could have cost', () => {
		expect(plausiblePrice(model(50, 12))).toBeNull();
		expect(plausiblePrice(model(50, 2_000_000))).toBeNull();
	});

	it('says nothing when the registry recorded nothing', () => {
		expect(plausiblePrice(model(0, undefined))).toBeNull();
	});
});

/**
 * Power is the field the registry is worst at. It records what each example was
 * *registered* at, so the readings include A2-restricted bikes on one side and
 * tuned specials on the other.
 */
describe('derivePower', () => {
	const model = (powerReadings: number[], displacementCc?: number) => ({
		powerReadings,
		displacementCc
	});

	it('takes the highest reading, because A2 versions are the same bike derated', () => {
		// A Kawasaki Z650 registered both restricted and unrestricted.
		expect(derivePower(model([35, 35, 50, 35], 649))).toBe(50);
	});

	it('refuses when every example sits on the A2 ceiling', () => {
		// This is what listed 110 motorcycles at exactly 46.9 hp. A 649 cc bike
		// registered only as 35 kW tells us about the registrations, not the bike.
		expect(derivePower(model([35, 35, 35], 649))).toBeUndefined();
		expect(derivePower(model([35, 35, 35, 35], 890))).toBeUndefined();
	});

	it('keeps a small bike that genuinely makes 35 kW', () => {
		// A Honda CB500X really does make exactly that, and it is not restricted.
		expect(derivePower(model([35, 35, 35], 471))).toBe(35);
	});

	it('rejects a tuned example', () => {
		// A Hayabusa came back at 320 hp — 244 hp per litre.
		expect(derivePower(model([140, 145, 239], 1313))).toBeUndefined();
		// A home-built special recorded at 1,000 kW.
		expect(derivePower(model([1000, 1000, 1000], 1408))).toBeUndefined();
	});

	it('says nothing when too few examples were sampled', () => {
		expect(derivePower(model([50, 50], 649))).toBeUndefined();
		expect(derivePower(model([], 649))).toBeUndefined();
	});
});

describe('sampleConfidence', () => {
	it('rises with the number of examples and then flattens', () => {
		expect(sampleConfidence(5)).toBeLessThan(sampleConfidence(500));
		expect(sampleConfidence(500)).toBeLessThan(sampleConfidence(5000));
		expect(sampleConfidence(5000)).toBeLessThanOrEqual(0.9);
		expect(sampleConfidence(0)).toBeLessThan(0.2);
	});
});

import { describe, expect, it } from 'vitest';
import {
	buildMatchKey,
	normalizeBrand,
	normalizeModel,
	selectEnrichment,
	stripBrandPrefix
} from './match';

/**
 * These cases are the actual name pairs that RDW and Wikipedia produce for the
 * same motorcycles. Getting one wrong is not a subtle bug — it puts two cards
 * for one bike into the swipe deck, which is the first thing anyone notices.
 */

describe('normalizeBrand', () => {
	it('collapses the corporate names sources disagree about', () => {
		expect(normalizeBrand('KAWASAKI')).toBe('kawasaki');
		expect(normalizeBrand('Kawasaki Heavy Industries Motorcycle & Engine')).toBe('kawasaki');
		expect(normalizeBrand('Triumph Motorcycles Ltd')).toBe('triumph');
		expect(normalizeBrand('Ducati Motor Holding S.p.A.')).toBe('ducatimotorholding');
	});

	it('reconciles brands that no suffix rule would', () => {
		expect(normalizeBrand('BMW Motorrad')).toBe('bmw');
		expect(normalizeBrand('BMW')).toBe('bmw');
		expect(normalizeBrand('Harley-Davidson')).toBe('harleydavidson');
		expect(normalizeBrand('HARLEY DAVIDSON')).toBe('harleydavidson');
	});

	it('does not let noise stripping eat a real brand name', () => {
		// "motor company" must be removed before "motor" gets a chance at
		// "Moto Guzzi" — this is why BRAND_NOISE is ordered longest first.
		expect(normalizeBrand('Moto Guzzi')).toBe('motoguzzi');
		expect(normalizeBrand('MOTO GUZZI')).toBe('motoguzzi');
		expect(normalizeBrand('Motobecane')).toBe('motobecane');
	});
});

describe('normalizeModel', () => {
	it('ignores the spacing and punctuation sources differ on', () => {
		expect(normalizeModel('Z900')).toBe('z900');
		expect(normalizeModel('Z 900')).toBe('z900');
		expect(normalizeModel('R 1250 GS')).toBe(normalizeModel('R1250GS'));
		expect(normalizeModel('MT-09')).toBe(normalizeModel('MT 09'));
	});

	it('drops parenthetical and trailing-year variant markers', () => {
		expect(normalizeModel('Bonneville (2016)')).toBe('bonneville');
		expect(normalizeModel('Ninja 650 2021')).toBe('ninja650');
	});

	it('keeps a year that is part of the name', () => {
		// The 1290 is displacement, not a year, and CB1100 is a model.
		expect(normalizeModel('1290 Super Duke R')).toBe('1290superduker');
		expect(normalizeModel('CB1100')).toBe('cb1100');
	});
});

describe('buildMatchKey', () => {
	it('matches the same motorcycle across sources', () => {
		expect(buildMatchKey('Kawasaki Heavy Industries Motorcycle & Engine', 'Z900')).toBe(
			buildMatchKey('KAWASAKI', 'Z 900')
		);
		expect(buildMatchKey('BMW Motorrad', 'R 1250 GS')).toBe(buildMatchKey('BMW', 'R1250GS'));
	});

	it('keeps genuinely different motorcycles apart', () => {
		expect(buildMatchKey('Kawasaki', 'Z900')).not.toBe(buildMatchKey('Kawasaki', 'Z900RS'));
		expect(buildMatchKey('Honda', 'CB500F')).not.toBe(buildMatchKey('Honda', 'CB500X'));
		expect(buildMatchKey('Yamaha', 'MT-07')).not.toBe(buildMatchKey('Yamaha', 'MT-09'));
	});

	it('refuses to produce a key when half of it is missing', () => {
		// "|z900" would match every unbranded row against every other one.
		expect(buildMatchKey('', 'Z900')).toBeNull();
		expect(buildMatchKey('Kawasaki', '   ')).toBeNull();
		expect(buildMatchKey('Ltd', 'Z900')).toBeNull();
	});
});

describe('selectEnrichment', () => {
	it('fills gaps and leaves existing facts alone', () => {
		const patch = selectEnrichment(
			{ displacementCc: 948, msrpAmount: null, seatHeightMm: 795 },
			{ displacementCc: 950, msrpAmount: 10589, seatHeightMm: 800 }
		);

		expect(patch).toEqual({ msrpAmount: 10589 });
	});

	it('treats a source saying nothing as no reason to write', () => {
		const patch = selectEnrichment(
			{ powerKw: null, torqueNm: null },
			{ powerKw: 92.2, torqueNm: undefined }
		);

		expect(patch).toEqual({ powerKw: 92.2 });
	});

	it('replaces an OTHER category, because OTHER is not information', () => {
		expect(selectEnrichment({ category: 'OTHER' }, { category: 'NAKED' })).toEqual({
			category: 'NAKED'
		});
		expect(selectEnrichment({ category: 'NAKED' }, { category: 'SPORT' })).toEqual({});
		expect(selectEnrichment({ category: 'OTHER' }, { category: 'OTHER' })).toEqual({});
	});

	it('honours protected fields', () => {
		const patch = selectEnrichment(
			{ msrpAmount: null, seatHeightMm: null },
			{ msrpAmount: 10589, seatHeightMm: 820 },
			['msrpAmount']
		);

		expect(patch).toEqual({ seatHeightMm: 820 });
	});

	it('never writes provenance or identity columns', () => {
		const patch = selectEnrichment(
			{},
			{ source: 'rdw', externalId: 'X', slug: 'y', model: 'Z900', manuallyEdited: true }
		);

		expect(patch).toEqual({});
	});
});

describe('stripBrandPrefix', () => {
	it('removes a make repeated inside the model name', () => {
		// Real RDW rows. "BMW R1200GSADVENTURE" existed alongside
		// "R 1200 GS Adventure" and stopped it from ever getting a photograph.
		expect(stripBrandPrefix('BMW', 'BMW R1200GSADVENTURE')).toBe('R1200GSADVENTURE');
		expect(stripBrandPrefix('KTM', 'KTM KTM 1290 Super Adventure S')).toBe(
			'1290 Super Adventure S'
		);
		expect(stripBrandPrefix('Harley-Davidson', 'Harley-Davidson Street Glide')).toBe(
			'Street Glide'
		);
	});

	it('handles a multi-word brand', () => {
		expect(stripBrandPrefix('Moto Guzzi', 'Moto Guzzi V7')).toBe('V7');
		expect(stripBrandPrefix('Moto Guzzi', 'V7')).toBe('V7');
	});

	it('leaves an ordinary model name alone', () => {
		expect(stripBrandPrefix('Kawasaki', 'Z900')).toBe('Z900');
		expect(stripBrandPrefix('Honda', 'CB1000R')).toBe('CB1000R');
		// Never strips down to nothing, however tempting.
		expect(stripBrandPrefix('Honda', 'Honda')).toBe('Honda');
	});
});

describe('stripBrandPrefix — the distinctive half of a two-word marque', () => {
	it('strips the half an encyclopedia uses on its own', () => {
		expect(stripBrandPrefix('Moto Guzzi', 'Guzzi California')).toBe('California');
		expect(stripBrandPrefix('MV Agusta', 'Agusta Superveloce')).toBe('Superveloce');
		expect(stripBrandPrefix('Royal Enfield', 'Enfield Meteor')).toBe('Meteor');
		expect(stripBrandPrefix('Moto Morini', 'Morini X-Cape')).toBe('X-Cape');
	});

	it('leaves a model that merely starts with a brand-like word', () => {
		expect(stripBrandPrefix('Honda', 'Honda Gold Wing')).toBe('Gold Wing');
		expect(stripBrandPrefix('Harley-Davidson', 'Davidson')).toBe('Davidson');
		expect(stripBrandPrefix('Moto Guzzi', 'Guzzi')).toBe('Guzzi');
	});
});

import { describe, expect, it } from 'vitest';
import {
	assessAvailability,
	assessEvidence,
	baselineEligibility,
	meaningfulYears,
	type EvidenceInput
} from './evidence';

const base = (over: Partial<EvidenceInput> = {}): EvidenceInput => ({
	values: {},
	fieldSources: {},
	fieldConfidence: {},
	conflicts: {},
	identity: { curated: true, sources: ['rdw'], registrations: 500 },
	boundarySource: 'CURATED',
	primaryImage: { scope: 'MODEL_YEAR', suspicious: false },
	divided: true,
	availability: 'NEW',
	msrpYear: 2026,
	now: 2026,
	...over
});

describe('assessEvidence — the 2025 Z900 the product is built around', () => {
	const z900 = assessEvidence(
		base({
			values: {
				category: 'NAKED',
				displacementCc: 948,
				powerHp: 125,
				torqueNm: 98,
				wetWeightKg: 213,
				seatHeightMm: 830,
				ridingPosition: 'UPRIGHT',
				passengerAllowed: true,
				seatCount: 2,
				licenseCategory: 'A',
				msrpAmount: 10999
			},
			fieldSources: {
				category: 'curated',
				displacementCc: 'rdw',
				powerHp: 'wikipedia',
				torqueNm: 'wikipedia',
				wetWeightKg: 'rdw',
				seatHeightMm: 'wikipedia',
				ridingPosition: 'category',
				passengerAllowed: 'rdw',
				seatCount: 'rdw',
				licenseCategory: 'rdw',
				msrpAmount: 'rdw'
			},
			fieldConfidence: { displacementCc: 0.9, wetWeightKg: 0.9 }
		})
	);

	it('verifies what strong sources stated', () => {
		expect(z900.fields).toMatchObject({
			identity: 'VERIFIED',
			generation: 'VERIFIED',
			category: 'VERIFIED',
			displacementCc: 'VERIFIED',
			powerHp: 'VERIFIED',
			wetWeightKg: 'VERIFIED',
			passengerAllowed: 'VERIFIED',
			msrpAmount: 'VERIFIED',
			availability: 'VERIFIED'
		});
		expect(z900.image).toBe('MODEL_YEAR');
		expect(z900.priceCurrency).toBe('CURRENT');
	});

	it('calls a derived fact inferred, not verified', () => {
		expect(z900.fields.ridingPosition).toBe('INFERRED');
		expect(z900.fields.licenseCategory).toBe('HIGH');
	});

	it('is eligible for discovery', () => {
		expect(baselineEligibility(z900)).toEqual({ eligible: true, reasons: [] });
	});
});

describe('assessEvidence — what it refuses to dress up', () => {
	it('marks a registry-only, thinly registered name as inferred identity', () => {
		const e = assessEvidence(
			base({ identity: { curated: false, sources: ['rdw'], registrations: 4 } })
		);
		expect(e.fields.identity).toBe('INFERRED');
		expect(baselineEligibility(e).reasons).toContain('identity-thin');
	});

	it('treats two agreeing sources as verification', () => {
		const e = assessEvidence(
			base({ identity: { curated: false, sources: ['rdw', 'wikipedia'], registrations: 4 } })
		);
		expect(e.fields.identity).toBe('VERIFIED');
	});

	it('keeps a category guessed from the name at inferred', () => {
		const e = assessEvidence(
			base({ values: { category: 'NAKED' }, fieldSources: { category: 'rdw' } })
		);
		expect(e.fields.category).toBe('INFERRED');
	});

	it('keeps sampled registry power below a published figure', () => {
		const rdw = assessEvidence(base({ values: { powerHp: 92 }, fieldSources: { powerHp: 'rdw' } }));
		const wiki = assessEvidence(
			base({ values: { powerHp: 92 }, fieldSources: { powerHp: 'wikipedia' } })
		);
		expect(rdw.fields.powerHp).toBe('HIGH');
		expect(wiki.fields.powerHp).toBe('VERIFIED');
	});

	it('records a disagreement rather than hiding it', () => {
		const e = assessEvidence(
			base({
				values: { wetWeightKg: 210 },
				fieldSources: { wetWeightKg: 'rdw' },
				fieldConfidence: { wetWeightKg: 0.9 },
				conflicts: {
					wetWeightKg: [
						{ source: 'rdw', value: 210 },
						{ source: 'wikipedia', value: 170 }
					]
				}
			})
		);
		expect(e.fields.wetWeightKg).toBe('CONFLICTING');
	});

	it('leaves what nobody said unknown', () => {
		const e = assessEvidence(base({ values: {} }));
		expect(e.fields.torqueNm).toBe('UNKNOWN');
		expect(e.fields.seatHeightMm).toBe('UNKNOWN');
		expect(e.fields.passengerAllowed).toBe('UNKNOWN');
	});

	it('calls an old list price historical', () => {
		const e = assessEvidence(
			base({ values: { msrpAmount: 9599 }, fieldSources: { msrpAmount: 'rdw' }, msrpYear: 2019 })
		);
		expect(e.priceCurrency).toBe('HISTORICAL');
	});
});

describe('image status and eligibility', () => {
	it('lets a family photograph stand for an undivided family only', () => {
		const one = assessEvidence(
			base({ primaryImage: { scope: 'FAMILY', suspicious: false }, divided: false })
		);
		const many = assessEvidence(
			base({ primaryImage: { scope: 'FAMILY', suspicious: false }, divided: true })
		);
		expect(one.image).toBe('GENERATION');
		expect(baselineEligibility(one).eligible).toBe(true);
		expect(many.image).toBe('FAMILY_ONLY');
		expect(baselineEligibility(many).reasons).toEqual(['family-image-on-divided-family']);
	});

	it('fails a card with no photograph or a doubtful one', () => {
		expect(baselineEligibility(assessEvidence(base({ primaryImage: null }))).reasons).toEqual([
			'no-image'
		]);
		expect(
			baselineEligibility(
				assessEvidence(base({ primaryImage: { scope: 'GENERATION', suspicious: true } }))
			).reasons
		).toEqual(['suspicious-image']);
	});
});

describe('availability from first admissions', () => {
	const y = (year: number, n: number) => ({ year, registrationCount: n });

	it('is new while examples keep being put on the road', () => {
		expect(assessAvailability([y(2023, 300), y(2024, 280), y(2025, 310), y(2026, 120)], 2026)).toBe(
			'NEW'
		);
	});

	it('does not let one straggler make a discontinued model new', () => {
		// A 2005 motorcycle with a single first admission dated 2026.
		const years = [y(2004, 400), y(2005, 600), y(2006, 500), y(2007, 200), y(2026, 1)];
		expect(meaningfulYears(years)).toEqual([2004, 2005, 2006, 2007]);
		expect(assessAvailability(years, 2026)).toBe('USED');
	});

	it('keeps every year of a genuinely low-volume model', () => {
		const years = [y(2022, 3), y(2023, 4), y(2024, 3), y(2025, 5)];
		expect(meaningfulYears(years)).toEqual([2022, 2023, 2024, 2025]);
		expect(assessAvailability(years, 2026)).toBe('NEW');
	});

	it('does not claim a model too small to judge has stopped', () => {
		expect(assessAvailability([y(2015, 2), y(2016, 3)], 2026)).toBe('UNKNOWN');
		expect(assessAvailability([], 2026)).toBe('UNKNOWN');
	});
});

describe('market', () => {
	it('keeps a model the registry has never seen out of the deck, but not out of browse', () => {
		const e = assessEvidence(
			base({ identity: { curated: false, sources: ['wikipedia'], registrations: 0 } })
		);
		expect(e.market).toBe('NOT_NL');
		expect(baselineEligibility(e).reasons).toEqual(['not-on-dutch-market']);
	});

	it('does not hold silence about markets against a source', () => {
		const e = assessEvidence(
			base({ identity: { curated: false, sources: ['sample'], registrations: 0 } })
		);
		expect(e.market).toBe('UNKNOWN');
		expect(baselineEligibility(e).eligible).toBe(true);
	});
});

import { describe, expect, it } from 'vitest';
import { mergeContributions, mergeTags, type Contribution } from './merge';

/**
 * The case this exists for: a Kawasaki Z900 described by two sources, neither
 * of which knows the whole bike.
 */
const wikipedia: Contribution = {
	source: 'wikipedia',
	values: {
		displacementCc: 948,
		powerHp: 125,
		torqueNm: 98.6,
		seatHeightMm: 795,
		category: 'NAKED',
		tags: ['chain-drive']
	}
};

const rdw: Contribution = {
	source: 'rdw',
	values: {
		displacementCc: 948,
		powerHp: 46.9,
		wetWeightKg: 210.2,
		msrpAmount: 9599,
		msrpCurrency: 'EUR',
		seatCount: 2,
		passengerAllowed: true,
		registrationCount: 6145,
		category: 'OTHER',
		tags: ['a2-restrictable']
	},
	// Power sampled from registrations is a weaker claim than a published spec.
	confidence: { powerHp: 0.3, msrpAmount: 0.9 }
};

describe('mergeContributions', () => {
	it('takes each field from the source that should know it', () => {
		const { values, fieldSources } = mergeContributions([wikipedia, rdw]);

		expect(values.seatHeightMm).toBe(795);
		expect(fieldSources.seatHeightMm).toBe('wikipedia');

		expect(values.msrpAmount).toBe(9599);
		expect(fieldSources.msrpAmount).toBe('rdw');

		expect(values.wetWeightKg).toBe(210.2);
		expect(fieldSources.wetWeightKg).toBe('rdw');

		expect(values.seatCount).toBe(2);
		expect(values.passengerAllowed).toBe(true);
		expect(fieldSources.seatCount).toBe('rdw');
	});

	it('does not let a low-confidence figure beat a published one', () => {
		// The whole point: RDW's sampled 46.9 hp must not replace 125 hp.
		const { values, fieldSources } = mergeContributions([wikipedia, rdw]);
		expect(values.powerHp).toBe(125);
		expect(fieldSources.powerHp).toBe('wikipedia');
	});

	it('takes the low-confidence figure when it is the only one', () => {
		const { values, fieldSources } = mergeContributions([rdw]);
		expect(values.powerHp).toBe(46.9);
		expect(fieldSources.powerHp).toBe('rdw');
	});

	it('gives the same answer whichever order the sources arrive in', () => {
		// Import order decided the data before this existed.
		const forwards = mergeContributions([wikipedia, rdw]);
		const backwards = mergeContributions([rdw, wikipedia]);
		expect(backwards.values).toEqual(forwards.values);
		expect(backwards.fieldSources).toEqual(forwards.fieldSources);
	});

	it('treats OTHER as the category enum saying nothing', () => {
		const { values, fieldSources } = mergeContributions([wikipedia, rdw]);
		expect(values.category).toBe('NAKED');
		expect(fieldSources.category).toBe('wikipedia');
	});

	it('prefers a real value over an explicit unknown', () => {
		const knows: Contribution = { source: 'wikipedia', values: { seatHeightMm: 795 } };
		const doesNot: Contribution = { source: 'rdw', values: { seatHeightMm: null } };
		expect(mergeContributions([doesNot, knows]).values.seatHeightMm).toBe(795);
	});

	it('leaves a field out entirely when nobody knows it', () => {
		const { values, fieldSources } = mergeContributions([
			{ source: 'rdw', values: { seatHeightMm: null } }
		]);
		expect(values).not.toHaveProperty('seatHeightMm');
		expect(fieldSources).not.toHaveProperty('seatHeightMm');
	});

	it('never touches a field a human protected', () => {
		const { values, fieldSources } = mergeContributions([wikipedia, rdw], {
			protectedFields: ['seatHeightMm', 'msrpAmount']
		});
		expect(values).not.toHaveProperty('seatHeightMm');
		expect(values).not.toHaveProperty('msrpAmount');
		expect(fieldSources).not.toHaveProperty('seatHeightMm');
	});

	it('records where every merged value came from', () => {
		const { values, fieldSources } = mergeContributions([wikipedia, rdw]);
		for (const field of Object.keys(values)) {
			expect(fieldSources[field], field).toBeTruthy();
		}
	});
});

describe('mergeTags', () => {
	it('unions rather than competes — a tag is not a contradiction', () => {
		expect(mergeTags([wikipedia, rdw]).sort()).toEqual(['a2-restrictable', 'chain-drive']);
	});
});

/**
 * A registry lists a popular model under a dozen spellings with the
 * registrations split between them. Picking one of those counts as the model's
 * count reported 85 Yamaha MT-09s on Dutch roads, where there are over 5,000.
 */
describe('aggregate fields', () => {
	const spellings: Contribution[] = [
		{
			source: 'rdw',
			values: { registrationCount: 3527, firstRegistrationYear: 2014, lastRegistrationYear: 2024 }
		},
		{
			source: 'rdw',
			values: { registrationCount: 1549, firstRegistrationYear: 2021, lastRegistrationYear: 2026 }
		},
		{
			source: 'rdw',
			values: { registrationCount: 85, firstRegistrationYear: 2016, lastRegistrationYear: 2019 }
		}
	];

	it('sums registrations rather than picking one', () => {
		expect(mergeContributions(spellings).values.registrationCount).toBe(3527 + 1549 + 85);
	});

	it('takes the widest span of years', () => {
		const { values } = mergeContributions(spellings);
		expect(values.firstRegistrationYear).toBe(2014);
		expect(values.lastRegistrationYear).toBe(2026);
	});

	it('credits every source that contributed a number', () => {
		const { fieldSources } = mergeContributions([
			...spellings,
			{ source: 'wikipedia', values: { firstRegistrationYear: 2013 } }
		]);
		expect(fieldSources.firstRegistrationYear).toBe('rdw+wikipedia');
	});

	it('says nothing when nobody counted', () => {
		const { values } = mergeContributions([{ source: 'wikipedia', values: { powerHp: 119 } }]);
		expect(values).not.toHaveProperty('registrationCount');
	});
});

describe('sample size decides between spellings of the same bike', () => {
	it('believes the figure measured over more examples', () => {
		// 3,527 registered examples against five.
		const many: Contribution = {
			source: 'rdw',
			values: { wetWeightKg: 201.9 },
			confidence: { wetWeightKg: 0.99 }
		};
		const few: Contribution = {
			source: 'rdw',
			values: { wetWeightKg: 281.6 },
			confidence: { wetWeightKg: 0.4 }
		};
		expect(mergeContributions([few, many]).values.wetWeightKg).toBe(201.9);
	});
});

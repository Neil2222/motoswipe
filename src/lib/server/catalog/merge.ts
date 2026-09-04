/**
 * Building one motorcycle out of what several sources said about it.
 *
 * Enrichment used to be "first source to fill a field wins, later ones only
 * fill blanks". That is easy to reason about and quietly wrong: it makes the
 * import *order* decide your data. Run the registry first and every seat height
 * is missing; run the encyclopedia first and every price is.
 *
 * So each field picks a winner instead, on two things in this order:
 *
 *  1. **Confidence.** A provider says how sure it is. A price derived from
 *     three registrations is a different claim from one derived from one, and
 *     RDW's engine power — sampled from whichever examples happen to be
 *     registered — is a weaker claim than a published specification.
 *  2. **Source priority, per field.** Where confidence ties, the source that is
 *     actually authoritative for that field wins: the registry for prices and
 *     seat counts, the encyclopedia for the figures a manufacturer publishes.
 *
 * A human correction outranks both and is not represented here at all — it is
 * `protectedFields`, applied by the caller.
 */

import type { NormalizedMotorcycle } from '../importers/types';

/** Fields that can be merged. Identity and provenance columns are not. */
export const MERGEABLE_FIELDS = [
	'modelYear',
	'category',
	'categoryRaw',
	'subCategory',
	'description',
	'displacementCc',
	'cylinders',
	'engineConfiguration',
	'cooling',
	'powerHp',
	'powerKw',
	'torqueNm',
	'transmission',
	'gears',
	'wetWeightKg',
	'dryWeightKg',
	'seatHeightMm',
	'seatWidthMm',
	'wheelbaseMm',
	'fuelCapacityLiters',
	'passengerAllowed',
	'seatCount',
	'passengerPegs',
	'ridingPosition',
	'licenseCategory',
	'msrpAmount',
	'msrpCurrency',
	'marketCountryCode',
	'availableNew',
	'firstRegistrationYear',
	'lastRegistrationYear',
	'registrationCount'
] as const;

export type MergeableField = (typeof MERGEABLE_FIELDS)[number];

/**
 * Which source to believe for each field, best first.
 *
 * Only consulted when confidence ties, so this encodes authority rather than
 * quality: who is *supposed* to know this.
 *
 *  - The Dutch registry measures the machines on the road. It is the authority
 *    on what one cost, how many seats it was registered with, and what it
 *    weighs in running order — it took those numbers off actual vehicles.
 *  - An encyclopedia reports what the manufacturer published. It is the
 *    authority on seat height, torque, gearbox and the peak power a model
 *    makes unrestricted, none of which a registry records honestly.
 */
export const FIELD_PRIORITY: Partial<Record<MergeableField, string[]>> = {
	// The registry knows what things cost and how they are registered.
	msrpAmount: ['rdw', 'wikipedia'],
	msrpCurrency: ['rdw', 'wikipedia'],
	marketCountryCode: ['rdw', 'wikipedia'],
	seatCount: ['rdw', 'wikipedia'],
	passengerAllowed: ['rdw', 'wikipedia'],
	licenseCategory: ['rdw', 'wikipedia'],
	availableNew: ['rdw', 'wikipedia'],
	firstRegistrationYear: ['rdw'],
	lastRegistrationYear: ['rdw'],
	registrationCount: ['rdw'],
	wetWeightKg: ['rdw', 'wikipedia'],
	wheelbaseMm: ['rdw', 'wikipedia'],

	// The manufacturer's published figures: its own current model page first,
	// then the encyclopedias — English, then German, which covers far more of
	// the modern range.
	seatHeightMm: ['manufacturer', 'wikipedia', 'wikipedia-de', 'rdw'],
	seatWidthMm: ['manufacturer', 'wikipedia', 'wikipedia-de', 'rdw'],
	torqueNm: ['manufacturer', 'wikipedia', 'wikipedia-de', 'rdw'],
	transmission: ['manufacturer', 'wikipedia', 'wikipedia-de', 'rdw'],
	gears: ['manufacturer', 'wikipedia', 'wikipedia-de', 'rdw'],
	engineConfiguration: ['manufacturer', 'wikipedia', 'wikipedia-de', 'rdw'],
	cooling: ['manufacturer', 'wikipedia', 'wikipedia-de', 'rdw'],
	fuelCapacityLiters: ['manufacturer', 'wikipedia', 'wikipedia-de', 'rdw'],
	dryWeightKg: ['manufacturer', 'wikipedia', 'wikipedia-de', 'rdw'],
	description: ['wikipedia', 'wikipedia-de', 'rdw'],
	// Peak power as published, not as whichever examples were registered.
	powerHp: ['manufacturer', 'wikipedia', 'wikipedia-de', 'rdw'],
	powerKw: ['manufacturer', 'wikipedia', 'wikipedia-de', 'rdw'],
	modelYear: ['wikipedia', 'wikipedia-de', 'rdw'],
	category: ['curated', 'manufacturer', 'wikipedia', 'wikipedia-de', 'rdw']
};

/** Where a field falls outside `FIELD_PRIORITY`. */
const DEFAULT_PRIORITY = ['manufacturer', 'wikipedia', 'wikipedia-de', 'rdw', 'sample'];

/** Confidence assumed when a provider says nothing about how sure it is. */
const DEFAULT_CONFIDENCE = 0.6;

/**
 * Confidence differences smaller than this are treated as a tie.
 *
 * Otherwise a provider nudging a value from 0.8 to 0.81 silently reorders the
 * sources, and the per-field priority above stops meaning anything.
 */
const CONFIDENCE_EPSILON = 0.15;

/**
 * Fields that are not opinions to choose between but quantities to combine.
 *
 * A registry lists the Yamaha MT-09 under a dozen spellings — `MT-09`, `MT09A`,
 * `MTN890`, `MT - 09 ABS` — with the registrations split between them. Picking
 * one record's count as the model's count reported 85 motorcycles on the road
 * where there are more than five thousand, and made "most on the road" sort by
 * whichever spelling happened to win.
 */
const AGGREGATE_FIELDS = {
	registrationCount: 'sum',
	firstRegistrationYear: 'min',
	lastRegistrationYear: 'max'
} as const satisfies Partial<Record<MergeableField, 'sum' | 'min' | 'max'>>;

export interface Contribution {
	source: string;
	values: Partial<NormalizedMotorcycle>;
	/** Per-field, 0–1. Absent fields fall back to `DEFAULT_CONFIDENCE`. */
	confidence?: Partial<Record<string, number>>;
}

export interface MergeResult {
	values: Record<string, unknown>;
	/** Which source won each field. This is what makes a merge explicable. */
	fieldSources: Record<string, string>;
	/** How sure the winning source was of each field, 0-1. */
	fieldConfidence: Record<string, number>;
	/**
	 * Fields where two sources gave materially different numbers.
	 *
	 * The merge still picks one, but the disagreement is a fact about the
	 * evidence and is kept: a card should not present a contested figure with
	 * the same face as an agreed one.
	 */
	conflicts: Record<string, { source: string; value: number }[]>;
}

/** Numbers further apart than this, from two sources, are a disagreement. */
const CONFLICT_TOLERANCE = 0.2;

/**
 * Merges contributions into one set of values.
 *
 * `protectedFields` are left out entirely — a human said what those are and no
 * source overrules that.
 */
export function mergeContributions(
	contributions: readonly Contribution[],
	options: { protectedFields?: readonly string[] } = {}
): MergeResult {
	const protectedFields = new Set(options.protectedFields ?? []);
	const values: Record<string, unknown> = {};
	const fieldSources: Record<string, string> = {};
	const fieldConfidence: Record<string, number> = {};
	const conflicts: MergeResult['conflicts'] = {};

	for (const field of MERGEABLE_FIELDS) {
		if (protectedFields.has(field)) continue;

		const aggregate = (AGGREGATE_FIELDS as Record<string, 'sum' | 'min' | 'max' | undefined>)[
			field
		];
		if (aggregate) {
			const numbers = contributions
				.map((c) => (c.values as Record<string, unknown>)[field])
				.filter((v): v is number => typeof v === 'number');
			if (!numbers.length) continue;

			values[field] =
				aggregate === 'sum'
					? numbers.reduce((total, n) => total + n, 0)
					: aggregate === 'min'
						? Math.min(...numbers)
						: Math.max(...numbers);
			// Every source that had a number contributed to this one.
			fieldSources[field] = [
				...new Set(
					contributions
						.filter((c) => typeof (c.values as Record<string, unknown>)[field] === 'number')
						.map((c) => c.source)
				)
			].join('+');
			continue;
		}

		const priority = FIELD_PRIORITY[field] ?? DEFAULT_PRIORITY;
		let best: { source: string; value: unknown; confidence: number; rank: number } | undefined;

		for (const contribution of contributions) {
			const value = (contribution.values as Record<string, unknown>)[field];
			// undefined means the source said nothing. null means it said "unknown",
			// which is a real statement but never beats an actual value.
			if (value === undefined || value === null) continue;
			// `OTHER` is the category enum's way of saying nothing.
			if (field === 'category' && value === 'OTHER') continue;

			const confidence = contribution.confidence?.[field] ?? DEFAULT_CONFIDENCE;
			const rankIndex = priority.indexOf(contribution.source);
			// A source nobody ranked sorts behind every source that is ranked.
			const rank = rankIndex === -1 ? priority.length : rankIndex;

			if (!best) {
				best = { source: contribution.source, value, confidence, rank };
				continue;
			}

			const clearlyMoreConfident = confidence - best.confidence > CONFIDENCE_EPSILON;
			const clearlyLessConfident = best.confidence - confidence > CONFIDENCE_EPSILON;

			if (clearlyMoreConfident || (!clearlyLessConfident && rank < best.rank)) {
				best = { source: contribution.source, value, confidence, rank };
			}
		}

		if (best) {
			values[field] = best.value;
			fieldSources[field] = best.source;
			fieldConfidence[field] = best.confidence;

			// Two sources, two numbers, far apart: the value stands, the doubt is
			// recorded. One source's spellings never disagree with themselves.
			if (typeof best.value === 'number') {
				const bySource = new Map<string, number>();
				for (const contribution of contributions) {
					const value = (contribution.values as Record<string, unknown>)[field];
					if (typeof value === 'number' && !bySource.has(contribution.source)) {
						bySource.set(contribution.source, value);
					}
				}
				const disagreeing = [...bySource.entries()]
					.filter(
						([, value]) =>
							Math.abs(value - (best!.value as number)) >
							CONFLICT_TOLERANCE * Math.abs(best!.value as number)
					)
					.map(([source, value]) => ({ source, value }));
				if (disagreeing.length) {
					conflicts[field] = [{ source: best.source, value: best.value }, ...disagreeing];
				}
			}
		}
	}

	return { values, fieldSources, fieldConfidence, conflicts };
}

/**
 * Tags and images are sets rather than single values, so they are unioned
 * rather than competed over — every source's photographs are worth having, and
 * a tag one source knows is not contradicted by another source not knowing it.
 */
export function mergeTags(contributions: readonly Contribution[]): string[] {
	const tags = new Set<string>();
	for (const contribution of contributions) {
		for (const tag of contribution.values.tags ?? []) tags.add(tag);
	}
	return [...tags];
}

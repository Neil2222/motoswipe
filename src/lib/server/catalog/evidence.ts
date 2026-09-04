import type { YearObservation } from './boundaries';

/**
 * What the evidence behind a card amounts to.
 *
 * MotoSwipe's promise is not a large catalogue but a trustworthy card: when a
 * motorcycle turns up in a discovery round, the picture is of that machine, the
 * numbers the round filtered on are real, and anything unknown is marked
 * unknown rather than filled in. This module is where "trustworthy" is defined,
 * field by field, from the provenance the merge recorded.
 *
 * Every rule here is about *evidence*, never about the value. A seat height of
 * 820 mm from an encyclopedia and one guessed from the category are the same
 * number and completely different facts. The merge already records who said
 * what (`fieldSources`) and how sure they were (`fieldConfidence`); this turns
 * that into a status a filter or an audit can act on.
 *
 * Pure. Nothing here touches the database.
 */

/**
 * How well a field is known.
 *
 *  - VERIFIED    a strong source stated it: a curated fact, a published
 *                specification, or the registry measuring many examples.
 *  - HIGH        a real source stated it, from fewer examples or with a known
 *                weakness — sampled power, a model with a dozen registrations.
 *  - INFERRED    derived from something else: a category from a model name,
 *                a riding position from a category, a licence from power.
 *  - UNKNOWN     nobody said.
 *  - CONFLICTING two sources said materially different things. A value was
 *                chosen, but it is contested.
 */
export type FieldStatus = 'VERIFIED' | 'HIGH' | 'INFERRED' | 'UNKNOWN' | 'CONFLICTING';

/** How narrowly the primary photograph is known to be of this generation. */
export type ImageStatus = 'MODEL_YEAR' | 'GENERATION' | 'FAMILY_ONLY' | 'NONE' | 'SUSPICIOUS';

export type Availability = 'NEW' | 'USED' | 'UNKNOWN';

/** The fields a card is judged on. */
export const EVIDENCE_FIELDS = [
	'identity',
	'generation',
	'category',
	'displacementCc',
	'powerHp',
	'torqueNm',
	'wetWeightKg',
	'seatHeightMm',
	'ridingPosition',
	'passengerAllowed',
	'seatCount',
	'licenseCategory',
	'msrpAmount',
	'availability'
] as const;
export type EvidenceField = (typeof EVIDENCE_FIELDS)[number];

export interface Evidence {
	fields: Record<EvidenceField, FieldStatus>;
	image: ImageStatus;
	availability: Availability;
	/**
	 * Whether the machine exists on the Dutch market at all. `NL` when the
	 * registry has examples; `NOT_NL` when only an encyclopedia knows it — a
	 * Kawasaki ZX-25R is a real motorcycle nobody here can buy; `UNKNOWN` for
	 * sources that say nothing about markets.
	 */
	market: 'NL' | 'NOT_NL' | 'UNKNOWN';
	/** Whether the price is for a model year still on sale, or a historical list price. */
	priceCurrency: 'CURRENT' | 'HISTORICAL' | 'NONE';
}

export interface EvidenceInput {
	/** Merged values for the generation. */
	values: Record<string, unknown>;
	fieldSources: Record<string, string>;
	fieldConfidence: Record<string, number>;
	conflicts: Record<string, unknown[]>;
	/** How the identity was established. */
	identity: { curated: boolean; sources: string[]; registrations: number };
	boundarySource: 'CURATED' | 'DETECTED' | 'UNKNOWN';
	/** Scope of the primary image, if there is one. */
	primaryImage?: { scope: 'MODEL_YEAR' | 'GENERATION' | 'FAMILY'; suspicious: boolean } | null;
	/** Whether the family has more than one generation. */
	divided: boolean;
	availability: Availability;
	msrpYear: number | null;
	now?: number;
}

/**
 * Registrations at or above this confidence were measured on enough examples
 * to count as verified. `sampleConfidence` reaches it at about ninety
 * registrations.
 */
const REGISTRY_VERIFIED_CONFIDENCE = 0.7;

/** A name with fewer registrations than this may be one clerk's spelling. */
const IDENTITY_THIN_REGISTRATIONS = 10;

export function assessEvidence(input: EvidenceInput): Evidence {
	const now = input.now ?? new Date().getFullYear();
	const v = input.values;
	const src = (field: string) => input.fieldSources[field];
	const conf = (field: string) => input.fieldConfidence[field] ?? 0;
	const has = (field: string) => v[field] !== null && v[field] !== undefined;
	const conflicting = (field: string) => Boolean(input.conflicts[field]?.length);

	// --- Identity ---------------------------------------------------------------
	let identity: FieldStatus;
	const independentSources = new Set(input.identity.sources).size;
	const registryOnly = input.identity.sources.every((s) => s === 'rdw');
	if (input.identity.curated || independentSources >= 2) identity = 'VERIFIED';
	// A registry name is what a clerk typed; below a few dozen registrations it
	// may be one clerk's spelling of something else. Any other source stated
	// the name as a name.
	else if (registryOnly && input.identity.registrations < IDENTITY_THIN_REGISTRATIONS)
		identity = 'INFERRED';
	else identity = 'HIGH';

	const generation: FieldStatus =
		input.boundarySource === 'CURATED'
			? 'VERIFIED'
			: input.boundarySource === 'DETECTED'
				? 'HIGH'
				: 'UNKNOWN';

	// --- Category ---------------------------------------------------------------
	let category: FieldStatus = 'UNKNOWN';
	if (has('category') && v.category !== 'OTHER') {
		const s = src('category');
		category =
			s === 'curated' || s === 'manufacturer'
				? 'VERIFIED'
				: s === 'wikipedia' || s === 'wikipedia-de'
					? 'HIGH'
					: 'INFERRED';
	}

	// --- Measured on the machines: registry with enough examples is verified ---
	const measured = (field: string): FieldStatus => {
		if (!has(field)) return 'UNKNOWN';
		if (conflicting(field)) return 'CONFLICTING';
		const s = src(field);
		if (s === 'manufacturer') return 'VERIFIED';
		if (s === 'rdw') return conf(field) >= REGISTRY_VERIFIED_CONFIDENCE ? 'VERIFIED' : 'HIGH';
		if (s === 'wikipedia' || s === 'wikipedia-de') return 'HIGH';
		if (s === 'sample') return 'INFERRED';
		return 'HIGH';
	};

	// --- Published specifications: the encyclopedia is the authority ------------
	const published = (field: string): FieldStatus => {
		if (!has(field)) return 'UNKNOWN';
		if (conflicting(field)) return 'CONFLICTING';
		const s = src(field);
		// The manufacturer's own specification, or an encyclopedia quoting it.
		if (s === 'manufacturer' || s === 'wikipedia' || s === 'wikipedia-de') return 'VERIFIED';
		// The registry's power is the highest of a handful of sampled registrations
		// — real, measured, and never as sure as a published figure.
		if (s === 'rdw') return 'HIGH';
		if (s === 'sample') return 'INFERRED';
		return 'HIGH';
	};

	// --- Derived facts ------------------------------------------------------------
	const ridingPosition: FieldStatus = !has('ridingPosition')
		? 'UNKNOWN'
		: ['wikipedia', 'wikipedia-de', 'category'].includes(src('ridingPosition'))
			? 'INFERRED'
			: 'HIGH';

	const licenseCategory: FieldStatus = !has('licenseCategory')
		? 'UNKNOWN'
		: src('licenseCategory') === 'rdw'
			? // Follows from measured power and capacity by law, so as good as they are.
				published('powerHp') === 'UNKNOWN'
				? 'INFERRED'
				: 'HIGH'
			: 'HIGH';

	// --- Registered facts ----------------------------------------------------------
	const registered = (field: string): FieldStatus => {
		if (!has(field)) return 'UNKNOWN';
		return src(field) === 'rdw' ? 'VERIFIED' : 'HIGH';
	};

	// --- Price -------------------------------------------------------------------
	let msrpAmount: FieldStatus = 'UNKNOWN';
	let priceCurrency: Evidence['priceCurrency'] = 'NONE';
	if (has('msrpAmount')) {
		msrpAmount =
			src('msrpAmount') === 'rdw' || src('msrpAmount') === 'manufacturer' ? 'VERIFIED' : 'HIGH';
		priceCurrency = input.msrpYear !== null && input.msrpYear >= now - 1 ? 'CURRENT' : 'HISTORICAL';
	}

	const availability: FieldStatus = input.availability === 'UNKNOWN' ? 'UNKNOWN' : 'VERIFIED';

	const market: Evidence['market'] =
		input.identity.registrations > 0 || input.identity.sources.includes('manufacturer')
			? 'NL'
			: input.identity.sources.length &&
				  input.identity.sources.every((s) => s === 'wikipedia' || s === 'wikipedia-de')
				? 'NOT_NL'
				: 'UNKNOWN';

	// --- Image -------------------------------------------------------------------
	let image: ImageStatus = 'NONE';
	if (input.primaryImage) {
		if (input.primaryImage.suspicious) image = 'SUSPICIOUS';
		else if (input.primaryImage.scope === 'MODEL_YEAR') image = 'MODEL_YEAR';
		else if (input.primaryImage.scope === 'GENERATION') image = 'GENERATION';
		// A photograph of the family is a photograph of this generation only
		// when the family has one. Otherwise it may show a different machine.
		else image = input.divided ? 'FAMILY_ONLY' : 'GENERATION';
	}

	return {
		fields: {
			identity,
			generation,
			category,
			displacementCc: measured('displacementCc'),
			powerHp: published('powerHp'),
			torqueNm: published('torqueNm'),
			wetWeightKg: measured('wetWeightKg'),
			seatHeightMm: published('seatHeightMm'),
			ridingPosition,
			passengerAllowed: registered('passengerAllowed'),
			seatCount: registered('seatCount'),
			licenseCategory,
			msrpAmount,
			availability
		},
		image,
		availability: input.availability,
		market,
		priceCurrency
	};
}

// ---------------------------------------------------------------------------
// Availability and years, from the registry's per-year first admissions
// ---------------------------------------------------------------------------

/**
 * Registrations in a year below this share of the family's best year are
 * stragglers — an import, old stock, a mis-typed date — and are not evidence
 * that the model was on sale that year. A 2005 motorcycle with one first
 * admission in 2026 was not available new in 2026.
 */
const STRAGGLER_SHARE = 0.05;
/** …but a genuinely low-volume model keeps every year with this many. */
const STRAGGLER_FLOOR = 3;

/** The years with enough first admissions to show the model was being sold. */
export function meaningfulYears(observations: readonly YearObservation[]): number[] {
	const peak = Math.max(0, ...observations.map((o) => o.registrationCount));
	const threshold = Math.min(STRAGGLER_FLOOR, Math.max(1, Math.ceil(peak * STRAGGLER_SHARE)));
	return observations
		.filter((o) => o.registrationCount >= threshold)
		.map((o) => o.year)
		.sort((a, b) => a - b);
}

/**
 * Whether the model is on sale new, from when examples were first put on the
 * road.
 *
 * The registry's `datum_eerste_toelating` is the date a machine was first
 * admitted anywhere, so a used import keeps its original year; first admissions
 * in the current year are therefore new sales, and their absence is the end of
 * them. NEW needs a meaningful number this year or last; USED needs the last
 * meaningful year to be older than that; a family too small to tell stays
 * UNKNOWN.
 */
export function assessAvailability(
	observations: readonly YearObservation[],
	now = new Date().getFullYear()
): Availability {
	const years = meaningfulYears(observations);
	if (!years.length) return 'UNKNOWN';
	const last = years[years.length - 1];
	if (last >= now - 1) return 'NEW';
	// A model whose meaningful years are all behind it has stopped — provided
	// it ever had enough registrations for "stopped" to mean something.
	const total = observations.reduce((sum, o) => sum + o.registrationCount, 0);
	return total >= 10 ? 'USED' : 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// Discovery eligibility
// ---------------------------------------------------------------------------

export type IneligibleReason =
	| 'no-image'
	| 'suspicious-image'
	| 'family-image-on-divided-family'
	| 'identity-thin'
	| 'not-on-dutch-market';

/**
 * Whether a card may enter a discovery round at all.
 *
 * The baseline is about the two things every round depends on: knowing what
 * the motorcycle is, and having a photograph of that motorcycle. Everything
 * else is the round's business — a round that filters on power excludes
 * unknown power by itself, and a round that does not should not lose a bike
 * over a figure it never asked about.
 *
 * A photograph that may be of another generation fails. That is the failure
 * this app cannot afford: a 2018 Z900 standing in for the 2025 one is a
 * confident, wrong answer to the only question the card asks.
 */
export function baselineEligibility(evidence: Evidence): {
	eligible: boolean;
	reasons: IneligibleReason[];
} {
	const reasons: IneligibleReason[] = [];

	if (evidence.image === 'NONE') reasons.push('no-image');
	else if (evidence.image === 'SUSPICIOUS') reasons.push('suspicious-image');
	else if (evidence.image === 'FAMILY_ONLY') reasons.push('family-image-on-divided-family');

	if (evidence.fields.identity === 'INFERRED') reasons.push('identity-thin');
	// A discovery round is for choosing a motorcycle to buy here. A model the
	// registry has never seen is browsable, not swipeable.
	if (evidence.market === 'NOT_NL') reasons.push('not-on-dutch-market');

	return { eligible: reasons.length === 0, reasons };
}

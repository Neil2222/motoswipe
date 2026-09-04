import { z } from 'zod';
import {
	ConditionScope,
	LicenseCategory,
	MotorcycleCategory,
	RidingPosition,
	CATEGORY_LABELS,
	LICENSE_LABELS,
	RIDING_POSITION_LABELS
} from './enums';

/**
 * Round filters.
 *
 * Every field is optional and an empty object is the explicit, first-class
 * "show me everything" state. Nothing here is ever required at round creation —
 * forcing a user to over-specify before they have seen a single bike defeats
 * the point of the product.
 *
 * This shape is stored verbatim in `DiscoveryRound.filters` (JSONB), so it is
 * inspectable in SQL and copied wholesale when a round is duplicated. Because
 * it is persisted, treat it as a versioned contract: add optional fields, never
 * repurpose an existing one.
 */

/**
 * Numeric bounds arrive from HTML forms, where a cleared field is the empty
 * string rather than undefined. `preprocess` normalises that before coercion so
 * an untouched input means "no filter" instead of failing validation.
 */
const blankToUndefined = (v: unknown) =>
	v === '' || v === null || v === undefined ? undefined : v;

const optionalInt = (min: number, max: number) =>
	z.preprocess(blankToUndefined, z.coerce.number().int().min(min).max(max).optional());

const optionalNum = (min: number, max: number) =>
	z.preprocess(blankToUndefined, z.coerce.number().min(min).max(max).optional());

export const RoundFiltersSchema = z
	.object({
		/** NEW / USED / BOTH. Absent means the user does not care. */
		condition: z.enum(ConditionScope).optional(),

		priceMin: optionalNum(0, 1_000_000),
		priceMax: optionalNum(0, 1_000_000),
		/** ISO-4217. Prices are only comparable within one currency. */
		priceCurrency: z.string().length(3).toUpperCase().optional(),

		displacementMin: optionalInt(0, 5000),
		displacementMax: optionalInt(0, 5000),

		powerHpMin: optionalNum(0, 1000),
		powerHpMax: optionalNum(0, 1000),

		yearMin: optionalInt(1900, 2100),
		yearMax: optionalInt(1900, 2100),

		categories: z.array(z.enum(MotorcycleCategory)).max(32).optional(),
		/** Manufacturer ids (UUID). Empty/absent means every manufacturer. */
		manufacturerIds: z.array(z.uuid()).max(200).optional(),

		/**
		 * An explicit list of motorcycles, rather than a rule that selects them.
		 *
		 * This is how "settle it between the bikes in my garage" becomes a round.
		 * Every other filter here describes a property; this one names the deck
		 * outright, which is the only honest way to express a hand-picked set.
		 * Capped so a stored filter object stays a reasonable size.
		 */
		motorcycleIds: z.array(z.uuid()).max(500).optional(),

		/** Only show bikes that can legally/physically carry a passenger. */
		passengerRequired: z.boolean().optional(),

		ridingPositions: z.array(z.enum(RidingPosition)).max(8).optional(),
		licenseCategories: z.array(z.enum(LicenseCategory)).max(8).optional(),

		/**
		 * Rider-fit filtering is OFF unless the user explicitly turns it on.
		 * Seat height alone cannot decide whether a bike suits someone, so we
		 * never hide bikes on it by default. See FitService.
		 */
		seatHeightMaxMm: optionalInt(400, 1200),

		/**
		 * Motorcycles with no photograph.
		 *
		 * This app asks you to judge a bike on how it looks, so a card with no
		 * picture is not a question anybody can answer — it is a blank the user
		 * has to skip. The vehicle registry knows about thousands of machines
		 * nobody has photographed, and letting them into a deck would bury the
		 * ones you can actually swipe on.
		 *
		 * Absent means "leave them out". A round built for research rather than
		 * for looks can switch them back on.
		 */
		includeWithoutPhotos: z.boolean().optional(),

		/**
		 * Racing prototypes, streamliners, concept bikes, minibikes and military
		 * machines. Absent means "leave them out", which is the sensible default
		 * for someone choosing a motorcycle to actually own — a WWII half-track
		 * is a poor answer to "which of these do you want".
		 *
		 * A dream-garage round can switch them back on.
		 */
		includeNonRoad: z.boolean().optional()
	})
	.strip();

export type RoundFilters = z.infer<typeof RoundFiltersSchema>;

/**
 * Normalises a filter object: drops empty arrays and undefined values, and
 * swaps inverted min/max pairs rather than silently returning zero results.
 */
export function normalizeFilters(input: RoundFilters): RoundFilters {
	const f: RoundFilters = { ...input };

	const swap = <A extends keyof RoundFilters, B extends keyof RoundFilters>(a: A, b: B) => {
		const min = f[a] as number | undefined;
		const max = f[b] as number | undefined;
		if (typeof min === 'number' && typeof max === 'number' && min > max) {
			(f[a] as number) = max;
			(f[b] as number) = min;
		}
	};

	swap('priceMin', 'priceMax');
	swap('displacementMin', 'displacementMax');
	swap('powerHpMin', 'powerHpMax');
	swap('yearMin', 'yearMax');

	for (const key of Object.keys(f) as (keyof RoundFilters)[]) {
		const value = f[key];
		if (value === undefined || value === null || value === '') {
			delete f[key];
		} else if (Array.isArray(value) && value.length === 0) {
			delete f[key];
		}
	}

	// A currency on its own filters nothing; drop it unless a bound uses it.
	if (f.priceCurrency && f.priceMin === undefined && f.priceMax === undefined) {
		delete f.priceCurrency;
	}
	// BOTH is the same as not filtering at all — keep the stored object minimal.
	if (f.condition === 'BOTH') delete f.condition;
	if (f.passengerRequired === false) delete f.passengerRequired;
	// False is the default, so storing it adds nothing.
	if (f.includeNonRoad === false) delete f.includeNonRoad;
	if (f.includeWithoutPhotos === false) delete f.includeWithoutPhotos;

	return f;
}

/** True when the round is an unfiltered "show me everything" round. */
export function isUnfiltered(filters: RoundFilters): boolean {
	return Object.keys(normalizeFilters(filters)).length === 0;
}

/**
 * Human-readable one-line summary of a filter set, for round cards and the
 * results header. Returns `[]` for an unfiltered round; the caller decides how
 * to phrase "everything".
 */
export function describeFilters(
	filters: RoundFilters,
	manufacturerNames?: Map<string, string>
): string[] {
	const f = normalizeFilters(filters);
	const out: string[] = [];

	// A hand-picked deck is the whole story; the rest is detail.
	if (f.motorcycleIds?.length) {
		out.push(`${f.motorcycleIds.length} hand-picked motorcycles`);
	}

	if (f.condition) out.push(f.condition === 'NEW' ? 'New only' : 'Used only');

	const money = (n: number) => `${f.priceCurrency ?? ''}${n.toLocaleString('en-US')}`.trim();
	if (f.priceMin !== undefined && f.priceMax !== undefined)
		out.push(`${money(f.priceMin)}–${money(f.priceMax)}`);
	else if (f.priceMin !== undefined) out.push(`from ${money(f.priceMin)}`);
	else if (f.priceMax !== undefined) out.push(`up to ${money(f.priceMax)}`);

	if (f.displacementMin !== undefined && f.displacementMax !== undefined)
		out.push(`${f.displacementMin}–${f.displacementMax} cc`);
	else if (f.displacementMin !== undefined) out.push(`${f.displacementMin}+ cc`);
	else if (f.displacementMax !== undefined) out.push(`max ${f.displacementMax} cc`);

	if (f.powerHpMin !== undefined && f.powerHpMax !== undefined)
		out.push(`${f.powerHpMin}–${f.powerHpMax} hp`);
	else if (f.powerHpMin !== undefined) out.push(`${f.powerHpMin}+ hp`);
	else if (f.powerHpMax !== undefined) out.push(`max ${f.powerHpMax} hp`);

	if (f.yearMin !== undefined && f.yearMax !== undefined) out.push(`${f.yearMin}–${f.yearMax}`);
	else if (f.yearMin !== undefined) out.push(`${f.yearMin} and newer`);
	else if (f.yearMax !== undefined) out.push(`${f.yearMax} and older`);

	if (f.categories?.length) {
		out.push(
			f.categories.length <= 3
				? f.categories.map((c) => CATEGORY_LABELS[c]).join(', ')
				: `${f.categories.length} categories`
		);
	}

	if (f.manufacturerIds?.length) {
		const named = manufacturerNames
			? f.manufacturerIds.map((id) => manufacturerNames.get(id)).filter(Boolean)
			: [];
		out.push(
			named.length && named.length <= 3
				? named.join(', ')
				: `${f.manufacturerIds.length} manufacturer${f.manufacturerIds.length === 1 ? '' : 's'}`
		);
	}

	if (f.passengerRequired) out.push('Passenger capable');
	if (f.ridingPositions?.length)
		out.push(f.ridingPositions.map((p) => RIDING_POSITION_LABELS[p]).join(', '));
	if (f.licenseCategories?.length)
		out.push(f.licenseCategories.map((l) => LICENSE_LABELS[l]).join(', '));
	if (f.seatHeightMaxMm !== undefined) out.push(`seat ≤ ${f.seatHeightMaxMm} mm`);
	if (f.includeNonRoad) out.push('Includes race and concept bikes');
	if (f.includeWithoutPhotos) out.push('Includes bikes with no photo');

	return out;
}

import { RoundFiltersSchema, normalizeFilters, type RoundFilters } from '$lib/domain/filters';

/**
 * Reads round filters out of a FormData.
 *
 * Shared by the round form action and the live deck-count endpoint so both read
 * the same field names — a mismatch there would show a count that does not
 * match the round you actually get.
 *
 * Empty and absent values are omitted entirely rather than passed as empty
 * strings, so an untouched form parses to `{}`: the "show me everything" round.
 */

const SINGLE_FIELDS = [
	'condition',
	'priceMin',
	'priceMax',
	'priceCurrency',
	'displacementMin',
	'displacementMax',
	'powerHpMin',
	'powerHpMax',
	'yearMin',
	'yearMax',
	'seatHeightMaxMm'
] as const;

const MULTI_FIELDS = [
	'categories',
	'manufacturerIds',
	'ridingPositions',
	'licenseCategories'
] as const;

export function readFilterForm(form: FormData): Record<string, unknown> {
	const raw: Record<string, unknown> = {};

	for (const key of SINGLE_FIELDS) {
		const value = form.get(key);
		if (value !== null && String(value).trim() !== '') raw[key] = value;
	}

	for (const key of MULTI_FIELDS) {
		const values = form.getAll(key).map(String).filter(Boolean);
		if (values.length) raw[key] = values;
	}

	if (form.get('passengerRequired') === 'on') raw.passengerRequired = true;
	if (form.get('includeNonRoad') === 'on') raw.includeNonRoad = true;
	if (form.get('includeWithoutPhotos') === 'on') raw.includeWithoutPhotos = true;

	return raw;
}

/** Parses and normalises, or returns null when the input is not valid. */
export function parseFilterForm(form: FormData): RoundFilters | null {
	const parsed = RoundFiltersSchema.safeParse(readFilterForm(form));
	if (!parsed.success) return null;
	return normalizeFilters(parsed.data);
}

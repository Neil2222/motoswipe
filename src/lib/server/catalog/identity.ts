import { normalizeBrand, normalizeModel, stripBrandPrefix } from '../importers/match';
import { CURATED, type CuratedModel } from './curated';
import type { MotorcycleCategory } from '$lib/domain/enums';

/**
 * Deciding which source records describe the same motorcycle.
 *
 * A vehicle registry, an encyclopedia and a manufacturer's site all name the
 * same machine differently, and some of those differences are meaningless while
 * others are the whole point:
 *
 *   Z900 / Z900 ABS          — same motorcycle, one has a trim marker
 *   MT-07 / MTN690           — same motorcycle, one is a registry type code
 *   Z900 / Z900RS            — different motorcycles that share four characters
 *   Z650 (1976) / Z650 (2017) — different motorcycles that share every character
 *
 * Nothing about the strings distinguishes the last two cases from the first
 * two, so identity is built from three things instead:
 *
 *  1. **A normalised name**, which handles spacing, punctuation, corporate
 *     suffixes and unambiguous trim markers. Pure string work, always safe.
 *  2. **Curated aliases**, for the connections that are facts about motorcycles
 *     rather than facts about strings. See `curated.ts`.
 *  3. **An era**, so a name reused a generation later does not collapse into
 *     the machine that had it first.
 *
 * Everything here is pure. The database never appears; the rules that decide
 * what merges with what are cheap to test and expensive to get wrong.
 */

/**
 * Trim and homologation markers that never distinguish one motorcycle from
 * another.
 *
 * Kept short on purpose. Every entry is a word that no motorcycle is named
 * after: "ABS" is a brake system, "DCT" a gearbox, "E5" an emissions class.
 * Adding "R" or "S" or "GT" here would quietly merge the CB1000R into the
 * CB1000 and the Tracer 9 GT into the Tracer 9, which are different machines.
 */
const TRIM_MARKERS = [
	'abs',
	'dct',
	'e4',
	'e5',
	'euro4',
	'euro5',
	'eu4',
	'eu5',
	'a2',
	'lams',
	'35kw',
	'25kw',
	'restricted',
	'geremd'
];

/** A name that is only a trim marker leaves nothing to identify a bike by. */
const TRIM_ONLY = new RegExp(`^(${TRIM_MARKERS.join('|')})$`, 'i');

/**
 * Strips trim markers from a model name, as whole words.
 *
 * "Z900 ABS" and "Ninja 650 ABS" lose theirs; "Absolut" and "Dctron" keep every
 * letter, because the match is on word boundaries and not on substrings.
 */
export function stripTrimMarkers(model: string): string {
	const words = model
		.split(/[\s/]+/)
		.filter((word) => word && !TRIM_MARKERS.includes(word.toLowerCase().replace(/[^a-z0-9]/g, '')));

	const stripped = words.join(' ').trim();
	// Never strip a name out of existence.
	return stripped || model.trim();
}

// ---------------------------------------------------------------------------
// Curated lookups
// ---------------------------------------------------------------------------

/** `brand|normalisedAlias` → the curated entry that claims it. */
const ALIAS_INDEX = new Map<string, CuratedModel>();
/** `brand|normalisedCanonical` → the curated entry. */
const CANONICAL_INDEX = new Map<string, CuratedModel>();

/** Per brand, every registry type code and the entry that claims it. */
const TYPE_CODE_INDEX = new Map<string, { code: string; entry: CuratedModel }[]>();

for (const entry of CURATED) {
	const canonicalKey = `${entry.brand}|${normalizeModel(entry.canonical)}`;
	CANONICAL_INDEX.set(canonicalKey, entry);
	ALIAS_INDEX.set(canonicalKey, entry);

	for (const alias of entry.aliases ?? []) {
		const key = `${entry.brand}|${normalizeModel(stripTrimMarkers(alias))}`;
		// First entry wins, so an alias listed under two models is a curation
		// bug that shows up as a stable result rather than an order-dependent one.
		if (!ALIAS_INDEX.has(key)) ALIAS_INDEX.set(key, entry);
	}

	for (const code of entry.typeCodes ?? []) {
		const codes = TYPE_CODE_INDEX.get(entry.brand) ?? [];
		codes.push({ code: normalizeTypeCode(code), entry });
		TYPE_CODE_INDEX.set(entry.brand, codes);
	}
}

// Longest code first, so `CB1000R` is tried before `CB1000`.
for (const codes of TYPE_CODE_INDEX.values()) {
	codes.sort((a, b) => b.code.length - a.code.length);
}

/** Type codes compare without punctuation: `GSX-S1000` and `GSXS1000` are one. */
function normalizeTypeCode(code: string): string {
	return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Every curated entry whose type code a model name starts with, best first.
 *
 * Only the first word counts — a type code is the whole of what a registry
 * clerk typed, before any suffix or bracketed marketing name — and whatever
 * follows the code must be letters: the "-U" in "MTN690-U" is an A2 version of
 * the same machine, but the "4" in "CRF1100A4" is a different model with its
 * own entry.
 */
function entriesByTypeCode(brand: string, model: string): CuratedModel[] {
	const codes = TYPE_CODE_INDEX.get(brand);
	if (!codes) return [];

	const firstWord = model.trim().split(/[\s(]+/)[0] ?? '';
	const token = normalizeTypeCode(firstWord);
	if (!token) return [];

	const matches: CuratedModel[] = [];
	for (const { code, entry } of codes) {
		if (!token.startsWith(code)) continue;
		if (/\d/.test(token.slice(code.length))) continue;
		if (!matches.includes(entry)) matches.push(entry);
	}
	return matches;
}

/**
 * The curated entry for a name, if there is one.
 *
 * Era-aware: "Street Triple 765" and "Street Triple 675" are both reachable
 * from names that look alike, and the record's own years decide between them.
 */
export function findCurated(
	manufacturer: string,
	model: string,
	era?: Era
): CuratedModel | undefined {
	const brand = normalizeBrand(manufacturer);
	const withoutBrand = stripBrandPrefix(manufacturer, model);
	const bare = normalizeModel(stripTrimMarkers(withoutBrand));

	// An exact alias is the stronger claim; a type code only applies when
	// nobody has written the exact spelling down.
	const byCode = entriesByTypeCode(brand, withoutBrand);
	const direct = ALIAS_INDEX.get(`${brand}|${bare}`) ?? byCode[0];

	if (!direct) return undefined;

	// A curated entry that pins a generation only claims records from it.
	if (era && !eraFitsCurated(era, direct)) {
		// Another entry with the same name or code may cover this era instead.
		const sameName = CURATED.filter(
			(entry) =>
				entry.brand === brand &&
				(normalizeModel(entry.canonical) === bare ||
					(entry.aliases ?? []).some((a) => normalizeModel(stripTrimMarkers(a)) === bare) ||
					byCode.includes(entry))
		);
		return sameName.find((entry) => eraFitsCurated(era, entry));
	}

	return direct;
}

function eraFitsCurated(era: Era, entry: CuratedModel): boolean {
	if (entry.yearFrom === undefined && entry.yearTo === undefined) return true;
	const from = entry.yearFrom ?? -Infinity;
	const to = entry.yearTo ?? Infinity;
	const recordFrom = era.from ?? -Infinity;
	const recordTo = era.to ?? Infinity;
	return recordFrom <= to && recordTo >= from;
}

// ---------------------------------------------------------------------------
// Era
// ---------------------------------------------------------------------------

/**
 * When a source's record is about.
 *
 * Production years where a source knows them, otherwise the span over which
 * examples were registered. The two are not the same measurement and are not
 * treated as one: see `erasCompatible`.
 */
export interface Era {
	from?: number;
	to?: number;
	/** True when the years describe registrations rather than production. */
	fromRegistrations?: boolean;
}

/**
 * How far apart two eras can sit and still be the same motorcycle.
 *
 * A registry only knows when examples were put on the road, which for an
 * imported classic can be decades after it was built. Production years are
 * exact. So the tolerance is wide enough to absorb that lag and narrow enough
 * to keep a 1976 Z650 away from a 2017 one.
 */
const ERA_GAP_YEARS = 12;

export function erasCompatible(a: Era, b: Era): boolean {
	// A record with no era makes no claim and merges with anything.
	if (a.from === undefined && a.to === undefined) return true;
	if (b.from === undefined && b.to === undefined) return true;

	const aFrom = a.from ?? a.to!;
	const aTo = a.to ?? a.from!;
	const bFrom = b.from ?? b.to!;
	const bTo = b.to ?? b.from!;

	// Overlapping intervals are the same era, whatever they measure.
	if (aFrom <= bTo && bFrom <= aTo) return true;

	// Otherwise the gap decides. Registrations lag production, so a registry
	// span that starts after a production span ends is expected, not evidence
	// of a different machine — as long as the lag is plausible.
	const gap = aFrom > bTo ? aFrom - bTo : bFrom - aTo;
	return gap <= ERA_GAP_YEARS;
}

/** A short label for the generation, used in the identity key and in the UI. */
export function eraLabel(era: Era): string {
	if (era.from === undefined && era.to === undefined) return '';
	if (era.from === undefined) return `-${era.to}`;
	// Bucketed to a decade so two records describing the same generation with
	// slightly different years still produce the same key.
	return String(Math.floor(era.from / 10) * 10);
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export interface Identity {
	key: string;
	brand: string;
	/** `normalizeModel` of the canonical name: the family half of the key. */
	modelKey: string;
	/** True when a curated entry fixed the years, so the key is final. */
	pinned: boolean;
	/** The name this machine should be displayed under. */
	canonicalModel: string;
	/** Set when a curated entry decided the name or the category. */
	curated?: CuratedModel;
	category?: MotorcycleCategory;
	era: Era;
}

/**
 * The canonical identity of one source record.
 *
 * The key is `brand|model|generation`. Generation is only part of it when the
 * record actually says something about its era — a record with no years merges
 * with whatever else shares its name, which is the right default when there is
 * nothing to distinguish on.
 */
export function identify(input: {
	manufacturerName: string;
	model: string;
	era?: Era;
}): Identity | null {
	const brand = normalizeBrand(input.manufacturerName);
	const era = input.era ?? {};

	const withoutBrand = stripBrandPrefix(input.manufacturerName, input.model);
	const trimmed = stripTrimMarkers(withoutBrand);

	if (!brand || !trimmed || TRIM_ONLY.test(trimmed)) return null;

	const curated = findCurated(input.manufacturerName, input.model, era);
	const canonicalModel = curated?.canonical ?? trimmed;
	const modelKey = normalizeModel(canonicalModel);

	if (!modelKey) return null;

	// A curated entry that pins years is itself the generation, so its key does
	// not need a bucket bolted on — and must not have one, or the same machine
	// keyed from a production year and a registration year would split.
	const generation = curated?.yearFrom !== undefined ? `c${curated.yearFrom}` : eraLabel(era);

	return {
		key: generation ? `${brand}|${modelKey}|${generation}` : `${brand}|${modelKey}`,
		brand,
		modelKey,
		pinned: curated?.yearFrom !== undefined,
		canonicalModel,
		curated,
		category: curated?.category,
		era
	};
}

/**
 * Whether two records should become one motorcycle.
 *
 * Both halves have to agree: the same canonical name, and eras that can belong
 * to one machine. Name alone is what put a 1976 Kawasaki Z650 and a 2017 one in
 * the same row.
 */
export function sameMotorcycle(
	a: { manufacturerName: string; model: string; era?: Era },
	b: { manufacturerName: string; model: string; era?: Era }
): boolean {
	const ia = identify(a);
	const ib = identify(b);
	if (!ia || !ib) return false;
	if (ia.brand !== ib.brand) return false;
	if (normalizeModel(ia.canonicalModel) !== normalizeModel(ib.canonicalModel)) return false;
	return erasCompatible(ia.era, ib.era);
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/**
 * Groups records into the motorcycles they describe.
 *
 * `identify` works one record at a time, and its era bucket is a decade — so
 * "F 900 R", first registered in 2019, and "F900R", first registered in 2020,
 * landed in different buckets and became two motorcycles. Whether two records
 * are the same machine is a question about the pair, not about either one, so
 * the grouping has to see them together.
 *
 * Records a curated entry pinned to a generation keep that key. Everything
 * else is grouped by name and then clustered by era: a record joins the first
 * cluster whose years it is compatible with, and the cluster's span grows to
 * include it. Records with no era at all join the largest cluster of their
 * name, which is the right default when there is nothing to distinguish on.
 */
export function groupByIdentity<T extends { identity: Identity }>(
	records: readonly T[]
): Map<string, T[]> {
	const groups = new Map<string, T[]>();
	const byName = new Map<string, T[]>();

	for (const record of records) {
		if (record.identity.pinned) {
			groups.set(record.identity.key, [...(groups.get(record.identity.key) ?? []), record]);
			continue;
		}
		const name = `${record.identity.brand}|${record.identity.modelKey}`;
		byName.set(name, [...(byName.get(name) ?? []), record]);
	}

	for (const [name, named] of byName) {
		const dated = named
			.filter((r) => r.identity.era.from !== undefined || r.identity.era.to !== undefined)
			.sort(
				(a, b) =>
					(a.identity.era.from ?? a.identity.era.to!) - (b.identity.era.from ?? b.identity.era.to!)
			);
		const undated = named.filter((r) => !dated.includes(r));

		const clusters: { era: Era; records: T[] }[] = [];
		for (const record of dated) {
			const cluster = clusters.find((c) => erasCompatible(c.era, record.identity.era));
			if (cluster) {
				cluster.records.push(record);
				cluster.era = {
					from: Math.min(cluster.era.from ?? Infinity, record.identity.era.from ?? Infinity),
					to: Math.max(cluster.era.to ?? -Infinity, record.identity.era.to ?? -Infinity)
				};
			} else {
				clusters.push({ era: { ...record.identity.era }, records: [record] });
			}
		}

		if (!clusters.length) {
			groups.set(name, undated);
			continue;
		}

		const largest = [...clusters].sort((a, b) => b.records.length - a.records.length)[0];
		largest.records.push(...undated);

		for (const cluster of clusters) {
			const key = `${name}|${eraLabel(cluster.era)}`;
			groups.set(key, [...(groups.get(key) ?? []), ...cluster.records]);
		}
	}

	return groups;
}

import { prisma } from '../db/client';
import { imageIdentityKey } from '../images/identity';
import { rejectedImage } from './curated';
import { slugify } from '../utils/slug';
import { upsertManufacturer } from '../importers/import.service';
import type { NormalizedImage, NormalizedMotorcycle } from '../importers/types';
import { groupByIdentity, identify, type Identity } from './identity';
import { namesADifferentMotorcycle } from '../importers/photos/commons-match';
import {
	MERGEABLE_FIELDS,
	mergeContributions,
	mergeTags,
	type Contribution,
	type MergeResult
} from './merge';
import { spanLabel, type YearObservation } from './boundaries';
import { findCuratedGenerations, planGenerations, type GenerationSpan } from './generations';
import { findCurated } from './identity';
import { assessAvailability, assessEvidence, meaningfulYears, type Evidence } from './evidence';
import { reassessImages } from './assess';
import { inferRidingPosition } from '../importers/providers/wikipedia/categories';
import { sampleConfidence } from '../importers/providers/rdw/rdw.provider';
import type { MotorcycleCategory } from '$lib/domain/enums';

/**
 * Turning source records into the motorcycles the deck shows.
 *
 * The catalogue has three layers. `SourceRecord` is what each provider said,
 * kept verbatim and never merged away. `ModelFamily` is the name a rider
 * uses — Kawasaki Z900 — across every year it was sold. `Motorcycle` is one
 * generation of that family: the thing that actually looks a particular way,
 * cost a particular amount, and is the only thing a round, a swipe or a garage
 * ever points at.
 *
 * Most families have exactly one generation, with `UNKNOWN` boundaries, and
 * that is the correct default: nobody has established where the generations
 * fall, so the catalogue does not claim to know. Families in
 * `generations.ts`, or whose registry numbers show an engine change, are
 * divided; the rest are not.
 *
 * Rebuilding is idempotent and safe to run whenever the identity rules or the
 * curated generations change: it reuses existing rows so swipes and saved
 * bikes survive, and retires rather than deletes anything left over.
 */

export interface RebuildResult {
	sourceRecords: number;
	/** Model families the records resolved to. */
	families: number;
	/** Generations — the rows the deck shows. */
	generations: number;
	created: number;
	updated: number;
	retired: number;
	/** Records whose identity could not be decided; they stay unattached. */
	unresolved: number;
	/** How many source records collapsed into a family with others. */
	collapsed: number;
	/** Families with more than one generation, by how the boundary was found. */
	split: { curated: number; detected: number };
	durationMs: number;
}

/** Every brand and model the catalogue holds, for vetting photographs. */
interface Catalogue {
	brands: Set<string>;
	modelsByBrand: Map<string, string[]>;
}

/** A source record as the rebuild needs it. */
interface LoadedRecord {
	id: string;
	source: string;
	externalId: string;
	manufacturerName: string;
	model: string;
	eraFrom: number | null;
	eraTo: number | null;
	payload: NormalizedMotorcycle;
	confidence: Partial<Record<string, number>>;
	identity: Identity;
}

/** What is already in the database for a motorcycle row. */
interface ExistingRow {
	id: string;
	identityKey: string | null;
	source: string;
	externalId: string | null;
	generationFrom: number | null;
	generationTo: number | null;
	manuallyEdited: boolean;
	protectedFields: string[];
	swipes: number;
}

type ImageScope = 'MODEL_YEAR' | 'GENERATION' | 'FAMILY';

/** One photograph and what it is evidence of. */
interface PooledImage {
	url: string;
	scope: ImageScope;
	modelYear: number | null;
	source: string | null;
	sourceUrl: string | null;
	width: number | null;
	height: number | null;
	imageType: string | null;
	attribution: string | null;
	evidence: string | null;
	license: string | null;
	/** Where the provider put it, for stable ordering. */
	order: number;
}

export async function rebuildCatalogue(
	options: { onProgress?: (done: number, total: number) => void } = {}
): Promise<RebuildResult> {
	const startedAt = Date.now();

	const raw = await prisma.sourceRecord.findMany({
		select: {
			id: true,
			source: true,
			externalId: true,
			manufacturerName: true,
			model: true,
			eraFrom: true,
			eraTo: true,
			payload: true,
			confidence: true
		}
	});

	// The rebuild must be a pure function of the source records. Postgres hands
	// rows back in whatever physical order it likes, and the first record of a
	// family names it, so without an explicit order two rebuilds of the same
	// data could disagree about whether a bike is the "ZX-6R" or the "ZX 6R".
	// An encyclopedia's spelling beats a maker's page beats a registry's code.
	raw.sort(
		(a, b) =>
			nameSourceRank(a.source) - nameSourceRank(b.source) ||
			a.source.localeCompare(b.source) ||
			a.externalId.localeCompare(b.externalId)
	);

	// --- 1. Give every record an identity, then group them into families -------
	const loaded: LoadedRecord[] = [];
	let unresolved = 0;

	for (const row of raw) {
		const identity = identify({
			manufacturerName: row.manufacturerName,
			model: row.model,
			era: { from: row.eraFrom ?? undefined, to: row.eraTo ?? undefined }
		});
		if (!identity) {
			unresolved++;
			continue;
		}
		loaded.push({
			...row,
			payload: row.payload as unknown as NormalizedMotorcycle,
			confidence: (row.confidence ?? {}) as Partial<Record<string, number>>,
			identity
		});
	}

	const families = groupByIdentity(loaded);

	// --- 2. Index what already exists, so rows are reused not recreated --------
	const existing = await prisma.motorcycle.findMany({
		select: {
			id: true,
			identityKey: true,
			source: true,
			externalId: true,
			generationFrom: true,
			generationTo: true,
			manuallyEdited: true,
			protectedFields: true,
			_count: { select: { swipes: true } }
		}
	});
	const rows: ExistingRow[] = existing.map((r) => ({ ...r, swipes: r._count.swipes }));

	/** Rows by the family their identity key belongs to. */
	const rowsByFamily = new Map<string, ExistingRow[]>();
	/** Rows that predate identity keys, by the provider record that made them. */
	const legacyBySourceKey = new Map<string, ExistingRow>();
	for (const row of rows) {
		if (row.identityKey) {
			const familyKey = row.identityKey.split('#')[0];
			rowsByFamily.set(familyKey, [...(rowsByFamily.get(familyKey) ?? []), row]);
		} else {
			legacyBySourceKey.set(`${row.source}|${row.externalId}`, row);
		}
	}

	const result: RebuildResult = {
		sourceRecords: raw.length,
		families: families.size,
		generations: 0,
		created: 0,
		updated: 0,
		retired: 0,
		unresolved,
		collapsed: 0,
		split: { curated: 0, detected: 0 },
		durationMs: 0
	};

	// What every other motorcycle in the catalogue is called. Only here does
	// anything know that, and it is what a photograph has to be checked against.
	const catalogue: Catalogue = { brands: new Set(), modelsByBrand: new Map() };
	for (const records of families.values()) {
		const { brand, canonicalModel } = records[0].identity;
		catalogue.brands.add(brand);
		catalogue.modelsByBrand.set(brand, [
			...(catalogue.modelsByBrand.get(brand) ?? []),
			canonicalModel
		]);
	}

	const keptMotorcycleIds = new Set<string>();
	let done = 0;

	for (const [familyKey, records] of families) {
		if (records.length > 1) result.collapsed += records.length - 1;

		const familyRows = [
			...(rowsByFamily.get(familyKey) ?? []),
			...records
				.map((r) => legacyBySourceKey.get(`${r.source}|${r.externalId}`))
				.filter((r): r is ExistingRow => Boolean(r))
		];

		const ids = await upsertFamily(familyKey, records, familyRows, catalogue, result);
		for (const id of ids) keptMotorcycleIds.add(id);

		done++;
		options.onProgress?.(done, families.size);
	}

	// --- 3. Retire rows nothing describes any more ------------------------------
	//
	// Never deleted: a swipe or a saved bike must not disappear because an
	// identity rule changed.
	const retired = await prisma.motorcycle.updateMany({
		where: { isActive: true, id: { notIn: [...keptMotorcycleIds] } },
		data: { isActive: false, retiredAt: new Date() }
	});
	result.retired = retired.count;

	result.durationMs = Date.now() - startedAt;
	return result;
}

// ---------------------------------------------------------------------------
// One family
// ---------------------------------------------------------------------------

async function upsertFamily(
	familyKey: string,
	records: LoadedRecord[],
	familyRows: ExistingRow[],
	catalogue: Catalogue,
	result: RebuildResult
): Promise<string[]> {
	const identity = familyIdentity(records);

	// The manufacturer name to display: the shortest a source used, which is
	// reliably the one a rider would say out loud.
	const manufacturerName =
		[...records]
			.map((r) => r.payload.manufacturerName)
			.filter(Boolean)
			.sort((a, b) => a.split(/\s+/).length - b.split(/\s+/).length || a.length - b.length)[0] ??
		identity.brand;

	const contributions: Contribution[] = records.map((record) => ({
		source: record.source,
		values: record.payload,
		confidence: record.confidence
	}));

	// The family-level merge: every source's best claim about the name as a whole.
	const merged = mergeContributions(contributions, { protectedFields: [] });
	if (identity.category) {
		merged.values.category = identity.category;
		merged.fieldSources.category = 'curated';
	}

	const manufacturerId = await upsertManufacturer(manufacturerName);
	const tags = mergeTags(contributions);
	const sourceUrl = records.find((r) => r.payload.sourceUrl)?.payload.sourceUrl ?? null;
	const source = dominantSource(merged.fieldSources, records);

	// --- The family's years, and how they divide ----------------------------
	const observations = aggregateYears(records);
	const spans = planGenerations({
		curated: findCuratedGenerations(identity.brand, identity.canonicalModel),
		observations,
		era: {
			from: (merged.values.firstRegistrationYear as number | undefined) ?? minEra(records),
			to: (merged.values.lastRegistrationYear as number | undefined) ?? maxEra(records)
		}
	});
	// A family nobody has years for is still one motorcycle.
	const generations: (GenerationSpan | null)[] = spans.length ? spans : [null];

	if (generations.length > 1) {
		if (generations.some((g) => g?.source === 'CURATED')) result.split.curated++;
		else result.split.detected++;
	}

	const family = await upsertModelFamily(familyKey, identity, manufacturerName, manufacturerId);

	// --- Which existing row becomes which generation -------------------------
	const assignment = assignRows(familyKey, generations, familyRows);

	// Identity keys are unique, so rows changing key must let go of the old one
	// before any row can take it.
	const changing = assignment.filter(
		(a) => a.row && a.row.identityKey !== a.key && a.row.identityKey !== null
	);
	if (changing.length) {
		await prisma.motorcycle.updateMany({
			where: { id: { in: changing.map((a) => a.row!.id) } },
			data: { identityKey: null }
		});
	}

	const ids: string[] = [];
	const rowBySpan = new Map<GenerationSpan | null, string>();
	const identitySources = [...new Set(records.map((r) => r.source))];
	const identityRegistrations = records.reduce(
		(sum, r) => sum + (r.payload.registrationCount ?? 0),
		0
	);

	// A generation is described by the sources whose own years touch it. The
	// maker's page is about the model year it names; its figures are not the
	// 2016 NC750X's, and must not be shown as such.
	const mergedFor = (span: GenerationSpan | null): MergeResult => {
		if (generations.length === 1 || !span) return merged;
		const own = contributionsForSpan(records, span);
		if (own.length === records.length) return merged;
		const m = mergeContributions(
			own.map((record) => ({
				source: record.source,
				values: record.payload,
				confidence: record.confidence
			})),
			{ protectedFields: [] }
		);
		if (identity.category) {
			m.values.category = identity.category;
			m.fieldSources.category = 'curated';
		}
		return m;
	};

	for (const { span, key, row } of assignment) {
		const values = generationValues(mergedFor(span), observations, span);
		const { availability, msrpYear, conflicts } = values;
		delete (values as Record<string, unknown>).availability;
		delete (values as Record<string, unknown>).msrpYear;
		delete (values as Record<string, unknown>).conflicts;

		// A riding position follows from the category closely enough to filter
		// on, and is recorded as the inference it is.
		if (!values.ridingPosition && values.category) {
			const inferred = inferRidingPosition(values.category as MotorcycleCategory);
			if (inferred) {
				values.ridingPosition = inferred;
				values.fieldSources.ridingPosition = 'category';
			}
		}

		// What the evidence amounts to. The image half is judged after the
		// photographs are placed; see `reassessImages` below.
		const evidence: Evidence = assessEvidence({
			values,
			fieldSources: values.fieldSources,
			fieldConfidence: values.fieldConfidence,
			conflicts,
			identity: {
				curated: Boolean(identity.curated),
				sources: identitySources,
				registrations: identityRegistrations
			},
			boundarySource: span?.source ?? 'UNKNOWN',
			primaryImage: null,
			divided: generations.length > 1,
			availability,
			msrpYear
		});

		// A human correction outranks every source. `manuallyEdited` protects the
		// whole row, not part of it.
		const protectedFields = new Set(
			row?.manuallyEdited ? MERGEABLE_FIELDS : (row?.protectedFields ?? [])
		);
		for (const field of protectedFields) delete values[field];

		// Start every mergeable field at null, then overlay what the merge
		// believes, so a field the sources no longer support does not linger.
		const cleared: Record<string, unknown> = {};
		for (const field of MERGEABLE_FIELDS) {
			if (field === 'category' || protectedFields.has(field)) continue;
			cleared[field] = null;
		}

		const label = span ? spanLabel(span.from, span.to) : null;

		const { fieldSources, fieldConfidence: _confidence, ...fields } = values;
		void _confidence;
		delete (fields as Record<string, unknown>).conflicts;
		const data = {
			...cleared,
			...fields,
			manufacturerId,
			model: identity.canonicalModel,
			category: (values.category as string | undefined) ?? 'OTHER',
			tags,
			identityKey: key,
			fieldSources,
			matchKey: `${identity.brand}|${identity.modelKey}`,
			sourceUrl,
			source,
			externalId: key,
			importedAt: new Date(),
			isActive: true,
			retiredAt: null,
			familyId: family.id,
			generationFrom: span?.from ?? null,
			generationTo: span?.to ?? null,
			boundarySource: span?.source ?? 'UNKNOWN',
			generationLabel: label,
			boundaryReason: span?.reason ?? null,
			boundaryReference: span?.reference ?? null,
			availability,
			availableNew: availability === 'NEW' ? true : availability === 'USED' ? false : null,
			msrpYear,
			evidence
		} as Record<string, unknown>;

		let id: string;
		if (row) {
			await prisma.motorcycle.update({ where: { id: row.id }, data: data as never });
			id = row.id;
			result.updated++;
		} else {
			const slug = await uniqueSlug(manufacturerName, identity.canonicalModel, span);
			const created = await prisma.motorcycle.create({
				data: { ...data, slug } as never,
				select: { id: true }
			});
			id = created.id;
			result.created++;
		}

		ids.push(id);
		rowBySpan.set(span, id);
		result.generations++;

		await syncModelYears(id, observations, span);
	}

	// --- Point each source record at the generation it describes -------------
	for (const record of records) {
		const span = spanForRecord(record, generations);
		const id = rowBySpan.get(span)!;
		await prisma.sourceRecord.update({
			where: { id: record.id },
			data: { motorcycleId: id, identityKey: assignment.find((a) => a.span === span)!.key }
		});
	}

	await syncFamilyImages(records, identity, catalogue, generations, rowBySpan, familyRows);

	// Now the photographs are where they belong, judge them and decide which
	// generations may enter a discovery round.
	await reassessImages(ids, () => vettingContext(identity, catalogue));

	return ids;
}

/**
 * The identity a family goes by.
 *
 * Every record in the group has the same normalised key; they differ in
 * spelling — the registry files one Kawasaki as "ZX-6R", "ZX 6R", "ZX6R" and
 * "Ninja ZX-6R" across its type approvals. The name shown is the one the
 * best-ranked source uses, and where that source uses several, the spelling
 * that most records agree on; then the one filed for the most years; then the
 * shortest; then alphabetical. Every step is a total order, so the same
 * records always give the same name.
 */
function familyIdentity(records: readonly LoadedRecord[]): Identity {
	const best = Math.min(...records.map((r) => nameSourceRank(r.source)));
	const counts = new Map<string, number>();
	for (const r of records) {
		counts.set(r.identity.canonicalModel, (counts.get(r.identity.canonicalModel) ?? 0) + 1);
	}
	// Years the registry filed each spelling under, summed: the entry that
	// lived longest is the one the market knew the machine by.
	const years = new Map<string, number>();
	for (const r of records) {
		const span = r.eraFrom !== null && r.eraTo !== null ? r.eraTo - r.eraFrom + 1 : 0;
		years.set(r.identity.canonicalModel, (years.get(r.identity.canonicalModel) ?? 0) + span);
	}
	const spelled = (r: LoadedRecord) => r.identity.canonicalModel;
	return [...records]
		.filter((r) => nameSourceRank(r.source) === best)
		.sort(
			(a, b) =>
				counts.get(spelled(b))! - counts.get(spelled(a))! ||
				years.get(spelled(b))! - years.get(spelled(a))! ||
				spelled(a).length - spelled(b).length ||
				spelled(a).localeCompare(spelled(b))
		)[0].identity;
}

/** Which source's spelling of a model name is preferred, lowest first. */
const NAME_SOURCE_ORDER = ['wikipedia', 'manufacturer', 'wikipedia-de'];
function nameSourceRank(source: string): number {
	const index = NAME_SOURCE_ORDER.indexOf(source);
	return index === -1 ? NAME_SOURCE_ORDER.length : index;
}

/** Everything a photograph of this family has to be checked against. */
function vettingContext(identity: Identity, catalogue: Catalogue) {
	return {
		manufacturerName: identity.brand,
		model: identity.canonicalModel,
		otherBrands: [...catalogue.brands],
		siblingModels: (catalogue.modelsByBrand.get(identity.brand) ?? []).filter(
			(m) => m !== identity.canonicalModel
		),
		aliases: findCurated(identity.brand, identity.canonicalModel)?.aliases ?? []
	};
}

/** The family row, created or renamed as needed. */
async function upsertModelFamily(
	familyKey: string,
	identity: Identity,
	manufacturerName: string,
	manufacturerId: string
): Promise<{ id: string }> {
	const found = await prisma.modelFamily.findUnique({
		where: { familyKey },
		select: { id: true, name: true, manufacturerId: true }
	});
	if (found) {
		if (found.name !== identity.canonicalModel || found.manufacturerId !== manufacturerId) {
			await prisma.modelFamily.update({
				where: { id: found.id },
				data: { name: identity.canonicalModel, manufacturerId }
			});
		}
		return found;
	}

	const base = slugify(`${manufacturerName} ${identity.canonicalModel}`);
	let slug = base;
	for (let i = 2; i < 60; i++) {
		const clash = await prisma.modelFamily.findUnique({ where: { slug }, select: { id: true } });
		if (!clash) break;
		slug = `${base}-${i}`;
	}

	return prisma.modelFamily.create({
		data: { familyKey, name: identity.canonicalModel, slug, manufacturerId },
		select: { id: true }
	});
}

// ---------------------------------------------------------------------------
// Rows and generations
// ---------------------------------------------------------------------------

interface Assignment {
	span: GenerationSpan | null;
	key: string;
	row: ExistingRow | undefined;
}

/**
 * Decides which existing row carries which generation.
 *
 * The point is that nothing a user did is lost. A row is matched by its key
 * first, then by the years it already covered, and a family's pre-generation
 * row — the one every swipe so far points at — becomes the generation that is
 * current, which is the one those swipes were most likely looking at. Rows left
 * over are retired by the caller, never deleted.
 */
function assignRows(
	familyKey: string,
	generations: (GenerationSpan | null)[],
	familyRows: ExistingRow[]
): Assignment[] {
	const free = new Set(familyRows);
	const take = (row: ExistingRow | undefined) => {
		if (row) free.delete(row);
		return row;
	};
	const best = (candidates: ExistingRow[]) =>
		[...candidates].sort((a, b) => b.swipes - a.swipes)[0];

	// One generation: the family's row is the generation's row.
	if (generations.length === 1) {
		const row =
			familyRows.find((r) => r.identityKey === familyKey) ??
			best(familyRows.filter((r) => r.identityKey?.startsWith(`${familyKey}#`))) ??
			best(familyRows);
		return [{ span: generations[0], key: familyKey, row: take(row) }];
	}

	const keyFor = (span: GenerationSpan | null) => (span ? `${familyKey}#${span.from}` : familyKey);
	const assignment: Assignment[] = generations.map((span) => ({
		span,
		key: keyFor(span),
		row: undefined
	}));

	// Exact key first.
	for (const a of assignment) {
		a.row = take([...free].find((r) => r.identityKey === a.key));
	}

	// Then by overlap of the years the row already covered.
	for (const a of assignment) {
		if (a.row || !a.span) continue;
		const span = a.span;
		const overlapping = [...free]
			.filter((r) => r.generationFrom !== null && r.generationTo !== null)
			.map((r) => ({
				row: r,
				overlap: Math.min(r.generationTo!, span.to) - Math.max(r.generationFrom!, span.from) + 1
			}))
			.filter((c) => c.overlap > 0)
			.sort((a, b) => b.overlap - a.overlap || b.row.swipes - a.row.swipes);
		a.row = take(overlapping[0]?.row);
	}

	// The undivided family row, with its history, becomes the current generation.
	const current = assignment[assignment.length - 1];
	if (!current.row) {
		current.row = take(
			[...free].find((r) => r.identityKey === familyKey) ??
				best([...free].filter((r) => r.generationFrom === null))
		);
	}

	return assignment;
}

/**
 * The records whose own years touch a generation. A record without years
 * speaks for the whole name; one dated outside the span — the maker's 2026
 * page against a 2016–2020 generation — does not. A span nothing dated touches
 * falls back to every record, so no generation is left without a source.
 */
export function contributionsForSpan<T extends { eraFrom: number | null; eraTo: number | null }>(
	records: readonly T[],
	span: GenerationSpan | null
): T[] {
	if (!span) return [...records];
	const touching = records.filter((record) => {
		const from = record.eraFrom ?? record.eraTo;
		if (from === null || from === undefined) return true;
		const to = record.eraTo ?? Number.MAX_SAFE_INTEGER;
		return from <= span.to && to >= span.from;
	});
	return touching.length ? touching : [...records];
}

/** The generation a source record's own years put it in. */
function spanForRecord(
	record: LoadedRecord,
	generations: (GenerationSpan | null)[]
): GenerationSpan | null {
	if (generations.length === 1) return generations[0];
	const from = record.eraFrom ?? record.eraTo;
	const to = record.eraTo ?? record.eraFrom;
	if (from === null || from === undefined || to === null || to === undefined) {
		return generations[generations.length - 1];
	}

	let bestSpan = generations[generations.length - 1];
	let bestOverlap = -Infinity;
	for (const span of generations) {
		if (!span) continue;
		const overlap = Math.min(span.to, to) - Math.max(span.from, from);
		if (overlap > bestOverlap) {
			bestOverlap = overlap;
			bestSpan = span;
		}
	}
	return bestSpan;
}

// ---------------------------------------------------------------------------
// Years
// ---------------------------------------------------------------------------

/**
 * Every source's per-year figures for one family, combined per year.
 *
 * Registrations add up across the registry's spellings of a name; the medians
 * are combined as a registration-weighted median of medians, which is exact
 * when one spelling dominates and a fair blend when none does. Power is the
 * maximum, for the same reason it is at the model level: a restricted example
 * can only ever fail to raise it.
 */
function aggregateYears(records: readonly LoadedRecord[]): AggregatedYear[] {
	const byYear = new Map<
		number,
		{
			registrations: number;
			cc: [number, number][];
			kg: [number, number][];
			price: [number, number][];
			power: number[];
		}
	>();

	for (const record of records) {
		for (const year of record.payload.modelYears ?? []) {
			const entry = byYear.get(year.year) ?? {
				registrations: 0,
				cc: [],
				kg: [],
				price: [],
				power: []
			};
			entry.registrations += year.registrationCount;
			const w = Math.max(year.registrationCount, 1);
			if (year.medianDisplacementCc) entry.cc.push([year.medianDisplacementCc, w]);
			if (year.medianMassKg) entry.kg.push([year.medianMassKg, w]);
			if (year.medianPriceEur) entry.price.push([year.medianPriceEur, w]);
			if (year.maxPowerKw) entry.power.push(year.maxPowerKw);
			byYear.set(year.year, entry);
		}
	}

	return [...byYear.entries()]
		.map(([year, e]) => ({
			year,
			registrationCount: e.registrations,
			medianDisplacementCc: weightedMedian(e.cc),
			medianMassKg: weightedMedian(e.kg),
			medianPriceEur: weightedMedian(e.price),
			maxPowerKw: e.power.length ? Math.max(...e.power) : null
		}))
		.sort((a, b) => a.year - b.year);
}

/** A year with the figures the registry adds beyond what boundaries need. */
type AggregatedYear = YearObservation & {
	medianMassKg: number | null;
	medianPriceEur: number | null;
};

function weightedMedian(pairs: [number, number][]): number | null {
	if (!pairs.length) return null;
	const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
	const total = sorted.reduce((sum, [, w]) => sum + w, 0);
	let seen = 0;
	for (const [value, w] of sorted) {
		seen += w;
		if (seen * 2 >= total) return value;
	}
	return sorted[sorted.length - 1][0];
}

/**
 * The values one generation carries.
 *
 * Starts from the family-level merge and then, for the fields the registry
 * won, narrows to the generation's own years: the price of a 2025 Z900 rather
 * than the median across nine years of them, and the registrations that are
 * actually of this generation. A field another source won is left alone —
 * a published seat height is the same across a restyle, and per-year registry
 * figures are not evidence against a specification.
 */
function generationValues(
	merged: MergeResult,
	observations: readonly AggregatedYear[],
	span: GenerationSpan | null
): Record<string, unknown> & {
	fieldSources: Record<string, string>;
	fieldConfidence: Record<string, number>;
	conflicts: MergeResult['conflicts'];
	availability: 'NEW' | 'USED' | 'UNKNOWN';
	msrpYear: number | null;
} {
	const values: Record<string, unknown> = { ...merged.values };
	const fieldSources: Record<string, string> = { ...merged.fieldSources };
	const fieldConfidence: Record<string, number> = { ...merged.fieldConfidence };
	const conflicts: MergeResult['conflicts'] = { ...merged.conflicts };
	let availability: 'NEW' | 'USED' | 'UNKNOWN' = 'UNKNOWN';
	let msrpYear: number | null = null;

	const years = span
		? observations.filter((o) => o.year >= span.from && o.year <= span.to)
		: observations;

	if (years.length) {
		const registered = years.filter((y) => y.registrationCount > 0);
		const total = registered.reduce((sum, y) => sum + y.registrationCount, 0);
		const registryOwns = (field: string) =>
			fieldSources[field] === undefined || fieldSources[field] === 'rdw';

		const set = (field: string, value: unknown, confidence = sampleConfidence(total)) => {
			if (value === null || value === undefined) return;
			if (!registryOwns(field)) return;
			values[field] = value;
			fieldSources[field] = 'rdw';
			fieldConfidence[field] = confidence;
		};

		set('registrationCount', total, 1);

		// The years the model was actually being sold: first admissions in
		// meaningful numbers. One straggler dated 2026 does not extend a 2005
		// motorcycle's life by twenty years.
		const sold = meaningfulYears(registered);
		set('firstRegistrationYear', sold[0], 1);
		set('lastRegistrationYear', sold[sold.length - 1], 1);
		availability = assessAvailability(registered);

		const weighted = (pick: (y: AggregatedYear) => number | null | undefined) =>
			weightedMedian(
				registered
					.map(
						(y) =>
							[pick(y), Math.max(y.registrationCount, 1)] as [number | null | undefined, number]
					)
					.filter((p): p is [number, number] => typeof p[0] === 'number')
			);

		set(
			'displacementCc',
			weighted((y) => y.medianDisplacementCc)
		);
		set(
			'wetWeightKg',
			weighted((y) => y.medianMassKg)
		);

		// The list price of the latest model year that has one: what this
		// generation cost at the end of its run, or costs now. A median over
		// nine years of price rises is a number nobody was ever charged.
		const priced = registered.filter((y) => y.medianPriceEur);
		const latest = priced[priced.length - 1];
		if (latest && registryOwns('msrpAmount')) {
			set('msrpAmount', latest.medianPriceEur, sampleConfidence(latest.registrationCount));
			msrpYear = latest.year;
			values.msrpCurrency = 'EUR';
			fieldSources.msrpCurrency = 'rdw';
		}

		const power = registered.map((y) => y.maxPowerKw).filter((kw): kw is number => !!kw);
		// A published figure normally wins. But an encyclopedia article covers a
		// name, and the registry measured *this generation*: where the two are
		// materially apart, the article is describing a different machine that
		// shares the name — the 1999 YZF-R7 is not the 2022 one, the German
		// "Kawasaki Z 400" article opens with the 1973 machine — and the
		// registry's figure stands, with the disagreement kept on record.
		const published = values.powerKw as number | undefined;
		const registryKw = power.length ? Math.max(...power) : undefined;
		const materiallyApart =
			published !== undefined &&
			registryKw !== undefined &&
			Math.abs(published - registryKw) / published > 0.2;
		const encyclopedia = fieldSources.powerKw;
		if (materiallyApart && (encyclopedia === 'wikipedia' || encyclopedia === 'wikipedia-de')) {
			conflicts.powerHp = [
				{ source: 'rdw', value: Math.round((registryKw! / 0.7457) * 10) / 10 },
				{ source: encyclopedia, value: values.powerHp as number }
			];
			fieldSources.powerKw = 'rdw';
			fieldSources.powerHp = 'rdw';
		}
		if (power.length && registryOwns('powerKw') && registryOwns('powerHp')) {
			const kw = Math.max(...power);
			values.powerKw = kw;
			values.powerHp = Math.round((kw / 0.7457) * 10) / 10;
			fieldSources.powerKw = 'rdw';
			fieldSources.powerHp = 'rdw';
			// Sampled from a few registrations per year, never a published figure.
			fieldConfidence.powerKw = 0.45;
			fieldConfidence.powerHp = 0.45;
		}

		// Availability is decided from the same years; the column is set by the
		// caller from `availability`, never guessed from a last registration.
		// The one thing that outranks the registry is the maker's own current
		// catalogue: a model page online today is a model on sale today, for the
		// generation that page describes.
		const listedNow =
			fieldSources.availableNew === 'manufacturer' &&
			values.availableNew === true &&
			(span === null ||
				span.to >= new Date().getFullYear() - 1 ||
				registered[registered.length - 1]?.year >= new Date().getFullYear() - 1);
		if (listedNow) availability = 'NEW';
		delete values.availableNew;
		delete fieldSources.availableNew;
	}

	return { ...values, fieldSources, fieldConfidence, conflicts, availability, msrpYear };
}

/**
 * The per-year rows behind one generation, replaced wholesale.
 *
 * Two statements rather than one upsert per year: every statement is its own
 * commit, and on a disk that syncs each one the per-year upserts were most of
 * the rebuild's running time.
 */
async function syncModelYears(
	motorcycleId: string,
	observations: readonly AggregatedYear[],
	span: GenerationSpan | null
): Promise<void> {
	const years = span
		? observations.filter((o) => o.year >= span.from && o.year <= span.to)
		: observations;

	await prisma.modelYear.deleteMany({ where: { motorcycleId } });
	if (!years.length) return;

	await prisma.modelYear.createMany({
		data: years.map((year) => ({
			motorcycleId,
			year: year.year,
			registrationCount: year.registrationCount,
			medianPriceEur: year.medianPriceEur ?? null,
			medianMassKg: year.medianMassKg ?? null,
			medianDisplacementCc: year.medianDisplacementCc ?? null,
			maxPowerKw: year.maxPowerKw ?? null,
			fieldSources: {
				registrationCount: 'rdw',
				...(year.medianPriceEur ? { medianPriceEur: 'rdw' } : {}),
				...(year.medianMassKg ? { medianMassKg: 'rdw' } : {}),
				...(year.medianDisplacementCc ? { medianDisplacementCc: 'rdw' } : {}),
				...(year.maxPowerKw ? { maxPowerKw: 'rdw' } : {})
			}
		})),
		skipDuplicates: true
	});
}

function minEra(records: readonly LoadedRecord[]): number | undefined {
	const years = records.map((r) => r.eraFrom).filter((y): y is number => y !== null);
	return years.length ? Math.min(...years) : undefined;
}

function maxEra(records: readonly LoadedRecord[]): number | undefined {
	const years = records.map((r) => r.eraTo).filter((y): y is number => y !== null);
	return years.length ? Math.max(...years) : undefined;
}

/** Whichever source supplied the most merged fields. */
function dominantSource(
	fieldSources: Record<string, string>,
	records: readonly LoadedRecord[]
): string {
	const counts = new Map<string, number>();
	for (const source of Object.values(fieldSources)) {
		if (source === 'curated') continue;
		counts.set(source, (counts.get(source) ?? 0) + 1);
	}
	const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
	return ranked[0]?.[0] ?? records[0].source;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/**
 * Puts every photograph the family has on the generations it is evidence of.
 *
 * A photograph carries a scope. One a provider supplied, or one the Commons job
 * found by searching the model's name, is evidence of the *family* — an
 * article about the Z900 has pictures of some Z900 — and is shown on every
 * generation, flagged as possibly showing another one. A photograph whose file
 * name states a year is evidence of that model year, and goes only on the
 * generation containing it. Nothing is ever widened: a family-scope image does
 * not become a generation's just because it was found there.
 *
 * Provider-claimed images are replaced by what the provider says now; the
 * Commons job's images are kept, wherever the generations have moved to.
 */
async function syncFamilyImages(
	records: readonly LoadedRecord[],
	identity: Identity,
	catalogue: Catalogue,
	generations: (GenerationSpan | null)[],
	rowBySpan: Map<GenerationSpan | null, string>,
	previousRows: readonly ExistingRow[]
): Promise<void> {
	const vetting = vettingContext(identity, catalogue);
	const isWrongBike = (title: string) => namesADifferentMotorcycle(title, vetting);
	// A curated rejection is a fact about one file; it is checked on the URL
	// (which names the file) rather than the credit line.
	const isRejected = (url: string) => rejectedImage(url) !== undefined;
	const providerSources = new Set([...records.map((r) => r.source), 'legacy']);
	const divided = generations.length > 1;

	// --- The pool: what the providers say now, plus what the photo job found --
	const pool = new Map<string, PooledImage>();
	let order = 0;

	const ordered = [...records].sort((a, b) => a.source.localeCompare(b.source));
	for (const record of ordered) {
		for (const image of record.payload.images ?? []) {
			// A maker's own model page names the model; its credit line is not a
			// file name and is not vetted as one.
			if (image.license !== 'manufacturer' && isWrongBike(image.attribution ?? image.url)) {
				continue;
			}
			if (isRejected(image.url)) continue;
			// Keyed by the picture, not the URL: the English and German articles
			// link the same Commons file under different renderings and tracking
			// parameters, and a gallery must not show it twice.
			const key = imageIdentityKey(image.url);
			const pooled = pool.get(key);
			if (pooled) {
				// The same file from two articles: the one that states a model year
				// is the narrower evidence, whichever came first.
				if (pooled.modelYear === null && typeof image.modelYear === 'number') {
					pool.set(key, {
						...fromProvider(image, record.source, divided, pooled.order),
						sourceUrl: pooled.sourceUrl ?? image.sourceUrl ?? null
					});
				}
				continue;
			}
			pool.set(key, fromProvider(image, record.source, divided, order++));
		}
	}

	const rowIds = [...new Set([...rowBySpan.values(), ...previousRows.map((r) => r.id)])];
	const held = await prisma.motorcycleImage.findMany({
		where: { motorcycleId: { in: rowIds } },
		orderBy: [{ sortOrder: 'asc' }]
	});

	for (const image of held) {
		if (image.source !== null && providerSources.has(image.source)) continue;
		if (image.source === null) continue;
		if (isWrongBike(image.attribution ?? image.url)) continue;
		if (isRejected(image.url)) continue;

		const key = imageIdentityKey(image.url);
		const pooled = pool.get(key);
		if (pooled) {
			// The photo job dated a file an article also links undated: the date
			// is the narrower evidence and must not be lost to the article's copy.
			if (pooled.modelYear === null && image.scope === 'MODEL_YEAR' && image.modelYear) {
				pool.set(key, {
					...pooled,
					url: image.url,
					scope: 'MODEL_YEAR',
					modelYear: image.modelYear,
					source: image.source,
					sourceUrl: image.sourceUrl ?? pooled.sourceUrl,
					evidence: image.evidence ?? pooled.evidence
				});
			}
			continue;
		}

		// A year the file name states is the strongest evidence there is; a
		// search by name found some example of the family.
		const scope: ImageScope =
			image.scope === 'MODEL_YEAR' && image.modelYear
				? 'MODEL_YEAR'
				: divided
					? 'FAMILY'
					: 'GENERATION';
		pool.set(key, {
			url: image.url,
			scope,
			modelYear: scope === 'MODEL_YEAR' ? image.modelYear : null,
			source: image.source,
			sourceUrl: image.sourceUrl,
			width: image.width,
			height: image.height,
			imageType: image.imageType,
			attribution: image.attribution,
			evidence: image.evidence,
			license: image.license,
			order: 1000 + order++
		});
	}

	// --- Which generation each image belongs on --------------------------------
	const wantedByRow = new Map<string, PooledImage[]>();
	for (const id of rowBySpan.values()) wantedByRow.set(id, []);

	for (const image of pool.values()) {
		if (image.scope === 'MODEL_YEAR' && image.modelYear !== null) {
			// A next-year model — a 2027 in the maker's catalogue this autumn —
			// belongs to the generation on sale now, unless a boundary says
			// otherwise, and none can yet.
			const last = [...generations].reverse().find((g) => g !== null);
			const nextYear = new Date().getFullYear() + 1;
			const span =
				generations.find((g) => g && image.modelYear! >= g.from && image.modelYear! <= g.to) ??
				(last && image.modelYear > last.to && image.modelYear <= nextYear ? last : undefined);
			const id = span ? rowBySpan.get(span) : undefined;
			if (id) {
				wantedByRow.get(id)!.push(image);
				continue;
			}
			// A year no generation covers: still a photograph of the family.
			image.scope = 'FAMILY';
		}
		for (const id of rowBySpan.values()) wantedByRow.get(id)!.push(image);
	}

	// --- Write each generation's images ------------------------------------------
	const heldByRow = new Map<string, typeof held>();
	for (const image of held) {
		heldByRow.set(image.motorcycleId, [...(heldByRow.get(image.motorcycleId) ?? []), image]);
	}

	for (const [id, wanted] of wantedByRow) {
		// Evidence for this generation first, then the family's photographs.
		const rank = (i: PooledImage) => (i.scope === 'FAMILY' ? 1 : 0);
		wanted.sort((a, b) => rank(a) - rank(b) || a.order - b.order);

		// Existing rows are matched by picture as well, so a duplicate row
		// under another URL is replaced rather than kept alongside.
		const byKey = new Map(
			(heldByRow.get(id) ?? []).map((i) => [imageIdentityKey(i.url), i] as const)
		);
		const kept: string[] = [];

		for (const [index, image] of wanted.entries()) {
			const data = {
				isPrimary: index === 0,
				sortOrder: index,
				width: image.width,
				height: image.height,
				imageType: image.imageType,
				attribution: image.attribution,
				sourceUrl: image.sourceUrl,
				source: image.source,
				scope: image.scope,
				modelYear: image.modelYear,
				evidence: image.evidence,
				license: image.license
			};
			const found = byKey.get(imageIdentityKey(image.url));
			if (found && !kept.includes(found.id)) {
				await prisma.motorcycleImage.update({
					where: { id: found.id },
					data: { ...data, url: image.url }
				});
				kept.push(found.id);
			} else {
				const created = await prisma.motorcycleImage.create({
					data: { motorcycleId: id, url: image.url, ...data },
					select: { id: true }
				});
				kept.push(created.id);
			}
		}

		await prisma.motorcycleImage.deleteMany({ where: { motorcycleId: id, id: { notIn: kept } } });
	}

	// Photographs left on rows this family no longer uses have all been copied
	// to where they belong; the retired row keeps nothing.
	const retiredIds = previousRows.map((r) => r.id).filter((id) => !wantedByRow.has(id));
	if (retiredIds.length) {
		await prisma.motorcycleImage.deleteMany({ where: { motorcycleId: { in: retiredIds } } });
	}
}

function fromProvider(
	image: NormalizedImage,
	source: string,
	divided: boolean,
	order: number
): PooledImage {
	// A provider that states the model year has proven the narrowest scope
	// there is; one that does not has proven the family.
	const dated = typeof image.modelYear === 'number';
	return {
		url: image.url,
		scope: dated ? 'MODEL_YEAR' : divided ? 'FAMILY' : 'GENERATION',
		modelYear: dated ? image.modelYear! : null,
		source,
		sourceUrl: image.sourceUrl ?? null,
		width: image.width ?? null,
		height: image.height ?? null,
		imageType: image.imageType ?? null,
		attribution: image.attribution ?? null,
		evidence: image.evidence ?? null,
		license: image.license ?? (source === 'wikipedia' ? 'cc' : null),
		order
	};
}

// ---------------------------------------------------------------------------

async function uniqueSlug(
	manufacturerName: string,
	model: string,
	span: GenerationSpan | null
): Promise<string> {
	const base = slugify(`${manufacturerName} ${model}${span ? ` ${span.from}` : ''}`);
	let candidate = base;
	for (let i = 2; i < 60; i++) {
		const clash = await prisma.motorcycle.findUnique({
			where: { slug: candidate },
			select: { id: true }
		});
		if (!clash) return candidate;
		candidate = `${base}-${i}`;
	}
	return `${base}-${Date.now().toString(36)}`;
}

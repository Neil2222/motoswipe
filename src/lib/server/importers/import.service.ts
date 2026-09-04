import { prisma } from '../db/client';
import { slugify } from '../utils/slug';
import { normalizeBrand } from './match';
import { identify } from '../catalog/identity';
import { rebuildCatalogue } from '../catalog/rebuild';
import type { Prisma } from '../db/generated/client';
import type {
	ImportOptions,
	ImportResult,
	MotorcycleProvider,
	NormalizedMotorcycle
} from './types';

/**
 * Turns normalized provider output into database rows.
 *
 * Two rules drive the whole file:
 *
 *  1. A human correction beats a scraper. Rows flagged `manuallyEdited`, and
 *     individual fields listed in `protectedFields`, survive re-imports.
 *  2. Never invent data. A field the provider did not supply is left as it was,
 *     not overwritten with null — a source dropping a spec is not evidence that
 *     the spec is unknown.
 *
 * A third rule applies to providers that declare `mergeByModelName`: a record
 * describing a motorcycle the catalogue already has enriches that row rather
 * than creating a second one. See `enrichExisting` at the bottom of this file.
 */

export async function upsertManufacturer(
	name: string,
	countryCode?: string | null,
	website?: string | null
): Promise<string> {
	const slug = slugify(name);
	const matchKey = normalizeBrand(name) || null;

	const existing = await prisma.manufacturer.findFirst({
		where: matchKey ? { OR: [{ matchKey }, { name }, { slug }] } : { OR: [{ name }, { slug }] },
		select: { id: true, matchKey: true }
	});

	if (existing) {
		// Only fill blanks — never clobber a value someone has curated.
		if (countryCode || website || (matchKey && !existing.matchKey)) {
			await prisma.manufacturer.update({
				where: { id: existing.id },
				data: {
					countryCode: countryCode ?? undefined,
					website: website ?? undefined,
					matchKey: existing.matchKey ?? matchKey
				}
			});
		}
		return existing.id;
	}

	const created = await prisma.manufacturer.create({
		data: { name, slug, matchKey, countryCode: countryCode ?? null, website: website ?? null },
		select: { id: true }
	});
	return created.id;
}

/**
 * Slug for a motorcycle. Deterministic, so re-importing the same record does
 * not create a second row, and unique-suffixed when two genuinely different
 * bikes collide.
 */
export async function uniqueMotorcycleSlug(
	manufacturerName: string,
	m: NormalizedMotorcycle,
	existingId?: string
): Promise<string> {
	const base = slugify(
		[manufacturerName, m.model, m.variant, m.modelYear].filter(Boolean).join(' ')
	);

	let candidate = base;
	for (let i = 2; i < 50; i++) {
		const clash = await prisma.motorcycle.findUnique({
			where: { slug: candidate },
			select: { id: true }
		});
		if (!clash || clash.id === existingId) return candidate;
		candidate = `${base}-${i}`;
	}
	// Astronomically unlikely; better than looping forever.
	return `${base}-${Date.now().toString(36)}`;
}

export type ImportOutcome = 'created' | 'updated' | 'enriched' | 'protected' | 'skipped';

/**
 * Records what one provider said about one machine.
 *
 * This no longer writes a motorcycle. A provider's output is evidence, and the
 * motorcycle the deck shows is built from all the evidence at once — see
 * `catalog/rebuild.ts`. Writing straight through meant whichever provider ran
 * first decided the row, and the second one could only fill its blanks.
 */
export async function recordSourceData(
	provider: MotorcycleProvider,
	m: NormalizedMotorcycle
): Promise<ImportOutcome> {
	const era = {
		from: m.eraFrom ?? undefined,
		to: m.eraTo ?? undefined
	};
	const identity = identify({
		manufacturerName: m.manufacturerName,
		model: m.model,
		era
	});

	const data = {
		manufacturerName: m.manufacturerName,
		model: m.model,
		variant: m.variant ?? null,
		eraFrom: m.eraFrom ?? null,
		eraTo: m.eraTo ?? null,
		identityKey: identity?.key ?? null,
		payload: m as unknown as Prisma.InputJsonValue,
		confidence: (m.confidence ?? {}) as Prisma.InputJsonValue
	};

	const existing = await prisma.sourceRecord.findUnique({
		where: { source_externalId: { source: provider.source, externalId: m.externalId } },
		select: { id: true }
	});

	if (existing) {
		await prisma.sourceRecord.update({ where: { id: existing.id }, data });
		return 'updated';
	}

	await prisma.sourceRecord.create({
		data: { source: provider.source, externalId: m.externalId, ...data }
	});
	return 'created';
}

/** Runs a full import for one provider. */
export async function runImport(
	provider: MotorcycleProvider,
	options: ImportOptions = {}
): Promise<ImportResult> {
	const startedAt = Date.now();
	const result: ImportResult = {
		source: provider.source,
		created: 0,
		updated: 0,
		enriched: 0,
		skipped: 0,
		protectedRows: 0,
		failed: [],
		seenExternalIds: [],
		durationMs: 0
	};

	const listings = await provider.listMotorcycles({
		limit: options.limit,
		since: options.since
	});

	result.seenExternalIds = listings.map((listing) => listing.externalId);

	let done = 0;
	for (const listing of listings) {
		try {
			const raw = await provider.fetchMotorcycle(listing.externalId);
			const normalized = provider.normalizeMotorcycle(raw);

			if (!normalized) {
				result.skipped++;
			} else if (options.dryRun) {
				result.skipped++;
			} else {
				const outcome = await recordSourceData(provider, normalized);
				if (outcome === 'created') result.created++;
				else result.updated++;
			}
		} catch (error) {
			// One bad record must not abort a 5,000-row import.
			result.failed.push({
				externalId: listing.externalId,
				reason: error instanceof Error ? error.message : String(error)
			});
		}

		done++;
		options.onProgress?.(done, listings.length, listing.label);
	}

	// The catalogue is a projection of every source record, so it is rebuilt
	// once the new evidence is in rather than written to record by record.
	if (!options.dryRun && !options.skipRebuild) {
		result.rebuild = await rebuildCatalogue();
	}

	result.durationMs = Date.now() - startedAt;
	return result;
}

/**
 * Forgets the source records a provider no longer lists.
 *
 * Not the motorcycles. A canonical motorcycle is retired by the rebuild when
 * nothing describes it any more, and even then it is only deactivated — swipes
 * reference motorcycles with `onDelete: Restrict`, and a shortlist from last
 * year must not evaporate because a page came down.
 *
 * Dropping the stale evidence is safe and is what lets a model that genuinely
 * left the registry disappear from new decks.
 */
export async function retireMissing(
	source: string,
	seenExternalIds: readonly string[]
): Promise<number> {
	const result = await prisma.sourceRecord.deleteMany({
		where: { source, externalId: { notIn: [...seenExternalIds] } }
	});
	return result.count;
}

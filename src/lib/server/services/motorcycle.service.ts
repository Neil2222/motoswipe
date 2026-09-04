import { prisma } from '../db/client';
import { NotFoundError } from '../errors';
import { RoundFiltersSchema, type RoundFilters } from '$lib/domain/filters';
import { PAGE_SIZE, type BrowseQuery, type BrowseSort } from '$lib/domain/browse';
import { NON_ROAD_TAG } from '$lib/domain/enums';
import type { Prisma } from '../db/generated/client';

/**
 * Reads over the motorcycle catalogue, plus the one place that translates a
 * round's stored filters into a Prisma `where` clause.
 */

/**
 * The photographs a discovery card may show: the primary, then every other
 * photograph whose evidence places it in this generation (MODEL_YEAR or
 * GENERATION scope). Family-scope photographs are left out here on purpose —
 * for a divided family they may show another generation, and a swipe is a
 * judgement of *this* one. The detail page shows them, with a warning.
 */
export const DISCOVERY_IMAGES = {
	where: { OR: [{ isPrimary: true }, { scope: { in: ['MODEL_YEAR', 'GENERATION'] } }] },
	orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
	take: 8,
	select: { url: true, width: true, height: true, scope: true, modelYear: true }
} satisfies Prisma.Motorcycle$imagesArgs;

/** The fields every card, tile and row needs. Keeps payloads small. */
export const MOTORCYCLE_CARD_SELECT = {
	id: true,
	model: true,
	variant: true,
	modelYear: true,
	firstRegistrationYear: true,
	lastRegistrationYear: true,
	generationLabel: true,
	boundarySource: true,
	category: true,
	slug: true,
	displacementCc: true,
	powerHp: true,
	wetWeightKg: true,
	seatHeightMm: true,
	msrpAmount: true,
	msrpCurrency: true,
	passengerAllowed: true,
	manufacturer: { select: { id: true, name: true, slug: true } },
	images: DISCOVERY_IMAGES
} satisfies Prisma.MotorcycleSelect;

export type MotorcycleCard = Prisma.MotorcycleGetPayload<{
	select: typeof MOTORCYCLE_CARD_SELECT;
}>;

/**
 * Translates round filters into a Prisma where clause.
 *
 * Nullable-field policy: a filter only ever *narrows*. If a bike has no
 * published horsepower and the user asked for 100+ hp, it is excluded — we
 * cannot claim it qualifies. The exception is `passengerRequired`, where
 * `passengerAllowed: null` means unknown and is excluded for the same reason.
 * This is stated in the UI so an over-filtered round with few results is
 * explicable rather than mysterious.
 */
export function buildMotorcycleWhere(rawFilters: unknown): Prisma.MotorcycleWhereInput {
	const parsed = RoundFiltersSchema.safeParse(rawFilters ?? {});
	const f: RoundFilters = parsed.success ? parsed.data : {};

	const where: Prisma.MotorcycleWhereInput = {
		// Retired models stay in the database for history, but never enter a deck.
		isActive: true
	};
	const and: Prisma.MotorcycleWhereInput[] = [];

	// The baseline: a card whose identity is established and whose photograph
	// is of this generation. Everything a round does not ask about is left
	// alone; everything it does ask about is tested below, and an unknown never
	// satisfies a positive filter. See `catalog/evidence.ts`.
	//
	// A research round can switch the baseline off along with the photograph
	// requirement — the two are the same decision.
	//
	// A hand-picked deck is the user's own decision about what to judge, so the
	// baseline does not second-guess it; those bikes still need a photograph to
	// be judged on, which the photograph rule below keeps.
	if (!f.includeWithoutPhotos && !f.motorcycleIds?.length) and.push({ discoveryEligible: true });

	// "New" means the registry shows examples first put on the road this year
	// or last, in numbers; "used" means that has stopped. A model too thin to
	// tell is neither, and satisfies neither.
	if (f.condition === 'NEW') and.push({ availability: 'NEW' });
	else if (f.condition === 'USED') and.push({ availability: 'USED' });

	if (f.priceMin !== undefined || f.priceMax !== undefined) {
		const price: Prisma.FloatNullableFilter = {};
		if (f.priceMin !== undefined) price.gte = f.priceMin;
		if (f.priceMax !== undefined) price.lte = f.priceMax;
		and.push({ msrpAmount: price });
		// Comparing 12,000 EUR against 12,000 USD is meaningless, so a currency
		// bound is enforced whenever one is set.
		if (f.priceCurrency) and.push({ msrpCurrency: f.priceCurrency });
	}

	if (f.displacementMin !== undefined || f.displacementMax !== undefined) {
		const cc: Prisma.IntNullableFilter = {};
		if (f.displacementMin !== undefined) cc.gte = f.displacementMin;
		if (f.displacementMax !== undefined) cc.lte = f.displacementMax;
		and.push({ displacementCc: cc });
	}

	if (f.powerHpMin !== undefined || f.powerHpMax !== undefined) {
		const hp: Prisma.FloatNullableFilter = {};
		if (f.powerHpMin !== undefined) hp.gte = f.powerHpMin;
		if (f.powerHpMax !== undefined) hp.lte = f.powerHpMax;
		and.push({ powerHp: hp });
	}

	// A year bound asks "was this motorcycle available then", which is a period
	// and not a point. `modelYear` is the year a model was *introduced*, so
	// filtering on it alone drops the Kawasaki Z650 from a "2015 and newer"
	// round — Wikipedia dates it to 1977, and it is on sale today.
	//
	// The period is the generation's own years where the catalogue has them,
	// which for a curated or detected generation is when that machine was sold.
	// Otherwise it is the years examples were first put on the road in
	// meaningful numbers — a straggler registered in 2026 does not make a 2005
	// motorcycle available in 2026, and the rebuild trims those. Where the
	// registry says nothing at all, `modelYear` is the fallback.
	if (f.yearMin !== undefined) {
		and.push({
			OR: [
				{ generationTo: { gte: f.yearMin } },
				{ AND: [{ generationTo: null }, { lastRegistrationYear: { gte: f.yearMin } }] },
				{
					AND: [
						{ generationTo: null },
						{ lastRegistrationYear: null },
						{ modelYear: { gte: f.yearMin } }
					]
				}
			]
		});
	}
	if (f.yearMax !== undefined) {
		and.push({
			OR: [
				{ generationFrom: { lte: f.yearMax } },
				{ AND: [{ generationFrom: null }, { firstRegistrationYear: { lte: f.yearMax } }] },
				{
					AND: [
						{ generationFrom: null },
						{ firstRegistrationYear: null },
						{ modelYear: { lte: f.yearMax } }
					]
				}
			]
		});
	}

	// A hand-picked deck. Narrows like everything else, so combining it with
	// other filters still does the obvious thing.
	if (f.motorcycleIds?.length) and.push({ id: { in: f.motorcycleIds } });

	if (f.categories?.length) and.push({ category: { in: f.categories } });
	if (f.manufacturerIds?.length) and.push({ manufacturerId: { in: f.manufacturerIds } });
	if (f.ridingPositions?.length) and.push({ ridingPosition: { in: f.ridingPositions } });
	if (f.licenseCategories?.length) and.push({ licenseCategory: { in: f.licenseCategories } });

	if (f.passengerRequired) and.push({ passengerAllowed: true });

	// Only applied because the user explicitly set it. Fit estimates never
	// filter the deck on their own — see fit/fit.ts.
	if (f.seatHeightMaxMm !== undefined) and.push({ seatHeightMm: { lte: f.seatHeightMaxMm } });

	// The baseline above already demands a photograph; this keeps a hand-picked
	// or research round from showing a blank where a picture should be.
	if (!f.includeWithoutPhotos) and.push({ images: { some: {} } });

	// Race prototypes, concept bikes and military machines are excluded unless
	// the round asks for them. They stay in the catalogue and remain reachable
	// by direct link; they simply do not turn up in a deck by surprise.
	if (!f.includeNonRoad) and.push({ NOT: { tags: { has: NON_ROAD_TAG } } });

	if (and.length) where.AND = and;
	return where;
}

/** Ids of every motorcycle matching a round's filters, for deck building. */
export async function candidateIds(filters: unknown): Promise<string[]> {
	const rows = await prisma.motorcycle.findMany({
		where: buildMotorcycleWhere(filters),
		select: { id: true },
		orderBy: { id: 'asc' }
	});
	return rows.map((r) => r.id);
}

export async function countCandidates(filters: unknown): Promise<number> {
	return prisma.motorcycle.count({ where: buildMotorcycleWhere(filters) });
}

/** Full record for the detail page, with every image and the manufacturer. */
export async function getMotorcycleDetail(id: string) {
	const bike = await prisma.motorcycle.findUnique({
		where: { id },
		include: {
			manufacturer: true,
			images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
			// The other generations of the same family, so a Z900 page can say
			// "this is the 2020–2024 one" and point at the others.
			family: {
				select: {
					id: true,
					name: true,
					generations: {
						where: { isActive: true },
						orderBy: [{ generationFrom: 'asc' }],
						select: {
							id: true,
							generationLabel: true,
							generationFrom: true,
							generationTo: true,
							boundarySource: true,
							boundaryReason: true,
							registrationCount: true,
							images: {
								where: { isPrimary: true },
								take: 1,
								select: { url: true, scope: true }
							}
						}
					}
				}
			},
			modelYears: { orderBy: { year: 'asc' } }
		}
	});
	if (!bike) throw new NotFoundError('That motorcycle');
	return bike;
}

/**
 * Card data for a set of ids, returned in the caller's order.
 *
 * Prisma has no ORDER BY FIELD(), and deck order is computed in the
 * application anyway, so the reordering happens here.
 */
export async function getCardsByIds(ids: readonly string[]): Promise<MotorcycleCard[]> {
	if (ids.length === 0) return [];
	const rows = await prisma.motorcycle.findMany({
		where: { id: { in: [...ids] } },
		select: MOTORCYCLE_CARD_SELECT
	});
	const byId = new Map(rows.map((r) => [r.id, r]));
	return ids.map((id) => byId.get(id)).filter((r): r is MotorcycleCard => r !== undefined);
}

export async function listManufacturers() {
	return prisma.manufacturer.findMany({
		orderBy: { name: 'asc' },
		select: {
			id: true,
			name: true,
			slug: true,
			countryCode: true,
			_count: { select: { motorcycles: true } }
		}
	});
}

/** Distinct categories actually present in the catalogue, with counts. */
export async function categoryCounts() {
	const rows = await prisma.motorcycle.groupBy({
		by: ['category'],
		where: { isActive: true },
		_count: { _all: true }
	});
	return rows
		.map((r) => ({ category: r.category, count: r._count._all }))
		.sort((a, b) => b.count - a.count);
}

/** Bounds used to set sensible slider ranges on the round form. */
export async function catalogueBounds() {
	const agg = await prisma.motorcycle.aggregate({
		where: { isActive: true },
		_min: { displacementCc: true, powerHp: true, modelYear: true, msrpAmount: true },
		_max: { displacementCc: true, powerHp: true, modelYear: true, msrpAmount: true }
	});
	return {
		displacementCc: { min: agg._min.displacementCc ?? 0, max: agg._max.displacementCc ?? 2500 },
		powerHp: { min: agg._min.powerHp ?? 0, max: agg._max.powerHp ?? 250 },
		modelYear: {
			min: agg._min.modelYear ?? 1980,
			max: agg._max.modelYear ?? new Date().getFullYear()
		},
		msrpAmount: { min: agg._min.msrpAmount ?? 0, max: agg._max.msrpAmount ?? 50_000 }
	};
}

/**
 * Catalogue search, for the browser rather than for a deck.
 *
 * Separate from `buildMotorcycleWhere` on purpose. That function answers "which
 * motorcycles belong in this round", and its nullable-field policy is that a
 * filter only ever narrows — a bike with no published horsepower is excluded
 * from a 100 hp round because we cannot claim it qualifies. Searching is a
 * different act with a different contract: here the user is looking for
 * something specific and typed it in, so the free-text match is the point and
 * the rest is convenience.
 */
export async function searchMotorcycles(query: BrowseQuery) {
	const page = query.page ?? 1;
	const and: Prisma.MotorcycleWhereInput[] = [];

	if (query.q) {
		const q = query.q;
		// Matching the manufacturer's name as well as the model is what makes
		// "kawasaki z9" work — nobody types the two halves into separate boxes.
		and.push({
			OR: [
				{ model: { contains: q, mode: 'insensitive' } },
				{ variant: { contains: q, mode: 'insensitive' } },
				{ manufacturer: { name: { contains: q, mode: 'insensitive' } } }
			]
		});
	}

	if (query.category) and.push({ category: query.category });
	if (query.manufacturer) and.push({ manufacturerId: query.manufacturer });
	if (query.priceMax !== undefined) and.push({ msrpAmount: { lte: query.priceMax } });

	// Same period reading as a round's year bound: "2015 and newer" means the
	// model was still being sold then, not that it was introduced then.
	if (query.yearFrom !== undefined) {
		and.push({
			OR: [
				{ generationTo: { gte: query.yearFrom } },
				{ AND: [{ generationTo: null }, { lastRegistrationYear: { gte: query.yearFrom } }] },
				{
					AND: [
						{ generationTo: null },
						{ lastRegistrationYear: null },
						{ modelYear: { gte: query.yearFrom } }
					]
				}
			]
		});
	}

	if (query.withPhotos) and.push({ images: { some: {} } });

	const where: Prisma.MotorcycleWhereInput = {
		isActive: true,
		NOT: { tags: { has: NON_ROAD_TAG } },
		...(and.length ? { AND: and } : {})
	};

	const [rows, total] = await Promise.all([
		prisma.motorcycle.findMany({
			where,
			orderBy: browseOrder(query.sort),
			skip: (page - 1) * PAGE_SIZE,
			take: PAGE_SIZE,
			select: { ...MOTORCYCLE_CARD_SELECT, registrationCount: true }
		}),
		prisma.motorcycle.count({ where })
	]);

	return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/**
 * `nulls: 'last'` throughout: a motorcycle with no price is not the cheapest
 * one, and a model the registry has never seen is not the newest.
 */
function browseOrder(sort: BrowseSort | undefined): Prisma.MotorcycleOrderByWithRelationInput[] {
	switch (sort) {
		case 'newest':
			return [{ lastRegistrationYear: { sort: 'desc', nulls: 'last' } }, { model: 'asc' }];
		case 'cheapest':
			return [{ msrpAmount: { sort: 'asc', nulls: 'last' } }, { model: 'asc' }];
		case 'name':
			return [{ manufacturer: { name: 'asc' } }, { model: 'asc' }];
		default:
			return [{ registrationCount: { sort: 'desc', nulls: 'last' } }, { model: 'asc' }];
	}
}

/** Manufacturers that actually have something to show, for the filter menu. */
export async function listManufacturersWithCounts() {
	const rows = await prisma.manufacturer.findMany({
		where: { motorcycles: { some: { isActive: true } } },
		orderBy: { name: 'asc' },
		select: {
			id: true,
			name: true,
			_count: { select: { motorcycles: { where: { isActive: true } } } }
		}
	});

	return rows.map((row) => ({ id: row.id, name: row.name, count: row._count.motorcycles }));
}

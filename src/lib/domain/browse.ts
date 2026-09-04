import { z } from 'zod';
import { MotorcycleCategory } from './enums';

/**
 * The catalogue browser's query.
 *
 * Deliberately **not** `RoundFilters`. Those describe a question you are asking
 * of a deck and are stored on the round forever; this is a URL you are looking
 * at right now. They share vocabulary but not lifetime, and merging them would
 * mean every browse control had to be answerable as a swipe-round rule.
 *
 * Every field is optional. An empty query is the whole catalogue, which is the
 * right default for a page whose job is "let me find that bike".
 */

const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

const optionalInt = (min: number, max: number) =>
	z.preprocess(blankToUndefined, z.coerce.number().int().min(min).max(max).optional());

/**
 * How results are ordered.
 *
 * `popular` is the default and means "most registered in the Netherlands",
 * which is a real fact rather than a guess and puts the machines you actually
 * see on the road at the top. Alphabetical would open the catalogue on a wall
 * of Aprilias.
 */
export const BrowseSort = {
	popular: 'popular',
	newest: 'newest',
	cheapest: 'cheapest',
	name: 'name'
} as const;

export type BrowseSort = (typeof BrowseSort)[keyof typeof BrowseSort];

export const BROWSE_SORT_LABELS: Record<BrowseSort, string> = {
	popular: 'Most on the road',
	newest: 'Newest',
	cheapest: 'Cheapest',
	name: 'A–Z'
};

export const PAGE_SIZE = 24;

export const BrowseQuerySchema = z.object({
	/** Free text over manufacturer, model and variant. */
	q: z.preprocess(blankToUndefined, z.string().trim().max(80).optional()),
	category: z.preprocess(blankToUndefined, z.enum(MotorcycleCategory).optional()),
	/** Manufacturer id. Absent means every manufacturer. */
	manufacturer: z.preprocess(blankToUndefined, z.uuid().optional()),
	yearFrom: optionalInt(1900, 2100),
	priceMax: optionalInt(0, 1_000_000),
	/**
	 * Bikes with no photograph are hidden by default here as well, for the same
	 * reason as in a deck: a grid of grey boxes is not a catalogue anybody wants
	 * to look at. Unlike a deck, it is one checkbox away — searching for a
	 * specific machine that nobody has photographed is a real thing to want.
	 */
	withPhotos: z.preprocess((v) => v !== 'false', z.boolean()),
	sort: z.preprocess(blankToUndefined, z.enum(BrowseSort).optional()),
	page: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(1000).optional())
});

export type BrowseQuery = z.infer<typeof BrowseQuerySchema>;

/** Reads a browse query out of a URL, ignoring anything malformed. */
export function readBrowseQuery(params: URLSearchParams): BrowseQuery {
	const parsed = BrowseQuerySchema.safeParse({
		q: params.get('q'),
		category: params.get('category'),
		manufacturer: params.get('manufacturer'),
		yearFrom: params.get('yearFrom'),
		priceMax: params.get('priceMax'),
		withPhotos: params.get('withPhotos'),
		sort: params.get('sort'),
		page: params.get('page')
	});

	// A hand-edited URL should show the catalogue, not an error page.
	return parsed.success ? parsed.data : { withPhotos: true };
}

/** True when nothing is narrowing the catalogue. */
export function isBrowsingEverything(query: BrowseQuery): boolean {
	return (
		!query.q &&
		!query.category &&
		!query.manufacturer &&
		query.yearFrom === undefined &&
		query.priceMax === undefined
	);
}

/**
 * Serialises a query back into a query string, dropping defaults so the URL
 * stays short enough to read and to share.
 */
export function browseHref(query: BrowseQuery, overrides: Partial<BrowseQuery> = {}): string {
	const merged = { ...query, ...overrides };
	const params = new URLSearchParams();

	if (merged.q) params.set('q', merged.q);
	if (merged.category) params.set('category', merged.category);
	if (merged.manufacturer) params.set('manufacturer', merged.manufacturer);
	if (merged.yearFrom !== undefined) params.set('yearFrom', String(merged.yearFrom));
	if (merged.priceMax !== undefined) params.set('priceMax', String(merged.priceMax));
	if (!merged.withPhotos) params.set('withPhotos', 'false');
	if (merged.sort && merged.sort !== 'popular') params.set('sort', merged.sort);
	if (merged.page && merged.page > 1) params.set('page', String(merged.page));

	const qs = params.toString();
	return qs ? `/motorcycles?${qs}` : '/motorcycles';
}

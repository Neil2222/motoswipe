import type {
	ListOptions,
	MotorcycleProvider,
	NormalizedImage,
	NormalizedMotorcycle,
	ProviderListing,
	RawMotorcycle
} from '../../types';
import {
	parseCooling,
	parseDisplacementCc,
	parseEngineLayout,
	parseInfobox,
	parseSeatHeightMm,
	parseWheelbaseMm,
	parseMotorcycleMassKg,
	parsePower,
	parseProductionYear,
	parseProductionYears,
	parseStillProduced,
	parseTorqueNm,
	parseTransmission,
	parseVolumeL,
	stripMarkup,
	type InfoboxFields
} from './infobox';
import {
	deriveTags,
	inferRidingPosition,
	isGenericDescription,
	isNonRoad,
	isNotAMotorcycle,
	mapCategory,
	mapCategoryFromArticleCategories,
	NON_ROAD_TAG
} from './categories';
import { isPhotoOf } from '../../photos/commons-match';

/**
 * Real motorcycle data from Wikidata and Wikipedia.
 *
 * ## Why these two sources
 *
 * Both are openly licensed and both offer a proper API, so nothing here is
 * scraping and nothing depends on a page layout staying still. They are also
 * complementary, which is why the provider uses both:
 *
 *  - **Wikidata** (CC0) knows *which* motorcycles exist, who made them, and
 *    which photograph belongs to each. Its specification coverage is close to
 *    nil — 29 of 2,834 models carry an engine displacement.
 *  - **English Wikipedia** carries the specifications, in the
 *    `{{Infobox motorcycle}}` template. Of the ~1,220 models with an article,
 *    roughly 93% state an engine, 76% a class, 62% power and 55% a seat height.
 *
 * So: enumerate with Wikidata, specify with Wikipedia, illustrate with Commons.
 *
 * ## Licensing
 *
 * Wikidata is CC0. Wikipedia prose is CC BY-SA, so this provider deliberately
 * imports **facts only** — a displacement is not copyrightable, a paragraph is.
 * Article text is never copied into `description`; the short Wikidata
 * description (CC0) is used instead, and `sourceUrl` links back to the article.
 *
 * Commons photographs are mostly CC BY-SA or CC BY and **require attribution**,
 * so the licence and author are fetched and stored on every image row. See
 * `buildAttribution`.
 *
 * ## Being a good citizen
 *
 * Wikimedia asks for a descriptive User-Agent with a way to contact you; set
 * `WIKIMEDIA_CONTACT` so yours is honest. Requests are batched 50 at a time and
 * paced, because there is no reason to be in a hurry.
 */

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

/** Wikimedia's API caps multi-title queries at 50. */
const BATCH_SIZE = 50;
/** Pause between batches. Nothing here is urgent. */
const BATCH_DELAY_MS = 350;
/** Width served to the swipe deck. Originals are frequently 4000 px wide. */
const IMAGE_WIDTH = 1200;

function userAgent(): string {
	const contact = process.env.WIKIMEDIA_CONTACT?.trim();
	return (
		'MotoSwipe/0.1 (self-hosted motorcycle discovery app; ' +
		(contact || 'set WIKIMEDIA_CONTACT to identify this instance') +
		') Node'
	);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Statuses worth trying again: overload and rate limiting, not "bad request". */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

/**
 * Fetches JSON, retrying transient failures with exponential backoff.
 *
 * The Wikidata SPARQL endpoint is shared infrastructure and returns a 502 or a
 * 429 often enough that a single-shot importer fails perhaps one run in three —
 * observed, not theorised. `Retry-After` is honoured when the server sends it,
 * and jitter keeps repeated runs from lining up into a thundering herd.
 */
async function apiFetch(
	url: string,
	init: { method?: string; body?: string; headers?: Record<string, string> } = {}
): Promise<unknown> {
	let lastError: Error | undefined;

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const response = await fetch(url, {
				method: init.method ?? 'GET',
				body: init.body,
				headers: {
					'User-Agent': userAgent(),
					Accept: 'application/json',
					...init.headers
				}
			});

			if (response.ok) return await response.json();

			if (!RETRYABLE.has(response.status) || attempt === MAX_ATTEMPTS) {
				throw new Error(`${response.status} ${response.statusText} from ${new URL(url).host}`);
			}

			const retryAfter = Number(response.headers.get('retry-after'));
			const backoff =
				Number.isFinite(retryAfter) && retryAfter > 0
					? retryAfter * 1000
					: 2 ** attempt * 1000 + Math.random() * 500;

			console.warn(
				`[wikipedia] ${response.status} from ${new URL(url).host}; ` +
					`retrying in ${Math.round(backoff / 100) / 10}s (attempt ${attempt}/${MAX_ATTEMPTS})`
			);
			await sleep(backoff);
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			// A thrown non-retryable HTTP error should surface immediately.
			if (/^\d{3} /.test(lastError.message) && attempt === MAX_ATTEMPTS) throw lastError;
			if (/^(4\d\d|400) /.test(lastError.message)) throw lastError;
			if (attempt === MAX_ATTEMPTS) throw lastError;
			await sleep(2 ** attempt * 1000 + Math.random() * 500);
		}
	}

	throw lastError ?? new Error('Request failed');
}

// ---------------------------------------------------------------------------
// Shapes returned by the two APIs (only the parts we read)
// ---------------------------------------------------------------------------

interface SparqlRow {
	item: { value: string };
	itemLabel?: { value: string };
	itemDescription?: { value: string };
	article: { value: string };
	makeLabel?: { value: string };
	makeCountry?: { value: string };
	makeWebsite?: { value: string };
	image?: { value: string };
}

/** How many photographs to keep per motorcycle, primary included. */
const MAX_IMAGES_PER_BIKE = 5;

/**
 * Wiki chrome that appears in the file list of almost every article: licence
 * badges, maintenance icons, flags, portal decorations.
 */
const CHROME_FILE =
	/commons-logo|wiki\w*-logo|wikidata|question_book|edit-clear|ambox|padlock|symbol_|portal|flag_of|coat_of_arms|red_pog|blue_pog|loudspeaker|increase2?\.|decrease2?\.|nuvola|crystal_|folder_|magnify-clip|disambig|merge-a|text_document/i;

/**
 * True for a file that might actually be a photograph of the motorcycle.
 *
 * SVGs are excluded outright: on Wikipedia they are diagrams, logos and icons,
 * never photographs. The rest is a name filter for the furniture that turns up
 * in every article's file list.
 */
export function isUsablePhotoFile(title: string): boolean {
	if (!/\.(jpe?g|png|webp)$/i.test(title)) return false;
	return !CHROME_FILE.test(title);
}

/** One motorcycle, assembled from every source before normalisation. */
export interface WikiRecord {
	qid: string;
	title: string;
	articleUrl: string;
	label: string;
	description?: string;
	manufacturer?: string;
	manufacturerCountry?: string;
	manufacturerWebsite?: string;
	wikitext?: string;
	/** Wikipedia article categories, used to classify bikes with no infobox class. */
	articleCategories?: string[];
	/** Every file used in the article, for the gallery. */
	articleFiles?: string[];
	commonsFile?: string;
	images?: NormalizedImage[];
}

// ---------------------------------------------------------------------------

export class WikipediaProvider implements MotorcycleProvider {
	readonly source = 'wikipedia';
	readonly displayName = 'Wikipedia + Wikidata (CC BY-SA / CC0)';
	readonly requiresNetwork = true;
	/**
	 * The registry and the encyclopedia describe the same machines. Whichever
	 * source reaches a motorcycle first owns the row; the other one fills its
	 * gaps and adds its photographs. Without this, import order decides whether
	 * the deck shows a bike once or twice.
	 */
	readonly mergeByModelName = true;

	/** Listing results, so `fetchMotorcycle` knows which article to open. */
	private index = new Map<string, WikiRecord>();
	/** Records already hydrated with wikitext and image metadata. */
	private hydrated = new Set<string>();
	/** Ids awaiting hydration, so fetches can be batched rather than serial. */
	private pending: string[] = [];

	async listMotorcycles(options: ListOptions = {}): Promise<ProviderListing[]> {
		const query = `
			SELECT ?item ?itemLabel ?itemDescription ?article ?makeLabel ?makeCountry ?makeWebsite ?image
			WHERE {
			  ?item wdt:P31/wdt:P279* wd:Q23866334 .
			  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
			  OPTIONAL { ?item wdt:P176 ?make .
			             OPTIONAL { ?make wdt:P17 ?makeCountryItem .
			                        ?makeCountryItem wdt:P297 ?makeCountry . }
			             OPTIONAL { ?make wdt:P856 ?makeWebsite . } }
			  OPTIONAL { ?item wdt:P18 ?image . }
			  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
			}`;

		// POST rather than GET: the query is long enough to bump into URL length
		// limits on some proxies, and Wikidata documents POST as the safer form.
		const payload = (await apiFetch(SPARQL_ENDPOINT, {
			method: 'POST',
			body: new URLSearchParams({ query, format: 'json' }).toString(),
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: 'application/sparql-results+json'
			}
		})) as { results: { bindings: SparqlRow[] } };

		this.index.clear();
		this.siblingCache.clear();
		this.hydrated.clear();

		for (const row of payload.results.bindings) {
			const qid = lastSegment(row.item.value);
			const title = decodeURIComponent(row.article.value.split('/wiki/')[1] ?? '').replace(
				/_/g,
				' '
			);
			if (!qid || !title) continue;
			// A motorcycle with no known manufacturer cannot be filed sensibly,
			// and "Unknown" as a brand would pollute every manufacturer statistic.
			if (!row.makeLabel?.value) continue;
			// The query can return several rows per item (two images, say); the
			// first one wins rather than becoming a duplicate.
			if (this.index.has(qid)) continue;

			this.index.set(qid, {
				qid,
				title,
				articleUrl: row.article.value,
				label: row.itemLabel?.value ?? title,
				description: row.itemDescription?.value,
				manufacturer: row.makeLabel?.value,
				manufacturerCountry: row.makeCountry?.value,
				manufacturerWebsite: row.makeWebsite?.value,
				commonsFile: row.image?.value
					? decodeURIComponent(row.image.value.split('/').pop() ?? '')
					: undefined
			});
		}

		const listings = [...this.index.values()]
			.sort((a, b) => a.label.localeCompare(b.label))
			.slice(0, options.limit ?? this.index.size);

		this.pending = listings.map((record) => record.qid);
		return listings.map((record) => ({
			externalId: record.qid,
			label: `${record.manufacturer} — ${record.label}`,
			sourceUrl: record.articleUrl
		}));
	}

	async fetchMotorcycle(externalId: string): Promise<RawMotorcycle> {
		if (this.index.size === 0) await this.listMotorcycles();

		const record = this.index.get(externalId);
		if (!record) throw new Error(`No Wikipedia motorcycle with id ${externalId}`);

		if (!this.hydrated.has(externalId)) {
			// Hydrate a whole batch around this id. The provider interface is
			// one-at-a-time, but issuing one HTTP request per motorcycle would mean
			// ~2,400 requests for a full import; this makes it ~50.
			const batch = [externalId, ...this.pending.filter((id) => id !== externalId)]
				.filter((id) => !this.hydrated.has(id))
				.slice(0, BATCH_SIZE);

			await this.hydrateBatch(batch);
			this.pending = this.pending.filter((id) => !this.hydrated.has(id));
		}

		return this.index.get(externalId) as WikiRecord;
	}

	/** Fetches wikitext for a batch of articles, then their image metadata. */
	private async hydrateBatch(qids: string[]): Promise<void> {
		const records = qids
			.map((qid) => this.index.get(qid))
			.filter((r): r is WikiRecord => r !== undefined);
		if (records.length === 0) return;

		// --- Article wikitext ------------------------------------------------
		const titles = records.map((r) => r.title);
		const params = new URLSearchParams({
			action: 'query',
			// Categories ride along in the same request. Roughly a third of
			// articles have no `class` field in the infobox, and their categories
			// ("Category:Sport bikes") are the best free signal available.
			prop: 'revisions|categories|images',
			rvprop: 'content',
			rvslots: 'main',
			cllimit: 'max',
			clshow: '!hidden',
			imlimit: 'max',
			format: 'json',
			formatversion: '2',
			redirects: '1',
			titles: titles.join('|')
		});

		const payload = (await apiFetch(`${WIKIPEDIA_API}?${params}`)) as {
			query?: {
				pages?: {
					title: string;
					revisions?: { slots?: { main?: { content?: string } } }[];
					categories?: { title: string }[];
					images?: { title: string }[];
				}[];
				normalized?: { from: string; to: string }[];
				redirects?: { from: string; to: string }[];
			};
		};

		// Titles come back normalised and redirect-followed, so map them home.
		const alias = new Map<string, string>();
		for (const entry of [
			...(payload.query?.normalized ?? []),
			...(payload.query?.redirects ?? [])
		]) {
			alias.set(entry.to, entry.from);
		}

		const byTitle = new Map(records.map((r) => [r.title, r]));
		for (const page of payload.query?.pages ?? []) {
			const originalTitle = alias.get(page.title) ?? page.title;
			const record = byTitle.get(originalTitle) ?? byTitle.get(page.title);
			if (!record) continue;
			record.wikitext = page.revisions?.[0]?.slots?.main?.content;
			record.articleCategories = page.categories?.map((c) => c.title) ?? [];
			record.articleFiles = (page.images ?? []).map((i) => i.title).filter(isUsablePhotoFile);
		}

		await sleep(BATCH_DELAY_MS);

		// --- Image URLs and licensing ---------------------------------------
		await this.hydrateImages(records);

		for (const record of records) this.hydrated.add(record.qid);
	}

	/**
	 * Resolves Commons filenames into thumbnail URLs plus the licence and author,
	 * which CC BY-SA obliges us to display.
	 *
	 * Each motorcycle gets up to `MAX_IMAGES_PER_BIKE` photographs: the curated
	 * lead image first (Wikidata P18, or the infobox `image =` field when P18 is
	 * absent — that alone recovers a few hundred photographs), then the other
	 * files used in the article.
	 *
	 * The extra images matter for two reasons. One landscape photograph of a dark
	 * motorcycle taken in a shed is a poor basis for "do you like this bike", and
	 * the detail page gallery had exactly one thing in it.
	 */
	/**
	 * Every model this manufacturer has in the import, so a photograph of a
	 * Z900RS is not accepted as a photograph of a Z900.
	 *
	 * Built from the whole Wikidata listing rather than the current batch — the
	 * sibling that disqualifies a file is frequently not in the same batch as
	 * the bike it would otherwise be filed under.
	 */
	private siblingCache = new Map<string, string[]>();

	private siblingModels(manufacturer: string | undefined): string[] {
		if (!manufacturer) return [];
		const cached = this.siblingCache.get(manufacturer);
		if (cached) return cached;

		const models: string[] = [];
		for (const other of this.index.values()) {
			if (other.manufacturer !== manufacturer) continue;
			models.push(deriveModel(other.label, manufacturer));
		}
		this.siblingCache.set(manufacturer, models);
		return models;
	}

	private async hydrateImages(records: WikiRecord[]): Promise<void> {
		// Every file we need to resolve, and which record wanted it.
		const wanted = new Map<string, { record: WikiRecord; rank: number }[]>();

		for (const record of records) {
			const ordered: string[] = [];

			// 1. The curated lead image.
			if (!record.commonsFile) {
				const fields = record.wikitext ? parseInfobox(record.wikitext) : null;
				const fromInfobox = fields?.image ? stripMarkup(fields.image) : '';
				if (fromInfobox && isUsablePhotoFile(fromInfobox)) {
					record.commonsFile = fromInfobox;
				}
			}
			if (record.commonsFile) ordered.push(`File:${record.commonsFile}`);

			// 2. Everything else the article uses, in article order — but only
			//    what is demonstrably a photograph of *this* machine.
			//
			//    An article's images are not all of its subject. The Kawasaki Z900
			//    page carries a Honda CBR600RR and a Z900RS, and both ended up in
			//    the Z900's gallery. The lead image above is curated by editors for
			//    that article and is trusted; everything after it has to earn its
			//    place, using the same rules that vet a Commons search result.
			const model = deriveModel(record.label, record.manufacturer ?? '');
			const context = {
				manufacturerName: record.manufacturer ?? '',
				model,
				siblingModels: this.siblingModels(record.manufacturer)
			};

			for (const file of record.articleFiles ?? []) {
				if (ordered.length >= MAX_IMAGES_PER_BIKE) break;
				if (ordered.includes(file)) continue;
				if (!isPhotoOf({ title: file }, context)) continue;
				ordered.push(file);
			}

			ordered.forEach((file, rank) => {
				const entry = wanted.get(file) ?? [];
				entry.push({ record, rank });
				wanted.set(file, entry);
			});
		}

		const files = [...wanted.keys()];
		if (files.length === 0) return;

		// Commons caps a multi-title query at 50, and we may now be asking about
		// several hundred files for one batch of motorcycles.
		for (let i = 0; i < files.length; i += BATCH_SIZE) {
			const slice = files.slice(i, i + BATCH_SIZE);

			const params = new URLSearchParams({
				action: 'query',
				prop: 'imageinfo',
				iiprop: 'url|size|extmetadata',
				iiurlwidth: String(IMAGE_WIDTH),
				format: 'json',
				formatversion: '2',
				titles: slice.join('|')
			});

			let payload: {
				query?: {
					pages?: {
						title: string;
						imageinfo?: {
							thumburl?: string;
							url?: string;
							thumbwidth?: number;
							thumbheight?: number;
							width?: number;
							height?: number;
							descriptionurl?: string;
							extmetadata?: Record<string, { value?: string }>;
						}[];
					}[];
					normalized?: { from: string; to: string }[];
				};
			};

			try {
				payload = (await apiFetch(`${COMMONS_API}?${params}`)) as typeof payload;
			} catch {
				// An image failure must never lose a motorcycle. The row imports
				// without that photograph and can pick one up on a later run.
				continue;
			}

			const alias = new Map((payload.query?.normalized ?? []).map((n) => [n.to, n.from]));

			for (const page of payload.query?.pages ?? []) {
				const key = alias.get(page.title) ?? page.title;
				const info = page.imageinfo?.[0];
				const claims = wanted.get(key) ?? wanted.get(page.title);
				if (!claims || !info) continue;

				const url = info.thumburl ?? info.url;
				if (!url) continue;

				// Skip anything too small or too narrow to be a photograph of a
				// motorcycle — banners, signatures, sliver crops.
				const width = info.width ?? info.thumbwidth ?? 0;
				const height = info.height ?? info.thumbheight ?? 0;
				if (width && height) {
					if (width < 320 || height < 200) continue;
					const aspect = width / height;
					if (aspect > 4 || aspect < 0.25) continue;
				}

				for (const { record, rank } of claims) {
					record.images ??= [];
					record.images.push({
						url,
						sourceUrl: info.descriptionurl ?? null,
						isPrimary: rank === 0,
						sortOrder: rank,
						width: info.thumbwidth ?? info.width ?? null,
						height: info.thumbheight ?? info.height ?? null,
						imageType: 'PHOTO',
						attribution: buildAttribution(info.extmetadata, page.title)
					});
				}
			}

			await sleep(BATCH_DELAY_MS);
		}

		// Restore article order, and make sure exactly one image is primary even
		// when the curated lead image failed to resolve.
		for (const record of records) {
			if (!record.images?.length) continue;
			record.images.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
			record.images = record.images.slice(0, MAX_IMAGES_PER_BIKE);
			record.images.forEach((image, index) => {
				image.sortOrder = index;
				image.isPrimary = index === 0;
			});
		}
	}

	normalizeMotorcycle(raw: RawMotorcycle): NormalizedMotorcycle | null {
		const record = raw as WikiRecord;
		if (!record?.title || !record.manufacturer) return null;

		const articleCategories = record.articleCategories ?? [];

		// Wikidata files some engine articles as motorcycle models. An engine is
		// not a machine you can sit on, so it is dropped rather than filtered.
		if (isNotAMotorcycle(record.title, articleCategories)) return null;

		const fields: InfoboxFields = record.wikitext ? (parseInfobox(record.wikitext) ?? {}) : {};

		// An article with no infobox gives us nothing but a name. That is not
		// worth a row: it would be an entry in the deck with no photograph and no
		// specification whatsoever.
		if (Object.keys(fields).length === 0 && !record.images?.length) return null;

		// The infobox `class` field is the primary signal; article categories are
		// the fallback for the ~30% of articles that do not have one.
		let { category, categoryRaw } = mapCategory(fields.class);
		if (category === 'OTHER' && articleCategories.length) {
			const fallback = mapCategoryFromArticleCategories(articleCategories);
			if (fallback.category !== 'OTHER') {
				category = fallback.category;
				categoryRaw = categoryRaw ?? fallback.categoryRaw;
			}
		}

		const engine = fields.engine;
		const { configuration, cylinders } = parseEngineLayout(engine);
		const { hp, kw } = parsePower(fields.power);
		const { transmission, gears } = parseTransmission(fields.transmission);

		const model = deriveModel(record.label, record.manufacturer);
		const production = parseProductionYears(fields.production);

		return {
			manufacturerName: record.manufacturer,
			manufacturerCountryCode: record.manufacturerCountry ?? null,
			manufacturerWebsite: record.manufacturerWebsite ?? null,

			model,
			variant: null,
			modelYear: parseProductionYear(fields.production) ?? null,
			// Production years, which is a stronger era signal than a registry's
			// registration span and the thing that separates generations.
			eraFrom: production.from ?? null,
			eraTo: production.to ?? null,

			category,
			categoryRaw,
			// Wikidata descriptions are CC0. Article prose is CC BY-SA and is
			// deliberately not copied — see the licensing note at the top.
			// "motorcycle", "type of motorcycle", "Naked bike model from Honda":
			// true of the bike and worth nothing under a heading that already
			// names it. A blank reads better than filler.
			description: isGenericDescription(record.description) ? null : (record.description ?? null),
			tags: [
				...deriveTags({ categoryRaw, engine, transmission: fields.transmission }),
				// Racing prototypes, streamliners and minibikes stay in the
				// catalogue but are marked, so they can be filtered out of a
				// "what should I buy" round later.
				...(isNonRoad(fields.class, articleCategories) ? [NON_ROAD_TAG] : [])
			],

			displacementCc: parseDisplacementCc(engine) ?? null,
			cylinders: cylinders ?? null,
			engineConfiguration: configuration ?? null,
			cooling: parseCooling(engine) ?? null,
			powerHp: hp ?? null,
			powerKw: kw ?? null,
			torqueNm: parseTorqueNm(fields.torque) ?? null,
			transmission: transmission ?? null,
			gears: gears ?? null,

			wetWeightKg: parseMotorcycleMassKg(fields.wet_weight) ?? null,
			dryWeightKg: parseMotorcycleMassKg(fields.dry_weight) ?? null,
			seatHeightMm: parseSeatHeightMm(fields.seat_height) ?? null,
			// Not published in this template. Left null rather than guessed —
			// FitService explicitly handles and mentions an unknown seat width.
			seatWidthMm: null,
			wheelbaseMm: parseWheelbaseMm(fields.wheelbase) ?? null,
			fuelCapacityLiters: parseVolumeL(fields.fuel_capacity) ?? null,

			// The infobox says nothing about pillion provision, and a photograph
			// showing a seat is not a statement. Left unknown on purpose.
			passengerAllowed: null,
			seatCount: null,
			passengerPegs: null,
			ridingPosition: inferRidingPosition(category) ?? null,
			licenseCategory: null,

			// No price data in either source.
			msrpAmount: null,
			msrpCurrency: null,
			marketCountryCode: null,
			availableNew: parseStillProduced(fields.production) ?? null,

			externalId: record.qid,
			sourceUrl: record.articleUrl,
			images: record.images ?? []
		};
	}
}

/**
 * Strips the manufacturer from the front of a model name.
 *
 * Wikipedia titles articles "Kawasaki Z900", but MotoSwipe stores the make
 * separately and renders "Kawasaki" above "Z900" on the card. Leaving it in
 * would print the brand twice.
 */
export function deriveModel(label: string, manufacturer: string): string {
	// "Kawasaki Heavy Industries Motorcycle & Engine" -> "Kawasaki"
	const brand = manufacturer.split(/\s+/)[0];
	const cleaned = label
		.replace(/\s*\([^)]*\)\s*$/, '') // drop a disambiguator: "(motorcycle)"
		.trim();

	const pattern = new RegExp(`^${escapeRegExp(brand)}\\s+`, 'i');
	const withoutBrand = cleaned.replace(pattern, '').trim();

	// Never return an empty model: some articles are titled just the brand.
	return withoutBrand || cleaned;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Last path segment of a URI — "http://…/entity/Q42" becomes "Q42". */
function lastSegment(uri: string): string {
	const parts = uri.split('/');
	return parts[parts.length - 1] ?? '';
}

/**
 * Builds the credit line a Creative Commons licence requires.
 *
 * `extmetadata` carries HTML (the artist is often a link), so it is reduced to
 * text. When the licence cannot be determined the file is still credited to
 * Wikimedia Commons with a link, which is the honest minimum.
 */
export function buildAttribution(
	meta: Record<string, { value?: string }> | undefined,
	fileTitle: string
): string {
	const text = (key: string): string =>
		(meta?.[key]?.value ?? '')
			.replace(/<[^>]+>/g, ' ')
			.replace(/&[a-z]+;/gi, ' ')
			.replace(/\s+/g, ' ')
			.trim();

	const artist = text('Artist');
	const licence = text('LicenseShortName') || text('License');
	const credit = text('Credit');

	const parts: string[] = [];
	if (artist) parts.push(`Photo by ${artist}`);
	else if (credit) parts.push(credit);
	if (licence) parts.push(licence);
	parts.push(`via Wikimedia Commons (${fileTitle})`);

	return parts.join(' · ').slice(0, 500);
}
export const wikipediaProvider = new WikipediaProvider();

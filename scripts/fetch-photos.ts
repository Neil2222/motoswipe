import 'dotenv/config';
import { prisma } from '../src/lib/server/db/client';
import { buildAttribution } from '../src/lib/server/importers/providers/wikipedia/wikipedia.provider';
import {
	buildSearchQuery,
	isPhotoOf,
	modelVariants,
	rankCandidates,
	yearInTitle
} from '../src/lib/server/importers/photos/commons-match';
import { reassessImages } from '../src/lib/server/catalog/assess';
import { findCurated } from '../src/lib/server/catalog/identity';

/**
 * Finds photographs on Wikimedia Commons for motorcycles that have none.
 *
 * The Dutch vehicle registry gave the catalogue about four thousand machines it
 * did not have before, complete with prices, power and how many are on the
 * road — and not one picture. This app asks you to judge a motorcycle on how it
 * looks, so a row without a photograph cannot enter a deck at all. This is the
 * job that fixes that.
 *
 * Deliberately conservative. Commons search is full-text and will happily
 * answer "Kawasaki Ninja 400" with a ZX-6R; `commons-match.ts` throws out
 * everything it is not sure about, and a bike keeps no photograph rather than
 * the wrong one. Expect a hit rate well under half.
 *
 * ## Generations
 *
 * A search is by name, so what it finds is a photograph of *some* Z900. Where
 * the catalogue has divided a family into generations, a file that states its
 * year — "2018 Kawasaki Z900.jpg" — goes to the generation containing that
 * year, at `MODEL_YEAR` scope. One that does not goes to every generation at
 * `FAMILY` scope, and the page says so. No photograph is ever claimed for a
 * generation on less evidence than that.
 *
 *   npm run db:fetch-photos -- [--limit 200] [--since 2020] [--dry-run] [--retry]
 *
 * Safe to interrupt and re-run: it works through the bikes with no photographs,
 * newest and most-registered first, and records every attempt so a second run
 * continues rather than starting again.
 */

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
/** Wikimedia asks for a real contact address in the User-Agent. */
const CONTACT = process.env.WIKIMEDIA_CONTACT?.trim() || process.env.RDW_CONTACT?.trim();
const USER_AGENT = `MotoSwipe/0.1 (self-hosted motorcycle app${CONTACT ? `; ${CONTACT}` : ''}) Node`;

/**
 * How many bikes are searched at once.
 *
 * Search is not a cheap endpoint and it is rate limited harder than a plain
 * lookup. Run one of these at a time — several at once collect 429s within a
 * minute — and lower PHOTO_CONCURRENCY if a run still gets throttled.
 */
const CONCURRENCY = Number(process.env.PHOTO_CONCURRENCY) || 4;
/** A pause between a worker's own requests, so four workers is four, not forty. */
const REQUEST_DELAY_MS = 250;
/** Enough for a card and a small gallery; more is noise. */
const MAX_PHOTOS = 4;
/** Search results to consider per bike. Most matches are in the first few. */
const SEARCH_LIMIT = 16;
/** Rendered width — the card is at most a phone screen wide at 2x. */
const IMAGE_WIDTH = 1200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface CommonsPage {
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
}

/**
 * A search either answered or it did not.
 *
 * "Commons has no photograph of this motorcycle" is a fact worth recording so a
 * re-run skips the bike; "Commons declined to answer" is not, and recording it
 * as the former permanently marks a perfectly photographed bike as having
 * nothing.
 */
type SearchResult = { ok: true; pages: CommonsPage[] } | { ok: false };

/** Set once a 429 is seen, so every worker eases off rather than just the one. */
let throttledUntil = 0;

async function searchCommons(query: string): Promise<SearchResult> {
	const params = new URLSearchParams({
		action: 'query',
		format: 'json',
		formatversion: '2',
		generator: 'search',
		gsrsearch: query,
		gsrnamespace: '6',
		gsrlimit: String(SEARCH_LIMIT),
		prop: 'imageinfo',
		iiprop: 'url|size|extmetadata',
		iiurlwidth: String(IMAGE_WIDTH)
	});

	for (let attempt = 1; attempt <= 4; attempt++) {
		const wait = throttledUntil - Date.now();
		if (wait > 0) await sleep(wait);

		try {
			const response = await fetch(`${COMMONS_API}?${params}`, {
				headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
			});

			if (response.ok) {
				const payload = (await response.json()) as { query?: { pages?: CommonsPage[] } };
				return { ok: true, pages: payload.query?.pages ?? [] };
			}

			if (response.status === 429) {
				const retryAfter = Number(response.headers.get('retry-after')) || 5 * attempt;
				throttledUntil = Math.max(throttledUntil, Date.now() + retryAfter * 1000);
				console.warn(`  ! rate limited by Commons; pausing ${retryAfter}s`);
				continue;
			}

			if (response.status < 500) return { ok: true, pages: [] };
		} catch {
			// Fall through to the backoff below.
		}
		await sleep(attempt * 1500);
	}

	return { ok: false };
}

function arg(name: string): string | undefined {
	const index = process.argv.indexOf(`--${name}`);
	return index === -1 ? undefined : process.argv[index + 1];
}

/**
 * The model year a Commons file states, from its name or, failing that, its
 * description: uploaders write "2021 Yamaha MT-09" in the caption at least as
 * often as in the file name. The same adjacency rule applies to both — the
 * year has to sit beside the name — so a photo date or an event year in the
 * description proves nothing.
 */
function yearOf(
	page: CommonsPage,
	context: { manufacturerName: string; model: string }
): number | null {
	const fromTitle = yearInTitle(page.title, context);
	if (fromTitle) return fromTitle;

	const meta = page.imageinfo?.[0]?.extmetadata ?? {};
	for (const key of ['ObjectName', 'ImageDescription']) {
		const raw = meta[key]?.value;
		if (!raw) continue;
		const text = raw
			.replace(/<[^>]+>/g, ' ')
			.replace(/&[a-z]+;/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 200);
		const year = yearInTitle(`File:${text}.jpg`, context);
		if (year) return year;
	}
	return null;
}

/**
 * Which years to search for a generation: its last three, which is where the
 * photographs of a current model cluster, or all of a short one.
 */
function yearsToAsk(g: Generation, all: Generation[]): number[] {
	if (g.generationFrom === null) return [];
	const now = new Date().getFullYear();
	const to = Math.min(g.generationTo ?? now, now);
	const years: number[] = [];
	for (let y = to; y >= g.generationFrom && years.length < 3; y--) years.push(y);
	return all.length > 1 ? years : years.slice(0, 2);
}

interface Generation {
	id: string;
	generationFrom: number | null;
	generationTo: number | null;
	hasPhotos: boolean;
}

async function main() {
	const dryRun = process.argv.includes('--dry-run');
	// By default a bike that has already been searched is left alone. `--retry`
	// asks again, which is what to use after changing the matching rules.
	const retry = process.argv.includes('--retry');
	const limit = Number(arg('limit')) || undefined;
	// The bikes somebody shopping now will actually be shown come first.
	const since = Number(arg('since')) || undefined;
	// Only the cards whose photographs may be of another generation.
	const onlyFamily = process.argv.includes('--only-family');
	// Work from the most registered down, and stop where the market thins out.
	const minRegs = Number(arg('min-regs')) || 0;

	// A card with no photograph, or one whose only photographs may be of another
	// generation: both need a picture that is provably its own.
	const targets = await prisma.motorcycle.findMany({
		where: {
			isActive: true,
			OR: onlyFamily
				? [{ imageStatus: 'FAMILY_ONLY' }]
				: [{ images: { none: {} } }, { imageStatus: 'FAMILY_ONLY' }],
			...(retry ? {} : { photosSearchedAt: null }),
			...(since ? { lastRegistrationYear: { gte: since } } : {}),
			...(minRegs ? { registrationCount: { gte: minRegs } } : {})
		},
		select: {
			id: true,
			model: true,
			familyId: true,
			manufacturerId: true,
			registrationCount: true,
			lastRegistrationYear: true,
			manufacturer: { select: { name: true } }
		},
		// Newest first, then most registered: if this is interrupted, the bikes
		// somebody is most likely to be shown already have their pictures.
		orderBy: [
			{ lastRegistrationYear: { sort: 'desc', nulls: 'last' } },
			{ registrationCount: { sort: 'desc', nulls: 'last' } },
			{ model: 'asc' }
		],
		take: limit
	});

	if (!targets.length) {
		console.log('\n  Nothing to do — every active motorcycle has been searched.\n');
		return;
	}

	// Sibling models per manufacturer, so a Z900 search cannot accept a photo of
	// a Z900RS. Loaded once rather than per bike.
	const siblings = new Map<string, string[]>();
	for (const row of await prisma.motorcycle.findMany({
		where: { isActive: true },
		select: { manufacturerId: true, model: true }
	})) {
		siblings.set(row.manufacturerId, [...(siblings.get(row.manufacturerId) ?? []), row.model]);
	}

	console.log(
		`\n  Searching Commons for ${targets.length} motorcycles with no photograph${since ? ` (registered ${since} or later)` : ''}.\n`
	);

	let found = 0;
	let photos = 0;
	let dated = 0;
	let empty = 0;
	let unanswered = 0;
	let done = 0;

	// Families already searched this run: one search serves every generation.
	const searchedFamilies = new Set<string>();

	let next = 0;
	const takeNext = () => (next < targets.length ? targets[next++] : undefined);

	async function worker() {
		for (let bike = takeNext(); bike; bike = takeNext()) await searchFor(bike);
	}

	async function searchFor(bike: (typeof targets)[number]) {
		if (bike.familyId && searchedFamilies.has(bike.familyId)) {
			done++;
			return;
		}
		if (bike.familyId) searchedFamilies.add(bike.familyId);

		const context = {
			manufacturerName: bike.manufacturer.name,
			model: bike.model,
			siblingModels: siblings.get(bike.manufacturerId) ?? []
		};

		// Every generation of the family, so a dated file can go to the right one.
		const generations: Generation[] = bike.familyId
			? (
					await prisma.motorcycle.findMany({
						where: { familyId: bike.familyId, isActive: true },
						select: {
							id: true,
							generationFrom: true,
							generationTo: true,
							_count: { select: { images: true } }
						},
						orderBy: { generationFrom: 'asc' }
					})
				).map((g) => ({ ...g, hasPhotos: g._count.images > 0 }))
			: [{ id: bike.id, generationFrom: null, generationTo: null, hasPhotos: false }];
		const divided = generations.length > 1;

		let accepted: CommonsPage[] = [];
		let matchedAs = context.model;
		let answered = true;

		// The names photographers use: the canonical one, its recognisable
		// forms, and the curated aliases — "Tracer 700" for the Tracer 7,
		// "Z1000SX" for the Ninja 1000SX. Each is matched on its own terms.
		const curated = findCurated(context.manufacturerName, context.model);
		const searchNames = [
			...modelVariants(context.model),
			...(curated?.aliases ?? [])
				.filter((a) => !/^[A-Z]{2,4}\d{3,4}[A-Z-]*$/.test(a) && !/\(/.test(a))
				.slice(0, 3)
		].filter((v, i, all) => all.indexOf(v) === i);

		for (const variant of searchNames) {
			const attempt = { ...context, model: variant };
			const result = await searchCommons(buildSearchQuery(context.manufacturerName, variant));

			if (!result.ok) {
				answered = false;
				break;
			}

			accepted = rankCandidates(
				result.pages.filter((page) => {
					const info = page.imageinfo?.[0];
					return isPhotoOf(
						{ title: page.title, width: info?.width, height: info?.height },
						attempt
					);
				}),
				attempt
			);
			// A divided family can use more: several generations to fill.
			accepted = accepted.slice(0, divided ? MAX_PHOTOS * 2 : MAX_PHOTOS);

			if (accepted.length) {
				matchedAs = variant;
				break;
			}
			await sleep(REQUEST_DELAY_MS);
		}

		// A divided family needs photographs that state their year. Search for
		// each generation's years by name — "Yamaha MT-07 2019" — and keep only
		// files whose own name or caption states that year.
		if (answered && divided) {
			const dated: CommonsPage[] = [];
			for (const g of generations) {
				if (g.hasPhotos && g.generationFrom === null) continue;
				const years = yearsToAsk(g, generations);
				for (const year of years) {
					const result = await searchCommons(`${context.manufacturerName} ${matchedAs} ${year}`);
					if (!result.ok) break;
					for (const page of result.pages) {
						const info = page.imageinfo?.[0];
						if (
							!isPhotoOf(
								{ title: page.title, width: info?.width, height: info?.height },
								{ ...context, model: matchedAs }
							)
						)
							continue;
						if (yearOf(page, { ...context, model: matchedAs }) !== year) continue;
						if (
							!dated.some((d) => d.title === page.title) &&
							!accepted.some((a) => a.title === page.title)
						)
							dated.push(page);
					}
					await sleep(REQUEST_DELAY_MS);
				}
			}
			accepted = [...accepted, ...dated];
		}

		done++;
		const label = `${context.manufacturerName} ${context.model}`.slice(0, 44).padEnd(44);
		const via = matchedAs === context.model ? '' : `  (as "${matchedAs}")`;

		if (!answered) {
			unanswered++;
			console.log(`  [${String(done).padStart(4)}/${targets.length}] ${label} ? (will retry)`);
		} else if (!accepted.length) {
			empty++;
			console.log(`  [${String(done).padStart(4)}/${targets.length}] ${label} —`);
		} else {
			found++;
			photos += accepted.length;
		}

		if (!answered) return;

		// --- Where each photograph goes ------------------------------------------
		const placements: {
			generation: Generation;
			page: CommonsPage;
			scope: string;
			year: number | null;
		}[] = [];
		for (const page of accepted) {
			const year = yearOf(page, { ...context, model: matchedAs });
			const own = year
				? generations.find(
						(g) =>
							g.generationFrom !== null &&
							g.generationTo !== null &&
							year >= g.generationFrom &&
							year <= g.generationTo
					)
				: undefined;

			if (own && divided) {
				placements.push({ generation: own, page, scope: 'MODEL_YEAR', year });
				dated++;
			} else if (divided) {
				for (const generation of generations) {
					placements.push({ generation, page, scope: 'FAMILY', year: null });
				}
			} else {
				placements.push({
					generation: generations[0],
					page,
					scope: year ? 'MODEL_YEAR' : 'GENERATION',
					year
				});
			}
		}

		if (accepted.length) {
			const perGeneration = generations
				.map((g) => placements.filter((p) => p.generation.id === g.id).length)
				.join('/');
			console.log(
				`  [${String(done).padStart(4)}/${targets.length}] ${label} ${accepted.length} photo${accepted.length === 1 ? '' : 's'}${divided ? ` → ${perGeneration}` : ''}${via}`
			);
		}

		if (dryRun) return;

		// Evidence of the generation itself outranks the family's photographs.
		const rank = (scope: string) => (scope === 'FAMILY' ? 1 : 0);
		for (const generation of generations) {
			const mine = placements
				.filter((p) => p.generation.id === generation.id)
				.sort((a, b) => rank(a.scope) - rank(b.scope))
				.slice(0, MAX_PHOTOS);

			const existing = await prisma.motorcycleImage.findMany({
				where: { motorcycleId: generation.id },
				select: { url: true }
			});
			const known = new Set(existing.map((i) => i.url));
			let order = existing.length;

			for (const placement of mine) {
				const info = placement.page.imageinfo?.[0];
				const url = info?.thumburl ?? info?.url;
				if (!url || known.has(url)) continue;
				known.add(url);

				await prisma.motorcycleImage.create({
					data: {
						motorcycleId: generation.id,
						url,
						sourceUrl: info?.descriptionurl ?? null,
						isPrimary: order === 0,
						sortOrder: order++,
						width: info?.thumbwidth ?? info?.width ?? null,
						height: info?.thumbheight ?? info?.height ?? null,
						imageType: 'PHOTO',
						// Marks this as ours rather than a provider's, so a
						// catalogue rebuild leaves it alone.
						source: 'commons-search',
						scope: placement.scope as never,
						modelYear: placement.year,
						license: 'cc',
						evidence: placement.year
							? `file name or caption states ${placement.year}`
							: `found by searching Commons for "${matchedAs}"`,
						// Commons photographs are overwhelmingly CC BY-SA, which
						// requires a credit line. No attribution, no image.
						attribution: buildAttribution(info?.extmetadata, placement.page.title)
					}
				});
			}
		}

		// One search served the whole family.
		await prisma.motorcycle.updateMany({
			where: { id: { in: generations.map((g) => g.id) } },
			data: { photosSearchedAt: new Date() }
		});

		// A card's eligibility follows its photograph immediately.
		await reassessImages(
			generations.map((g) => g.id),
			() => ({ ...context, otherBrands: [] })
		);

		await sleep(REQUEST_DELAY_MS);
	}

	await Promise.all(Array.from({ length: CONCURRENCY }, worker));

	console.log(`\n  searched           ${done}`);
	console.log(`  bikes with photos  ${found}`);
	console.log(`  photographs added  ${photos}`);
	console.log(`  dated to a year    ${dated}`);
	console.log(`  nothing found      ${empty}`);
	if (unanswered) {
		console.log(`  no answer          ${unanswered} (left unmarked — run again to retry)`);
	}
	console.log('');
}

main()
	.catch((error) => {
		console.error('\nPhoto search failed:', error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});

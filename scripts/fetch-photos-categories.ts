import 'dotenv/config';
import { prisma } from '../src/lib/server/db/client';
import { buildAttribution } from '../src/lib/server/importers/providers/wikipedia/wikipedia.provider';
import { reassessImages } from '../src/lib/server/catalog/assess';
import {
	chooseFamilyCategory,
	isFamilyPhoto,
	isFamilySubcategory,
	placeFile,
	type CategoryFile,
	type GenerationSpanLike
} from '../src/lib/server/importers/photos/commons-categories';

/**
 * Walks Wikimedia Commons category trees for photographs the search job could
 * not find, and places each one at the narrowest scope its evidence supports.
 *
 *   npm run db:fetch-photos:categories -- [--since 2020] [--limit 200] [--dry-run] [--retry]
 *                                        [--only "Sport Glide"]
 *
 * `--only` walks just the families whose maker and name contain the text,
 * whether or not they were walked before.
 *
 * Works through the modern families whose cards are not yet eligible — no
 * photograph, or only a family-level one — most registered first, one
 * category search and one or two listing calls per family. Category listings
 * and file lookups are cheap; only the category search counts against the
 * search rate limit, so this runs several times faster than the search job.
 */

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const CONTACT = process.env.WIKIMEDIA_CONTACT?.trim() || process.env.RDW_CONTACT?.trim();
const USER_AGENT = `MotoSwipe/0.1 (self-hosted motorcycle app${CONTACT ? `; ${CONTACT}` : ''}) Node`;
const CONCURRENCY = Number(process.env.PHOTO_CONCURRENCY) || 2;
const REQUEST_DELAY_MS = 300;
/** Per generation, new photographs added by this job. */
const MAX_NEW_PER_GENERATION = 4;
const MAX_CATEGORY_FILES = 120;
const IMAGE_WIDTH = 1200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let throttledUntil = 0;

async function api(params: Record<string, string>): Promise<unknown | undefined> {
	const query = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
	for (let attempt = 1; attempt <= 4; attempt++) {
		const wait = throttledUntil - Date.now();
		if (wait > 0) await sleep(wait);
		try {
			const response = await fetch(`${COMMONS_API}?${query}`, {
				headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
			});
			if (response.ok) return await response.json();
			if (response.status === 429) {
				const retryAfter = Number(response.headers.get('retry-after')) || 5 * attempt;
				throttledUntil = Math.max(throttledUntil, Date.now() + retryAfter * 1000);
				console.warn(`  ! rate limited by Commons; pausing ${retryAfter}s`);
				continue;
			}
			if (response.status < 500) return undefined;
		} catch {
			// backoff below
		}
		await sleep(attempt * 1500);
	}
	return undefined;
}

/**
 * Whether these category pages exist, by title — a plain lookup, which is not
 * rate limited the way search is. Most families are found this way and never
 * touch the search endpoint.
 */
async function existingCategories(titles: string[]): Promise<string[] | undefined> {
	const result = (await api({
		action: 'query',
		titles: titles.join('|'),
		prop: 'info'
	})) as { query?: { pages?: { title: string; missing?: boolean }[] } } | undefined;
	if (!result) return undefined;
	return (result.query?.pages ?? []).filter((p) => !p.missing).map((p) => p.title);
}

/** The spellings a family's category is likely to carry. */
function categoryGuesses(manufacturerName: string, model: string): string[] {
	const tight = model.replace(/\s+/g, '');
	const spaced = model.replace(/(\d)([A-Za-z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2');
	return [
		...new Set([
			`Category:${manufacturerName} ${model}`,
			`Category:${manufacturerName} ${tight}`,
			`Category:${manufacturerName} ${spaced}`,
			`Category:${manufacturerName} ${model.replace(/-/g, ' ')}`,
			`Category:${manufacturerName} ${model.replace(/ /g, '-')}`
		])
	];
}

async function searchCategories(query: string): Promise<string[] | undefined> {
	const result = (await api({
		action: 'query',
		list: 'search',
		srsearch: query,
		srnamespace: '14',
		srlimit: '8'
	})) as { query?: { search?: { title: string }[] } } | undefined;
	if (!result) return undefined;
	return (result.query?.search ?? []).map((s) => s.title);
}

async function categoryMembers(
	title: string
): Promise<{ files: string[]; subcategories: string[] } | undefined> {
	const result = (await api({
		action: 'query',
		list: 'categorymembers',
		cmtitle: title,
		cmtype: 'file|subcat',
		cmlimit: String(MAX_CATEGORY_FILES)
	})) as { query?: { categorymembers?: { title: string; ns: number }[] } } | undefined;
	if (!result) return undefined;
	const members = result.query?.categorymembers ?? [];
	return {
		files: members.filter((m) => m.ns === 6).map((m) => m.title),
		subcategories: members.filter((m) => m.ns === 14).map((m) => m.title)
	};
}

interface ImageInfoPage {
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

async function fileInfo(titles: string[]): Promise<ImageInfoPage[]> {
	const pages: ImageInfoPage[] = [];
	for (let i = 0; i < titles.length; i += 40) {
		const result = (await api({
			action: 'query',
			titles: titles.slice(i, i + 40).join('|'),
			prop: 'imageinfo',
			iiprop: 'url|size|extmetadata',
			iiurlwidth: String(IMAGE_WIDTH)
		})) as { query?: { pages?: ImageInfoPage[] } } | undefined;
		pages.push(...(result?.query?.pages ?? []));
		await sleep(REQUEST_DELAY_MS);
	}
	return pages;
}

function arg(name: string): string | undefined {
	const index = process.argv.indexOf(`--${name}`);
	return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
	const dryRun = process.argv.includes('--dry-run');
	const retry = process.argv.includes('--retry');
	const limit = Number(arg('limit')) || undefined;
	const since = Number(arg('since')) || 2020;
	const minRegs = Number(arg('min-regs')) || 0;
	const only = arg('only')?.toLowerCase();

	// Families with a modern generation that is not yet eligible for want of a
	// photograph, most registered first.
	const candidates = await prisma.motorcycle.findMany({
		where: {
			isActive: true,
			familyId: { not: null },
			imageStatus: { in: ['NONE', 'FAMILY_ONLY'] },
			...(minRegs ? { registrationCount: { gte: minRegs } } : {}),
			OR: [
				{ generationTo: { gte: since } },
				{ AND: [{ generationTo: null }, { lastRegistrationYear: { gte: since } }] }
			]
		},
		select: {
			familyId: true,
			registrationCount: true,
			family: {
				select: {
					id: true,
					name: true,
					categorySearchedAt: true,
					manufacturer: { select: { name: true } }
				}
			}
		},
		orderBy: { registrationCount: { sort: 'desc', nulls: 'last' } }
	});

	const familyIds: string[] = [];
	for (const c of candidates) {
		if (!c.familyId || familyIds.includes(c.familyId)) continue;
		if (only) {
			const label = `${c.family?.manufacturer.name ?? ''} ${c.family?.name ?? ''}`.toLowerCase();
			if (!label.includes(only)) continue;
		} else if (!retry && c.family?.categorySearchedAt) continue;
		familyIds.push(c.familyId);
		if (limit && familyIds.length >= limit) break;
	}

	if (!familyIds.length) {
		console.log('\n  Nothing to do.\n');
		return;
	}

	const siblings = new Map<string, string[]>();
	for (const row of await prisma.modelFamily.findMany({
		select: { manufacturerId: true, name: true }
	})) {
		siblings.set(row.manufacturerId, [...(siblings.get(row.manufacturerId) ?? []), row.name]);
	}
	const brands = [
		...new Set(
			(await prisma.manufacturer.findMany({ select: { matchKey: true } }))
				.map((m) => m.matchKey)
				.filter((k): k is string => !!k)
		)
	];

	console.log(`\n  Walking Commons categories for ${familyIds.length} families.\n`);

	let done = 0;
	let withCategory = 0;
	let added = 0;
	let dated = 0;
	let generationDated = 0;
	let next = 0;
	const takeNext = () => (next < familyIds.length ? familyIds[next++] : undefined);

	async function worker() {
		for (let id = takeNext(); id; id = takeNext()) await walkFamily(id);
	}

	async function walkFamily(familyId: string) {
		const family = await prisma.modelFamily.findUnique({
			where: { id: familyId },
			select: {
				id: true,
				name: true,
				manufacturerId: true,
				manufacturer: { select: { name: true, matchKey: true } },
				generations: {
					where: { isActive: true },
					orderBy: { generationFrom: 'asc' },
					select: {
						id: true,
						generationFrom: true,
						generationTo: true,
						images: { select: { url: true, scope: true } }
					}
				}
			}
		});
		if (!family) return;
		done++;

		const context = {
			manufacturerName: family.manufacturer.name,
			model: family.name,
			siblingModels: (siblings.get(family.manufacturerId) ?? []).filter((m) => m !== family.name),
			otherBrands: brands.filter((b) => b !== family.manufacturer.matchKey)
		};
		const label = `${context.manufacturerName} ${context.model}`.slice(0, 40).padEnd(40);
		const progress = `[${String(done).padStart(4)}/${familyIds.length}]`;

		let found = await existingCategories(categoryGuesses(context.manufacturerName, context.model));
		if (found && !found.length) {
			found = await searchCategories(`${context.manufacturerName} ${context.model}`);
		}
		if (!found) {
			console.log(`  ${progress} ${label} ? (Commons did not answer)`);
			return;
		}
		let category = chooseFamilyCategory(found, context);
		// No category of its own: an "R 1250 GS Adventure" is filed under the
		// R 1250 GS. Walk the parent; every file still has to name the full
		// model itself, so nothing of the parent's own is taken.
		if (!category) {
			const words = context.model.split(/\s+/);
			const parents: string[] = [];
			for (let cut = words.length - 1; cut >= 1; cut--) parents.push(words.slice(0, cut).join(' '));
			// A one-word model is filed under its letters: "SH150i" under "Honda SH".
			const letters = /^([A-Za-z]{2,})\d/.exec(context.model);
			if (words.length === 1 && letters) parents.push(letters[1]);
			for (const parent of parents) {
				if (category) break;
				const parentFound = await existingCategories(
					categoryGuesses(context.manufacturerName, parent)
				);
				category = parentFound?.length
					? chooseFamilyCategory(parentFound, { ...context, model: parent })
					: undefined;
				await sleep(REQUEST_DELAY_MS);
			}
		}
		if (!category) {
			console.log(`  ${progress} ${label} — no category`);
			if (!dryRun) await markSearched(family.id);
			return;
		}
		withCategory++;

		const root = await categoryMembers(category);
		if (!root) return;
		const files: { title: string; subcategory?: string }[] = root.files.map((t) => ({ title: t }));
		for (const sub of root.subcategories) {
			if (!isFamilySubcategory(sub, context)) continue;
			const inner = await categoryMembers(sub);
			for (const t of inner?.files ?? []) files.push({ title: t, subcategory: sub });
			await sleep(REQUEST_DELAY_MS);
		}

		const known = new Set(family.generations.flatMap((g) => g.images.map((i) => i.url)));
		const pages = await fileInfo(files.map((f) => f.title));
		const bySub = new Map(files.map((f) => [f.title, f.subcategory]));

		const spans: GenerationSpanLike[] = family.generations.map((g) => ({
			id: g.id,
			from: g.generationFrom,
			to: g.generationTo
		}));
		const addedPer = new Map<string, number>();
		let familyAdded = 0;
		let familyDated = 0;

		for (const page of pages) {
			const info = page.imageinfo?.[0];
			const url = info?.thumburl ?? info?.url;
			if (!info || !url || known.has(url)) continue;
			const meta = info.extmetadata ?? {};
			const file: CategoryFile = {
				title: page.title,
				url,
				sourceUrl: info.descriptionurl ?? null,
				width: info.width ?? null,
				height: info.height ?? null,
				description: meta.ImageDescription?.value ?? '',
				takenOn: meta.DateTimeOriginal?.value ?? null,
				subcategory: bySub.get(page.title)
			};
			if (!isFamilyPhoto(file, context)) continue;

			const placement = placeFile(file, context, spans);
			const targets =
				placement.scope === 'FAMILY' ? spans.map((s) => s.id) : [placement.generationId];

			for (const generationId of targets) {
				if ((addedPer.get(generationId) ?? 0) >= MAX_NEW_PER_GENERATION) continue;
				addedPer.set(generationId, (addedPer.get(generationId) ?? 0) + 1);
				familyAdded++;
				if (placement.scope === 'MODEL_YEAR') familyDated++;
				if (placement.scope === 'GENERATION' && spans.length > 1) generationDated++;
				if (dryRun) continue;

				const existing = await prisma.motorcycleImage.count({
					where: { motorcycleId: generationId }
				});
				await prisma.motorcycleImage.create({
					data: {
						motorcycleId: generationId,
						url,
						sourceUrl: file.sourceUrl,
						isPrimary: existing === 0,
						sortOrder: existing,
						width: info.thumbwidth ?? info.width ?? null,
						height: info.thumbheight ?? info.height ?? null,
						imageType: 'PHOTO',
						source: 'commons-category',
						scope: placement.scope,
						modelYear: placement.scope === 'MODEL_YEAR' ? placement.year : null,
						evidence: placement.evidence,
						license: 'cc',
						attribution: buildAttribution(meta, page.title)
					}
				});
			}
			known.add(url);
		}

		added += familyAdded;
		dated += familyDated;
		console.log(
			`  ${progress} ${label} ${category.replace(/^Category:/, '').padEnd(34)} ${files.length} files → ${familyAdded} added, ${familyDated} dated`
		);

		if (!dryRun) {
			await markSearched(family.id);
			await reassessImages(
				spans.map((s) => s.id),
				() => context
			);
		}
		await sleep(REQUEST_DELAY_MS);
	}

	await Promise.all(Array.from({ length: CONCURRENCY }, worker));

	console.log(`\n  families walked      ${done}`);
	console.log(`  with a category      ${withCategory}`);
	console.log(`  photographs added    ${added}`);
	console.log(`  dated to a year      ${dated}`);
	console.log(`  dated by photo date  ${generationDated}`);
	console.log('');
}

async function markSearched(familyId: string) {
	await prisma.modelFamily.update({
		where: { id: familyId },
		data: { categorySearchedAt: new Date() }
	});
}

main()
	.catch((error) => {
		console.error('\nCategory walk failed:', error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});

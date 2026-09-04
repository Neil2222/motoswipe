import type {
	ListOptions,
	MotorcycleProvider,
	NormalizedImage,
	NormalizedMotorcycle,
	ProviderListing,
	RawMotorcycle
} from '../../types';
import { prisma } from '../../../db/client';
import { normalizeBrand, normalizeModel } from '../../match';
import { stripMarkup } from '../wikipedia/infobox';
import { buildAttribution, isUsablePhotoFile } from '../wikipedia/wikipedia.provider';
import { isPhotoOf, yearInTitle } from '../../photos/commons-match';
import { inferRidingPosition } from '../wikipedia/categories';
import { mapBauart, parseInfoboxMotorrad, type InfoboxMotorrad } from './infobox-motorrad';

/**
 * German Wikipedia as a specification source.
 *
 * The English encyclopedia has an article for about one in ten of the
 * motorcycles on Dutch roads since 2020. The German one has an article for most
 * of them, and its `Infobox Motorrad` states exactly the figures the English
 * one so often lacks: seat height (`Sitzhöhe`), torque (`Drehmoment`), rated
 * power, and a category (`Bauart`) written by a person rather than guessed
 * from a name. Its photographs are captioned "Baujahr 2021", which is a model
 * year in so many words.
 *
 * Articles are found from the catalogue rather than the other way round: for
 * every modern family the registry knows, one title search on de.wikipedia,
 * and only a title that is exactly the brand and model — spacing aside, since
 * German titles write "Kawasaki Z 900" — is accepted. Nothing here is guessed
 * from a near miss.
 *
 * Wikipedia text is CC BY-SA and the photographs are Commons files with their
 * own licences; both are credited.
 */

const API = 'https://de.wikipedia.org/w/api.php';
const IMAGE_WIDTH = 1200;
const MAX_IMAGES = 5;
const REQUEST_DELAY_MS = 250;
/** Families first registered before this are not the ones this is for. */
const MODERN_SINCE = 2015;

function userAgent(): string {
	const contact = process.env.WIKIMEDIA_CONTACT?.trim();
	return `MotoSwipe/0.1 (self-hosted motorcycle app${contact ? `; ${contact}` : ''}) Node`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(base: string, params: Record<string, string>): Promise<unknown> {
	const query = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
	for (let attempt = 1; attempt <= 4; attempt++) {
		try {
			const response = await fetch(`${base}?${query}`, {
				headers: { 'User-Agent': userAgent(), Accept: 'application/json' }
			});
			if (response.ok) return await response.json();
			if (response.status === 429 || response.status >= 500) {
				const retryAfter = Number(response.headers.get('retry-after')) || 3 * attempt;
				await sleep(retryAfter * 1000);
				continue;
			}
			throw new Error(`${response.status} from ${new URL(base).host}`);
		} catch (error) {
			if (attempt === 4) throw error;
			await sleep(attempt * 1500);
		}
	}
	throw new Error('de.wikipedia request failed');
}

export interface DeWikiRecord {
	/** `de:<title>` */
	externalId: string;
	title: string;
	manufacturerName: string;
	/** The catalogue's canonical family name this article was matched to. */
	model: string;
	wikitext?: string;
	fields?: InfoboxMotorrad | null;
	images?: NormalizedImage[];
}

/** A caption's stated model year: "Baujahr 2021", "Modelljahr 2019", "(2020)". */
export function captionYear(caption: string, now = new Date().getFullYear()): number | undefined {
	const text = stripMarkup(caption);
	const explicit = /\b(?:Baujahr|Modelljahr|Modell|Bj\.?)\s*((?:19|20)\d{2})\b/i.exec(text);
	const year = explicit ? Number(explicit[1]) : undefined;
	if (year !== undefined && year <= now + 1) return year;
	return undefined;
}

/** Every `[[Datei:…|…|caption]]` in an article, with its caption. */
export function articleFiles(wikitext: string): { file: string; caption: string }[] {
	const out: { file: string; caption: string }[] = [];
	const pattern = /\[\[(?:Datei|File|Bild|Image):([^|\]]+)((?:\|[^\]]*)?)\]\]/g;
	for (const match of wikitext.matchAll(pattern)) {
		const parts = match[2].split('|').map((p) => p.trim());
		const caption = parts.length ? parts[parts.length - 1] : '';
		out.push({ file: match[1].trim(), caption });
	}
	return out;
}

export class WikipediaDeProvider implements MotorcycleProvider {
	readonly source = 'wikipedia-de';
	readonly displayName = 'German Wikipedia — Infobox Motorrad (CC BY-SA)';
	readonly requiresNetwork = true;
	readonly mergeByModelName = true;

	private index = new Map<string, DeWikiRecord>();

	/**
	 * The modern families the registry knows, each looked up once by title.
	 */
	async listMotorcycles(options: ListOptions = {}): Promise<ProviderListing[]> {
		// A refresh re-reads the articles already matched, without the lookup
		// pass — the expensive half under Wikimedia's per-IP rate limit.
		if (process.env.WIKIPEDIA_DE_REFRESH === '1') return this.listKnown();

		const families = await prisma.modelFamily.findMany({
			where: {
				generations: {
					some: {
						isActive: true,
						OR: [
							{ generationTo: { gte: MODERN_SINCE } },
							{ AND: [{ generationTo: null }, { lastRegistrationYear: { gte: MODERN_SINCE } }] }
						]
					}
				}
			},
			select: {
				name: true,
				manufacturer: { select: { name: true } },
				generations: { select: { registrationCount: true } }
			}
		});

		const ranked = families
			.map((f) => ({
				manufacturerName: f.manufacturer.name,
				model: f.name,
				registrations: f.generations.reduce((s, g) => s + (g.registrationCount ?? 0), 0)
			}))
			// Below a few dozen registrations the article, if any, is not worth a
			// lookup for a discovery catalogue.
			.filter((f) => f.registrations >= 30)
			.sort((a, b) => b.registrations - a.registrations)
			.slice(0, options.limit ?? families.length);

		this.index.clear();
		const listings: ProviderListing[] = [];
		let done = 0;

		for (const family of ranked) {
			const title = await this.findArticle(family.manufacturerName, family.model);
			done++;
			if (done % 50 === 0) {
				console.log(
					`  [wikipedia-de] looked up ${done}/${ranked.length} families, ${listings.length} articles`
				);
			}
			if (!title) continue;
			const externalId = `de:${title}`;
			if (this.index.has(externalId)) continue;
			this.index.set(externalId, {
				externalId,
				title,
				manufacturerName: family.manufacturerName,
				model: family.model
			});
			listings.push({
				externalId,
				label: `${family.manufacturerName} ${family.model} → de:${title}`,
				sourceUrl: `https://de.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
			});
		}
		return listings;
	}

	private async listKnown(): Promise<ProviderListing[]> {
		// WIKIPEDIA_DE_TITLES="Kawasaki Z 400,Suzuki SV 650" narrows a refresh to
		// the articles named, for a re-read after a parser fix.
		const only = (process.env.WIKIPEDIA_DE_TITLES ?? '')
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		const records = (
			await prisma.sourceRecord.findMany({
				where: { source: 'wikipedia-de' },
				select: { externalId: true, manufacturerName: true, model: true }
			})
		).filter((r) => !only.length || only.includes(r.externalId.replace(/^de:/, '')));
		this.index.clear();
		return records.map((r) => {
			const title = r.externalId.replace(/^de:/, '');
			this.index.set(r.externalId, {
				externalId: r.externalId,
				title,
				manufacturerName: r.manufacturerName,
				model: r.model
			});
			return {
				externalId: r.externalId,
				label: `${r.manufacturerName} ${r.model} → ${r.externalId}`,
				sourceUrl: `https://de.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
			};
		});
	}

	/**
	 * The article whose title is exactly this brand and model, or nothing.
	 *
	 * German titles space the designation out — "Kawasaki Z 900", "Honda NC 750
	 * X" — so the likely spellings are looked up directly first, which is a
	 * cheap page lookup that follows redirects. Search is the fallback.
	 */
	private async findArticle(manufacturerName: string, model: string): Promise<string | undefined> {
		const wanted = normalizeBrand(manufacturerName) + normalizeModel(model);
		const matches = (title: string) =>
			title
				.replace(/\s*\([^)]*\)\s*$/, '')
				.toLowerCase()
				.replace(/[^a-z0-9]/g, '') === wanted;

		const spaced = model.replace(/(\d)([A-Za-z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2');
		const guesses = [
			...new Set([
				`${manufacturerName} ${model}`,
				`${manufacturerName} ${spaced}`,
				`${manufacturerName} ${model.replace(/-/g, ' ')}`,
				`${manufacturerName} ${spaced.replace(/-/g, ' ')}`
			])
		];
		const direct = (await api(API, {
			action: 'query',
			titles: guesses.join('|'),
			redirects: '1',
			prop: 'info'
		})) as { query?: { pages?: { title: string; missing?: boolean }[] } };
		for (const page of direct.query?.pages ?? []) {
			if (!page.missing && matches(page.title)) return page.title;
		}
		await sleep(REQUEST_DELAY_MS);

		const payload = (await api(API, {
			action: 'query',
			list: 'search',
			srsearch: `intitle:"${manufacturerName} ${model}"`,
			srlimit: '5'
		})) as { query?: { search?: { title: string }[] } };
		await sleep(REQUEST_DELAY_MS);
		for (const hit of payload.query?.search ?? []) {
			if (matches(hit.title)) return hit.title;
		}
		return undefined;
	}

	async fetchMotorcycle(externalId: string): Promise<RawMotorcycle> {
		const record = this.index.get(externalId);
		if (!record) throw new Error(`No de.wikipedia record ${externalId}`);
		if (record.wikitext !== undefined) return record;

		const payload = (await api(API, {
			action: 'query',
			prop: 'revisions',
			rvprop: 'content',
			rvslots: 'main',
			redirects: '1',
			titles: record.title
		})) as {
			query?: { pages?: { revisions?: { slots?: { main?: { content?: string } } }[] }[] };
		};
		record.wikitext = payload.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content ?? '';
		record.fields = parseInfoboxMotorrad(record.wikitext);
		record.images = await this.resolveImages(record);
		await sleep(REQUEST_DELAY_MS);
		return record;
	}

	/**
	 * The article's photographs, each with the model year its caption states.
	 *
	 * The infobox image is the editors' choice and is kept if nothing proves it
	 * wrong; every other file must name the model. A caption that says
	 * "Baujahr 2021" makes the file evidence of that model year.
	 */
	private async resolveImages(record: DeWikiRecord): Promise<NormalizedImage[]> {
		const wikitext = record.wikitext ?? '';
		const context = { manufacturerName: record.manufacturerName, model: record.model };
		const wanted: { file: string; year?: number; lead: boolean }[] = [];

		const lead = record.fields?.image ? stripMarkup(record.fields.image) : '';
		if (lead && isUsablePhotoFile(lead)) {
			wanted.push({ file: lead, year: captionYear(record.fields?.imageCaption ?? ''), lead: true });
		}
		for (const { file, caption } of articleFiles(wikitext)) {
			if (wanted.length >= MAX_IMAGES) break;
			if (!isUsablePhotoFile(file) || wanted.some((w) => w.file === file)) continue;
			if (!isPhotoOf({ title: `File:${file}` }, context) && !captionYear(caption)) continue;
			// A dated caption is only trusted when the caption also names the
			// machine, or the file does.
			const named =
				isPhotoOf({ title: `File:${file}` }, context) ||
				stripMarkup(caption).toLowerCase().includes(record.model.toLowerCase().split(' ')[0]);
			if (!named) continue;
			wanted.push({
				file,
				year: captionYear(caption) ?? yearInTitle(`File:${file}`, context),
				lead: false
			});
		}
		if (!wanted.length) return [];

		// Asked of de.wikipedia rather than Commons directly: it answers for
		// Commons files and for its own local uploads alike, and a dated
		// "Baujahr 2021" photograph is often the latter.
		const payload = (await api(API, {
			action: 'query',
			titles: wanted.map((w) => `File:${w.file}`).join('|'),
			prop: 'imageinfo',
			iiprop: 'url|size|extmetadata',
			iiurlwidth: String(IMAGE_WIDTH)
		})) as {
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

		const alias = new Map((payload.query?.normalized ?? []).map((n) => [n.to, n.from]));
		const images: NormalizedImage[] = [];
		for (const page of payload.query?.pages ?? []) {
			const info = page.imageinfo?.[0];
			const url = info?.thumburl ?? info?.url;
			if (!info || !url) continue;
			if (info.width && info.height && (info.width < 640 || info.height < 400)) continue;
			const original = (alias.get(page.title) ?? page.title).replace(/^File:/, '');
			const want = wanted.find((w) => w.file === original || `File:${w.file}` === page.title);
			images.push({
				url,
				sourceUrl: info.descriptionurl ?? null,
				isPrimary: images.length === 0,
				sortOrder: images.length,
				width: info.thumbwidth ?? info.width ?? null,
				height: info.thumbheight ?? info.height ?? null,
				imageType: 'PHOTO',
				attribution: buildAttribution(info.extmetadata, page.title),
				modelYear: want?.year ?? null,
				evidence: want?.year
					? `de.wikipedia caption states Baujahr ${want.year}`
					: want?.lead
						? `infobox image of the de.wikipedia article "${record.title}"`
						: `used in the de.wikipedia article "${record.title}"`,
				license: 'cc'
			});
		}
		return images;
	}

	normalizeMotorcycle(raw: RawMotorcycle): NormalizedMotorcycle | null {
		const record = raw as DeWikiRecord;
		const f = record.fields;
		if (!f) return null;

		const { category, categoryRaw } = mapBauart(f.bauart);
		const from = f.productionFrom;
		const to = f.productionTo;

		return {
			manufacturerName: record.manufacturerName,
			manufacturerCountryCode: null,
			manufacturerWebsite: null,
			model: record.model,
			variant: null,
			modelYear: from ?? null,
			category,
			categoryRaw,
			description: null,
			tags: [],

			displacementCc: f.displacementCc ?? null,
			cylinders: f.cylinders ?? null,
			engineConfiguration: null,
			cooling: f.cooling ?? null,
			powerHp: f.powerHp ?? null,
			powerKw: f.powerKw ?? null,
			torqueNm: f.torqueNm ?? null,
			transmission: null,
			gears: f.gears ?? null,

			wetWeightKg: f.wetWeightKg ?? null,
			dryWeightKg: f.dryWeightKg ?? null,
			seatHeightMm: f.seatHeightMm ?? null,
			seatWidthMm: null,
			wheelbaseMm: f.wheelbaseMm ?? null,
			fuelCapacityLiters: f.fuelCapacityL ?? null,

			passengerAllowed: null,
			seatCount: null,
			passengerPegs: null,
			ridingPosition: category !== 'OTHER' ? (inferRidingPosition(category) ?? null) : null,
			licenseCategory: null,

			msrpAmount: null,
			msrpCurrency: null,
			marketCountryCode: null,
			availableNew: to === undefined && from !== undefined ? true : to !== undefined ? false : null,

			eraFrom: from ?? null,
			eraTo: to ?? null,

			confidence: {
				// A figure stated for a named model, but from an article that may
				// describe several years at once: "79,5, ab 2020 82" gives the first.
				seatHeightMm: 0.75,
				torqueNm: 0.75,
				powerHp: 0.7,
				powerKw: 0.7,
				wetWeightKg: 0.6,
				displacementCc: 0.7,
				category: 0.7,
				availableNew: 0.4
			},

			externalId: record.externalId,
			sourceUrl: `https://de.wikipedia.org/wiki/${encodeURIComponent(record.title.replace(/ /g, '_'))}`,
			images: record.images ?? []
		};
	}
}

export const wikipediaDeProvider = new WikipediaDeProvider();

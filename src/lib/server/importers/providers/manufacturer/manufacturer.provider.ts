import type {
	ListOptions,
	MotorcycleProvider,
	NormalizedMotorcycle,
	ProviderListing,
	RawMotorcycle
} from '../../types';
import { OFFICIAL_PAGES, type OfficialPage } from './official-pages';
import {
	pageNames,
	parseBmwPages,
	parseHondaPage,
	parseSuzukiPage,
	parseKawasakiPage,
	parseKtmPages,
	parseTriumphPage,
	parseYamahaPage,
	type OfficialSpecs
} from './pages';

/**
 * The manufacturers' own Dutch model pages as a source.
 *
 * For the motorcycles on sale now this is the best evidence there is: the
 * maker's stated seat height, torque, power and weight, the list price, an
 * official photograph of the current model year, and the fact of the model
 * being in the current catalogue at all.
 *
 * ## The photographs are not ours
 *
 * Manufacturer photography is copyrighted and its terms do not permit
 * redistribution. So this provider never downloads or stores an image file.
 * It records the image's URL on the maker's own site, marks it
 * `license: 'manufacturer'`, and the card shows it by linking to it —
 * embedding freely accessible content from its source, which is the one use
 * that does not make a copy. Self-hosting (`localPath`) is refused for these
 * by the image pipeline, and the whole behaviour can be switched off with
 * `MANUFACTURER_IMAGES=off`, in which case only the specifications are taken.
 * For a private, self-hosted instance this is a reasonable position; for a
 * public deployment, ask the makers or switch it off.
 *
 * ## What it claims
 *
 * Only what the page says. A page that no longer names the model is skipped.
 * Figures are stored with source `manufacturer`, and the page URL is the
 * provenance for every one of them.
 */

const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 MotoSwipe/0.1';
const REQUEST_DELAY_MS = 1200;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface OfficialRecord {
	page: OfficialPage;
	fetchedAt: string;
	specs: OfficialSpecs;
	/** True when the page named the model it is supposed to be about. */
	confirmed: boolean;
}

export function imagesEnabled(): boolean {
	return (process.env.MANUFACTURER_IMAGES ?? 'hotlink').toLowerCase() !== 'off';
}

export class ManufacturerProvider implements MotorcycleProvider {
	readonly source = 'manufacturer';
	readonly displayName =
		'Manufacturer model pages (NL) — specifications, list price, official image (hotlinked)';
	readonly requiresNetwork = true;
	readonly mergeByModelName = true;

	private cache = new Map<string, OfficialRecord>();

	async listMotorcycles(options: ListOptions = {}): Promise<ProviderListing[]> {
		return OFFICIAL_PAGES.slice(0, options.limit ?? OFFICIAL_PAGES.length).map((page) => ({
			externalId: page.url,
			label: `${page.brand} ${page.family}`,
			sourceUrl: page.url
		}));
	}

	async fetchMotorcycle(externalId: string): Promise<RawMotorcycle> {
		const cached = this.cache.get(externalId);
		if (cached) return cached;
		const page = OFFICIAL_PAGES.find((p) => p.url === externalId);
		if (!page) throw new Error(`No official page ${externalId}`);

		const rendered = page.maker === 'bmw';
		const html = await this.download(page.url, rendered);
		const specsHtml = page.specsUrl ? await this.download(page.specsUrl, rendered) : '';

		const confirmed = html.length > 0 && pageNames(html, page.expect);
		const specs = !confirmed
			? {}
			: page.maker === 'honda'
				? parseHondaPage(html, page.family, page.assetFolder)
				: page.maker === 'suzuki'
					? parseSuzukiPage(html)
					: page.maker === 'triumph'
						? parseTriumphPage(specsHtml, page.family, html)
						: page.maker === 'ktm'
							? parseKtmPages(html, specsHtml)
							: page.maker === 'kawasaki'
								? parseKawasakiPage(html)
								: page.maker === 'bmw'
									? parseBmwPages(html, specsHtml, page.assetFolder ?? '')
									: parseYamahaPage(html);

		const record: OfficialRecord = {
			page,
			fetchedAt: new Date().toISOString().slice(0, 10),
			specs,
			confirmed
		};
		this.cache.set(externalId, record);
		return record;
	}

	private async download(url: string, rendered = false): Promise<string> {
		let html = '';
		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				if (rendered) {
					html = await downloadWithBrowser(url);
					break;
				}
				const response = await fetch(url, {
					headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
					redirect: 'follow'
				});
				if (response.ok) {
					html = await response.text();
					break;
				}
				if (response.status === 404) break;
			} catch {
				// retry below
			}
			await sleep(attempt * 2000);
		}
		await sleep(REQUEST_DELAY_MS);
		return html;
	}

	normalizeMotorcycle(raw: RawMotorcycle): NormalizedMotorcycle | null {
		const record = raw as OfficialRecord;
		if (!record.confirmed) return null;
		const { page, specs } = record;
		const year = specs.modelYear ?? Number(record.fetchedAt.slice(0, 4));

		const image = imagesEnabled() && specs.image ? specs.image : undefined;

		return {
			manufacturerName: brandName(page.brand),
			manufacturerCountryCode: null,
			manufacturerWebsite: null,
			model: page.family,
			variant: null,
			modelYear: year,
			category: 'OTHER',
			categoryRaw: null,
			description: null,
			tags: [],

			displacementCc: specs.displacementCc ?? null,
			cylinders: null,
			engineConfiguration: null,
			cooling: null,
			powerHp: specs.powerHp ?? null,
			powerKw: specs.powerKw ?? null,
			torqueNm: specs.torqueNm ?? null,
			transmission: null,
			gears: null,

			wetWeightKg: specs.wetWeightKg ?? null,
			dryWeightKg: specs.dryWeightKg ?? null,
			seatHeightMm: specs.seatHeightMm ?? null,
			seatWidthMm: null,
			wheelbaseMm: specs.wheelbaseMm ?? null,
			fuelCapacityLiters: specs.fuelCapacityL ?? null,

			passengerAllowed: null,
			seatCount: null,
			passengerPegs: null,
			ridingPosition: null,
			licenseCategory: null,

			msrpAmount: specs.priceEur ?? null,
			msrpCurrency: specs.priceEur ? 'EUR' : null,
			marketCountryCode: 'NL',
			// Listed in the maker's current Dutch catalogue: on sale new, today.
			availableNew: true,

			// The record describes the current model year, which keeps it in the
			// current generation of a divided family.
			eraFrom: year,
			eraTo: year,

			confidence: {
				seatHeightMm: 0.95,
				torqueNm: 0.95,
				powerHp: 0.95,
				powerKw: 0.95,
				wetWeightKg: 0.9,
				displacementCc: 0.9,
				wheelbaseMm: 0.9,
				fuelCapacityLiters: 0.9,
				msrpAmount: 0.9,
				msrpCurrency: 0.9,
				availableNew: 0.95,
				// Says nothing about category; must never win it.
				category: 0
			},

			externalId: page.url,
			sourceUrl: page.url,
			images: image
				? [
						{
							url: image.url,
							sourceUrl: page.url,
							isPrimary: true,
							sortOrder: 0,
							imageType: 'STUDIO',
							attribution: `© ${brandName(page.brand)} — official ${brandName(page.brand)} NL model page, shown from its source (fetched ${record.fetchedAt})`,
							modelYear: image.modelYear ?? year,
							evidence: image.modelYear
								? image.evidence
								: `${image.evidence}; current model page as of ${record.fetchedAt}`,
							license: 'manufacturer'
						}
					]
				: []
		};
	}
}

/**
 * The document as a browser receives it. BMW's site refuses plain HTTP
 * clients at the connection, whatever the headers, but serves a browser the
 * ordinary page, whose HTML already carries the asset paths. Nothing is
 * clicked or scripted: the page is requested, its HTML is read. A page that
 * redirects (a discontinued model to its successor) is returned as an empty
 * document, so a successor's page can never speak for the model asked for.
 * Playwright is a development dependency and is loaded only here, only on
 * demand; the built app never imports it.
 */
async function downloadWithBrowser(url: string): Promise<string> {
	const specifier = '@playwright/test';
	const { chromium } = (await import(
		/* @vite-ignore */ specifier
	)) as typeof import('@playwright/test');
	const browser = await chromium.launch({ headless: true });
	try {
		const context = await browser.newContext({ locale: 'nl-NL' });
		const page = await context.newPage();
		const response = await page.goto(url, { waitUntil: 'commit', timeout: 60000 });
		if (!response || response.status() !== 200) return '';
		if (page.url().replace(/[#?].*$/, '') !== url) return '';
		return await response.text();
	} finally {
		await browser.close();
	}
}

function brandName(brand: string): string {
	return (
		{
			honda: 'Honda',
			suzuki: 'Suzuki',
			yamaha: 'Yamaha',
			triumph: 'Triumph',
			ktm: 'KTM',
			kawasaki: 'Kawasaki',
			bmw: 'BMW'
		}[brand] ?? brand
	);
}

export const manufacturerProvider = new ManufacturerProvider();

import type {
	ListOptions,
	ModelYearObservation,
	MotorcycleProvider,
	NormalizedMotorcycle,
	ProviderListing,
	RawMotorcycle
} from '../../types';
import { stripBrandPrefix } from '../../match';
import { MIN_REGISTRATIONS_PER_YEAR } from '../../../catalog/boundaries';
import { classifyByName, licenceFromEuCategory, tidyName } from './classify';

/**
 * The Dutch vehicle registry (RDW) as a motorcycle catalogue.
 *
 * ## Why this is the backbone
 *
 * RDW publishes every vehicle registered in the Netherlands as open data:
 * ~898,000 motorcycles, 62,000 of them first registered since 2024, updated
 * daily. Licence is **public domain**, there is no API key, and there is no
 * documented rate limit.
 *
 * Grouping registrations by make and model turns a registry into a catalogue of
 * around 5,000 machines with figures that Wikipedia simply does not have:
 *
 *  - **Price.** `catalogusprijs` is the Dutch list price in euros. No other
 *    source evaluated had prices at all, and "under €20k" is not a filter you
 *    can offer without them.
 *  - **Recency.** Registration dates run to today, so the catalogue reflects
 *    what is actually being bought rather than what has an encyclopedia article.
 *  - **Seats.** `aantal_zitplaatsen` answers the passenger question factually.
 *  - **Popularity.** The registration count per model is a real signal about
 *    what people ride.
 *
 * ## What it cannot give
 *
 * **No photographs, no seat height, no torque.** Those come from Wikipedia and
 * Commons, and a motorcycle that matches an existing Wikipedia row enriches it
 * rather than duplicating it — see `match.ts`.
 *
 * ## Shape of the data
 *
 * Registrations are per vehicle, so everything is aggregated per model. Two
 * consequences worth knowing:
 *
 *  - Figures are aggregated across every registered example. For a model sold
 *    unchanged that is exact; across a long production run it is a blend.
 *  - Not every field is recorded on every registration. Displacement, mass and
 *    wheelbase are on ~99% of them; price on 56% and top speed on 36%. Those
 *    two are only reported when enough examples carry one — see
 *    `MIN_PRICED_REGISTRATIONS`, which exists because a single stray row once
 *    priced a Suzuki GS500 at €611.
 *  - Model names are free text typed by importers, so the same bike appears as
 *    "DL650" and "DL650A". A minimum registration count filters out the
 *    one-off spellings without discarding genuine low-volume machines.
 */

const RESOURCE = 'https://opendata.rdw.nl/resource/m9d7-ebf2.json';
/** Fuel and emissions, which is where engine power lives. */
const FUEL_RESOURCE = 'https://opendata.rdw.nl/resource/8ys7-d773.json';

/** Socrata caps a JSON response at 50,000 rows. */
const PAGE_SIZE = 50_000;
/** Number-plate lookups batched into one `in (...)` query. */
const PLATE_BATCH = 80;

/**
 * Registrations older than this are excluded.
 *
 * Model names get reused across decades — there is a 1973 Kawasaki Z900 and a
 * 2017 one. Averaging their specifications together produces a motorcycle that
 * never existed, so the import stays inside the era the user actually shops in.
 */
const DEFAULT_FROM_YEAR = 2000;

/**
 * Models with fewer registrations than this are dropped.
 *
 * Below a handful of registrations the rows are overwhelmingly typos, personal
 * imports and one-off rebuilds rather than models anyone can go and buy.
 */
const DEFAULT_MIN_REGISTRATIONS = 3;

/**
 * How many registered examples must actually carry a figure before it is
 * believed.
 *
 * `catalogusprijs` is filled on barely half of registrations and
 * `maximale_constructiesnelheid` on about a third, so an aggregate over one or
 * two rows is not a fact about the model — it is one person's paperwork. The
 * Suzuki GS500 taught this: 37 registered, exactly one with a price, and that
 * one said 611. The card confidently read "€611" for a bike that cost about
 * ten times that.
 *
 * Three is the smallest number for which a median means anything, which is why
 * the price is a median.
 */
const MIN_PRICED_REGISTRATIONS = Number(process.env.RDW_MIN_PRICED) || 3;

/**
 * The band a Dutch list price for a motorcycle can plausibly fall in.
 *
 * Outside it the number is not a price — it is a typo, a partial payment, or a
 * value in some unit nobody recorded. Better a blank field than a confident
 * wrong one on a card somebody is judging a purchase by.
 */
const PLAUSIBLE_PRICE_EUR = { min: 500, max: 150_000 };

/** Registrations sampled per model when working out engine power. */
const POWER_SAMPLE_SIZE = 10;

/**
 * Registrations sampled per model *year*, for the years that have enough of
 * them to say anything — see `MIN_REGISTRATIONS_PER_YEAR`.
 *
 * Three is enough to catch a genuine step in rated power (the NC750X went
 * 40.3 → 43.1 kW in 2021 on every example) and few enough that the whole
 * registry is a few hundred lookups rather than tens of thousands.
 */
const YEAR_POWER_SAMPLE_SIZE = 3;

/** Ceiling on the raw registration pages walked to collect those samples. */
const MAX_REGISTRATION_ROWS = 700_000;

/** Fewer readings than this and the figure is one person's paperwork. */
const MIN_POWER_READINGS = 3;

/**
 * The European licence power ceilings, in kW.
 *
 * A registration records the power the machine was *registered at*, so an
 * A2-restricted example of a 68 hp motorcycle is on the books at 35 kW. Where
 * every example we sampled sits exactly on a ceiling, the registry cannot tell
 * us whether that is the model's output or the restriction — and the honest
 * answer to a question you cannot answer is nothing.
 */
const LICENCE_CEILINGS_KW = [35, 25, 11];

/**
 * The most a production motorcycle makes per litre.
 *
 * A Ducati Panigale V4 R is about 218; anything meaningfully past that is a
 * modified machine somebody registered, not the model's output.
 */
const MAX_HP_PER_LITRE = 230;

/**
 * An absolute ceiling, for records with no displacement to reason about.
 *
 * Generous enough to keep the Boss Hoss, which really does have a Chevrolet V8
 * in it, and low enough to reject the home-built specials the registry carries
 * at four figures.
 */
const MAX_PLAUSIBLE_HP = 400;

/**
 * Below this, sitting on a ceiling is unremarkable: plenty of real motorcycles
 * make exactly 35 kW because that is what a 500 makes. Above it, a machine
 * registered at exactly the A2 limit is a restricted example.
 */
const CEILING_SUSPECT_ABOVE_CC = 550;

/**
 * Bands the physical measurements have to fall in.
 *
 * `wielbasis` is recorded on virtually every registration, so unlike the price
 * these are not thin-sample problems — they are simply wrong entries. A Honda
 * Monkey came through with an 895 mm wheelbase and a Suzuki VZ 800 with zero.
 * Eight rows out of five thousand, but a specification nobody can sanity-check
 * is worse than a blank one.
 */
const PLAUSIBLE = {
	wheelbaseMm: { min: 900, max: 2200 },
	massKg: { min: 40, max: 600 },
	displacementCc: { min: 20, max: 3500 },
	seats: { min: 1, max: 3 }
} as const;

/** Returns the value, or undefined when it is outside what a motorcycle can be. */
function within(
	value: number | undefined,
	band: { readonly min: number; readonly max: number }
): number | undefined {
	if (value === undefined) return undefined;
	return value < band.min || value > band.max ? undefined : value;
}

/**
 * What somebody types when the registration form demands a model name and they
 * do not have one. "Piaggio N/A" is not a motorcycle anybody can be shown.
 */
const PLACEHOLDER_MODEL =
	/^(n\.?\s?[/.]?\s?a\.?|n\.?v\.?t\.?|onbekend|unknown|geen|none|-+|\.+|\?+|0+)$/i;

interface RdwGroupRow {
	merk: string;
	handelsbenaming: string;
	registrations: string;
	cc?: string;
	cylinders?: string;
	mass?: string;
	wheelbase?: string;
	topspeed?: string;
	topspeed_n?: string;
	seats?: string;
	price?: string;
	price_n?: string;
	newest?: string;
	oldest?: string;
}

interface RdwYearRow {
	merk: string;
	handelsbenaming: string;
	jaar: string;
	n: string;
	cc?: string;
	kg?: string;
	price?: string;
	price_n?: string;
}

/** One model year of one model, straight from the registry. */
export interface RdwModelYear {
	year: number;
	registrations: number;
	medianCc?: number;
	medianKg?: number;
	medianPrice?: number;
	pricedCount: number;
	/** Plates sampled for this year's power reading. */
	samplePlates: string[];
	powerReadings: number[];
}

/** One model, after aggregation and the power lookup. */
export interface RdwModel {
	/**
	 * RDW's own `merk|handelsbenaming`, exactly as published.
	 *
	 * This is the row's identity for `(source, externalId)`, so it must be the
	 * raw registry value and not the tidied display name — otherwise a change to
	 * `tidyName` would silently orphan every previously imported row and create
	 * duplicates on the next run.
	 */
	externalId: string;
	make: string;
	model: string;
	registrations: number;
	displacementCc?: number;
	cylinders?: number;
	massKg?: number;
	wheelbaseMm?: number;
	topSpeedKmh?: number;
	/** How many registrations carried a price. See `MIN_PRICED_REGISTRATIONS`. */
	pricedCount: number;
	seats?: number;
	priceEur?: number;
	newestYear?: number;
	oldestYear?: number;
	/** Plates sampled for the power lookup. See `loadPower`. */
	samplePlates: string[];
	/** Every distinct power reading found across those plates, in kW. */
	powerReadings: number[];
	powerKw?: number;
	/** The same figures broken down by first-registration year. */
	years: RdwModelYear[];
}

function userAgent(): string {
	const contact = process.env.RDW_CONTACT?.trim() || process.env.WIKIMEDIA_CONTACT?.trim();
	return `MotoSwipe/0.1 (self-hosted motorcycle app${contact ? `; ${contact}` : ''}) Node`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url: string, attempts = 4): Promise<unknown> {
	let lastError: Error | undefined;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			const response = await fetch(url, {
				headers: { 'User-Agent': userAgent(), Accept: 'application/json' }
			});
			if (response.ok) return await response.json();
			if (response.status < 500 && response.status !== 429) {
				throw new Error(`${response.status} ${response.statusText} from opendata.rdw.nl`);
			}
			lastError = new Error(`${response.status} ${response.statusText}`);
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			if (/^4\d\d /.test(lastError.message)) throw lastError;
		}
		if (attempt < attempts) await sleep(2 ** attempt * 1000);
	}
	throw lastError ?? new Error('RDW request failed');
}

const num = (value: string | undefined): number | undefined => {
	if (value === undefined || value === '') return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
};

const yearOf = (yyyymmdd: string | undefined): number | undefined => {
	if (!yyyymmdd || yyyymmdd.length < 4) return undefined;
	const year = Number(yyyymmdd.slice(0, 4));
	return Number.isFinite(year) && year > 1900 && year < 2100 ? year : undefined;
};

export class RdwProvider implements MotorcycleProvider {
	readonly source = 'rdw';
	readonly displayName = 'RDW open data — Dutch vehicle registry (public domain)';
	readonly requiresNetwork = true;
	/**
	 * A registry describes the same motorcycles an encyclopedia does. Without
	 * this the deck would show every popular bike twice.
	 */
	readonly mergeByModelName = true;

	private index = new Map<string, RdwModel>();
	private powerLoaded = false;

	async listMotorcycles(options: ListOptions = {}): Promise<ProviderListing[]> {
		const fromYear = Number(process.env.RDW_FROM_YEAR) || DEFAULT_FROM_YEAR;
		const minRegistrations = Number(process.env.RDW_MIN_REGISTRATIONS) || DEFAULT_MIN_REGISTRATIONS;

		const select = [
			'merk',
			'handelsbenaming',
			'count(*) AS registrations',
			'avg(cilinderinhoud) AS cc',
			'avg(aantal_cilinders) AS cylinders',
			'avg(massa_rijklaar) AS mass',
			'avg(wielbasis) AS wheelbase',
			'avg(maximale_constructiesnelheid) AS topspeed',
			'count(maximale_constructiesnelheid) AS topspeed_n',
			'avg(aantal_zitplaatsen) AS seats',
			// Median, not mean. `catalogusprijs` is recorded on barely half of
			// registrations and a stray value among the few that have it drags an
			// average anywhere; the middle one cannot be dragged.
			'median(catalogusprijs) AS price',
			// How many examples actually carry a price, which is the number that
			// decides whether there is a price here at all.
			'count(catalogusprijs) AS price_n',
			'max(datum_eerste_toelating) AS newest',
			'min(datum_eerste_toelating) AS oldest'
		].join(',');

		const where =
			`voertuigsoort='Motorfiets' AND europese_voertuigcategorie='L3' ` +
			`AND datum_eerste_toelating >= '${fromYear}0101'`;

		const params = new URLSearchParams({
			$select: select,
			$where: where,
			$group: 'merk,handelsbenaming',
			$having: `count(*) >= ${minRegistrations}`,
			$order: 'registrations DESC',
			$limit: String(PAGE_SIZE)
		});

		const rows = (await fetchJson(`${RESOURCE}?${params}`)) as RdwGroupRow[];

		this.index.clear();
		this.powerLoaded = false;

		for (const row of rows) {
			if (!row.merk?.trim() || !row.handelsbenaming?.trim()) continue;
			// "N/A", "-", "onbekend": what somebody types when the form demands a
			// model name and they do not have one. Never a motorcycle.
			if (PLACEHOLDER_MODEL.test(row.handelsbenaming.trim())) continue;

			const make = tidyName(row.merk);
			// Registrations are typed by hand, so the make comes back inside the
			// model often enough to matter: "BMW / BMW R1200GSADVENTURE" and
			// "KTM / KTM 1290 Super Adventure S" are both real rows.
			const model = tidyName(stripBrandPrefix(row.merk, row.handelsbenaming));
			const key = `${row.merk}|${row.handelsbenaming}`;
			if (this.index.has(key)) continue;

			const cc = num(row.cc);
			this.index.set(key, {
				externalId: key,
				make,
				model,
				registrations: num(row.registrations) ?? 0,
				displacementCc: cc !== undefined ? Math.round(cc) : undefined,
				cylinders: row.cylinders ? Math.round(Number(row.cylinders)) : undefined,
				massKg: row.mass ? Math.round(Number(row.mass) * 10) / 10 : undefined,
				// RDW records wheelbase in centimetres.
				wheelbaseMm: row.wheelbase ? Math.round(Number(row.wheelbase) * 10) : undefined,
				topSpeedKmh:
					row.topspeed && (num(row.topspeed_n) ?? 0) >= MIN_PRICED_REGISTRATIONS
						? Math.round(Number(row.topspeed))
						: undefined,
				seats: row.seats ? Math.round(Number(row.seats)) : undefined,
				priceEur: row.price ? Math.round(Number(row.price)) : undefined,
				pricedCount: num(row.price_n) ?? 0,
				newestYear: yearOf(row.newest),
				oldestYear: yearOf(row.oldest),
				samplePlates: [],
				powerReadings: [],
				years: []
			});
		}

		await this.loadModelYears(fromYear);

		const listings = [...this.index.entries()]
			.sort((a, b) => b[1].registrations - a[1].registrations)
			.slice(0, options.limit ?? this.index.size);

		return listings.map(([key, model]) => ({
			externalId: key,
			label: `${model.make} ${model.model}`,
			sourceUrl: 'https://opendata.rdw.nl/resource/m9d7-ebf2.json'
		}));
	}

	/**
	 * The same aggregation again, per year of first registration.
	 *
	 * This is what a generation is built from. The grouped query above blends a
	 * BMW R 1200 GS from 2004 with one from 2018 into a motorcycle that never
	 * existed; per year, the registry can show the 2013 liquid-cooled engine as
	 * a step in the numbers. One paged query for the whole registry.
	 */
	private async loadModelYears(fromYear: number): Promise<void> {
		const select = [
			'merk',
			'handelsbenaming',
			'date_extract_y(datum_eerste_toelating_dt) AS jaar',
			'count(*) AS n',
			'median(cilinderinhoud) AS cc',
			'median(massa_rijklaar) AS kg',
			'median(catalogusprijs) AS price',
			'count(catalogusprijs) AS price_n'
		].join(',');

		const where =
			`voertuigsoort='Motorfiets' AND europese_voertuigcategorie='L3' ` +
			`AND datum_eerste_toelating >= '${fromYear}0101'`;

		for (let offset = 0; offset < MAX_REGISTRATION_ROWS; offset += PAGE_SIZE) {
			const params = new URLSearchParams({
				$select: select,
				$where: where,
				$group: 'merk,handelsbenaming,jaar',
				$order: 'merk,handelsbenaming,jaar',
				$limit: String(PAGE_SIZE),
				$offset: String(offset)
			});

			let rows: RdwYearRow[];
			try {
				rows = (await fetchJson(`${RESOURCE}?${params}`)) as RdwYearRow[];
			} catch {
				// Years are what generations are built from, not what the catalogue
				// is built from. Losing a page loses some boundaries, not the import.
				break;
			}

			for (const row of rows) {
				const model = this.index.get(`${row.merk}|${row.handelsbenaming}`);
				const year = num(row.jaar);
				if (!model || year === undefined) continue;
				const cc = num(row.cc);
				const kg = num(row.kg);
				const price = num(row.price);
				model.years.push({
					year,
					registrations: num(row.n) ?? 0,
					medianCc: cc !== undefined ? Math.round(cc) : undefined,
					medianKg: kg !== undefined ? Math.round(kg * 10) / 10 : undefined,
					medianPrice: price !== undefined ? Math.round(price) : undefined,
					pricedCount: num(row.price_n) ?? 0,
					samplePlates: [],
					powerReadings: []
				});
			}

			if (rows.length < PAGE_SIZE) break;
			await sleep(120);
		}
	}

	async fetchMotorcycle(externalId: string): Promise<RawMotorcycle> {
		if (this.index.size === 0) await this.listMotorcycles();

		// Power lives in a second dataset keyed by number plate. Fetching it per
		// motorcycle would be thousands of requests; batching the representative
		// plates makes it a few dozen, done once.
		if (!this.powerLoaded) await this.loadPower();

		const model = this.index.get(externalId);
		if (!model) throw new Error(`No RDW model with id ${externalId}`);
		return model;
	}

	/** Fills in `powerKw` for every model, in batches. */
	/**
	 * Engine power, from as many registered examples as it takes to be sure.
	 *
	 * RDW keeps power in a separate dataset keyed by number plate, so it has to
	 * be looked up per vehicle. This used to sample **one** arbitrary plate per
	 * model, which is how 110 motorcycles ended up listed at exactly 46.9 hp —
	 * 35.0 kW, the A2 licence ceiling. The sampled example was a restricted
	 * bike, and the whole model inherited its restriction. A Kawasaki Z650 makes
	 * 50 kW; the catalogue said 35.
	 *
	 * So: sample many examples and take the **highest** reading. A2 versions are
	 * power-*reduced* versions of the same machine, so the maximum across
	 * registrations is the model's real output and a restricted example can only
	 * ever fail to raise it.
	 *
	 * Where even that is not enough to tell a restricted registration from the
	 * truth, the answer is null. See `derivePower`.
	 */
	private async loadPower(): Promise<void> {
		this.powerLoaded = true;

		await this.collectSamplePlates();

		const byPlate = new Map<string, RdwModel[]>();
		/** Plates asked about for a particular model year. */
		const yearByPlate = new Map<string, RdwModelYear[]>();
		for (const model of this.index.values()) {
			for (const plate of model.samplePlates) {
				byPlate.set(plate, [...(byPlate.get(plate) ?? []), model]);
			}
			for (const year of model.years) {
				for (const plate of year.samplePlates) {
					yearByPlate.set(plate, [...(yearByPlate.get(plate) ?? []), year]);
					if (!byPlate.has(plate)) byPlate.set(plate, []);
				}
			}
		}

		const plates = [...byPlate.keys()];
		for (let i = 0; i < plates.length; i += PLATE_BATCH) {
			const slice = plates.slice(i, i + PLATE_BATCH);
			const list = slice.map((p) => `'${p.replace(/'/g, '')}'`).join(',');

			const params = new URLSearchParams({
				$select: 'kenteken,nettomaximumvermogen',
				$where: `kenteken in (${list})`,
				$limit: String(PLATE_BATCH * 4)
			});

			try {
				const rows = (await fetchJson(`${FUEL_RESOURCE}?${params}`)) as {
					kenteken: string;
					nettomaximumvermogen?: string;
				}[];

				for (const row of rows) {
					const kw = num(row.nettomaximumvermogen);
					if (kw === undefined || kw <= 0) continue;
					for (const model of byPlate.get(row.kenteken) ?? []) {
						model.powerReadings.push(kw);
					}
					for (const year of yearByPlate.get(row.kenteken) ?? []) {
						year.powerReadings.push(kw);
					}
				}
			} catch {
				// Power is a nice-to-have. Losing a batch must not lose the models.
			}

			await sleep(80);
		}

		for (const model of this.index.values()) {
			model.powerKw = derivePower(model);
		}
	}

	/**
	 * Picks the registrations to ask about.
	 *
	 * The grouped query cannot return more than one plate per model, so the raw
	 * registrations are paged through once and grouped locally. Twelve pages for
	 * half a million rows, against thousands of individual lookups.
	 */
	private async collectSamplePlates(): Promise<void> {
		const fromYear = Number(process.env.RDW_FROM_YEAR) || DEFAULT_FROM_YEAR;
		const where =
			`voertuigsoort='Motorfiets' AND europese_voertuigcategorie='L3' ` +
			`AND datum_eerste_toelating >= '${fromYear}0101'`;

		for (let offset = 0; offset < MAX_REGISTRATION_ROWS; offset += PAGE_SIZE) {
			const params = new URLSearchParams({
				$select: 'kenteken,merk,handelsbenaming,datum_eerste_toelating',
				$where: where,
				$order: 'kenteken',
				$limit: String(PAGE_SIZE),
				$offset: String(offset)
			});

			let rows: {
				kenteken?: string;
				merk?: string;
				handelsbenaming?: string;
				datum_eerste_toelating?: string;
			}[];
			try {
				rows = (await fetchJson(`${RESOURCE}?${params}`)) as typeof rows;
			} catch {
				// A missing page costs accuracy on some models, not the import.
				break;
			}
			if (!rows.length) break;

			for (const row of rows) {
				if (!row.kenteken || !row.merk || !row.handelsbenaming) continue;
				const model = this.index.get(`${row.merk}|${row.handelsbenaming}`);
				if (!model) continue;
				if (model.samplePlates.length < POWER_SAMPLE_SIZE) model.samplePlates.push(row.kenteken);

				// A few plates per model year too, but only for years with enough
				// registrations to carry a boundary. The rest would be lookups for
				// figures nothing downstream is allowed to believe.
				const registered = yearOf(row.datum_eerste_toelating);
				const year = model.years.find((y) => y.year === registered);
				if (
					year &&
					year.registrations >= MIN_REGISTRATIONS_PER_YEAR &&
					year.samplePlates.length < YEAR_POWER_SAMPLE_SIZE
				) {
					year.samplePlates.push(row.kenteken);
				}
			}

			if (rows.length < PAGE_SIZE) break;
			await sleep(120);
		}
	}

	normalizeMotorcycle(raw: RawMotorcycle): NormalizedMotorcycle | null {
		const m = raw as RdwModel;
		if (!m?.make || !m.model) return null;
		if (PLACEHOLDER_MODEL.test(m.model.trim())) return null;

		// A registry contains machines that are not really motorcycles for our
		// purposes; a model with no displacement and no power tells us nothing.
		if (!m.displacementCc && !m.powerKw) return null;

		const powerHp =
			m.powerKw !== undefined ? Math.round((m.powerKw / 0.7457) * 10) / 10 : undefined;
		const powerKw = m.powerKw;

		const priceEur = plausiblePrice(m);
		const seats = within(m.seats, PLAUSIBLE.seats);

		return {
			manufacturerName: m.make,
			manufacturerCountryCode: null,
			manufacturerWebsite: null,

			model: m.model,
			variant: null,
			// The most recent year an example was first registered. For a current
			// model that is this year; for a discontinued one it is the last year
			// you could buy it new. That is the number "bikes from 2015" means.
			modelYear: m.newestYear ?? null,

			category: classifyByName(m.make, m.model),
			categoryRaw: null,
			description: null,
			tags: [],

			displacementCc: within(m.displacementCc, PLAUSIBLE.displacementCc) ?? null,
			cylinders: m.cylinders ?? null,
			engineConfiguration: null,
			cooling: null,
			powerHp: powerHp ?? null,
			powerKw: powerKw ?? null,
			// Not published by RDW.
			torqueNm: null,
			transmission: null,
			gears: null,

			// `massa_rijklaar` is the running-order mass: the machine with fluids,
			// which is what "wet weight" means everywhere else in the app.
			wetWeightKg: within(m.massKg, PLAUSIBLE.massKg) ?? null,
			dryWeightKg: null,
			// Not published by RDW — this is the field Wikipedia is still needed for.
			seatHeightMm: null,
			seatWidthMm: null,
			wheelbaseMm: within(m.wheelbaseMm, PLAUSIBLE.wheelbaseMm) ?? null,
			fuelCapacityLiters: null,

			// A registered seat count is a fact about the machine, unlike the
			// guesses this app refuses to make elsewhere.
			passengerAllowed: seats !== undefined ? seats >= 2 : null,
			seatCount: seats ?? null,
			passengerPegs: null,
			ridingPosition: null,
			licenseCategory: licenceFromEuCategory('L3', m.powerKw, m.displacementCc) ?? null,

			// The Dutch list price when new: the median across registered examples,
			// and only when enough of them carry one to be worth calling a price.
			msrpAmount: priceEur,
			msrpCurrency: priceEur === null ? null : 'EUR',
			marketCountryCode: 'NL',

			// When examples of this model were actually being put on the road.
			// `modelYear` above says the same thing for a row RDW creates, but on
			// a Wikipedia row it is the introduction year — 1977 for a Z650 that
			// is on sale today — and enrichment never overwrites it. These two
			// columns are what "bikes from 2015" is answered with.
			firstRegistrationYear: m.oldestYear ?? null,
			lastRegistrationYear: m.newestYear ?? null,
			registrationCount: m.registrations,
			modelYears: m.years.map((year) => normalizeYear(year, m)),

			// Still being registered in the last two years means still on sale.
			availableNew:
				m.newestYear !== undefined ? m.newestYear >= new Date().getFullYear() - 1 : null,

			// The registry knows when examples were put on the road, not when the
			// model was made. That is still an era, and it is what keeps a 1976
			// Z650 out of the 2017 one — see `catalog/identity.ts`.
			eraFrom: m.oldestYear ?? null,
			eraTo: m.newestYear ?? null,

			confidence: {
				// Sampled from registrations, never a published specification.
				powerHp: powerConfidence(m),
				powerKw: powerConfidence(m),
				// A median over enough priced examples is a solid figure; the
				// registry is the only source that has one at all.
				msrpAmount: priceEur === null ? 0 : Math.min(0.95, 0.6 + m.pricedCount / 100),
				msrpCurrency: priceEur === null ? 0 : 0.9,
				// Measured off the vehicles themselves, and averaged over however
				// many were registered under this exact spelling. A figure from
				// 3,500 examples is a far better measurement than one from five,
				// and the registry lists popular models under a dozen spellings —
				// so the sample size has to decide which of them wins the merge.
				wetWeightKg: sampleConfidence(m.registrations),
				wheelbaseMm: sampleConfidence(m.registrations),
				displacementCc: sampleConfidence(m.registrations),
				cylinders: sampleConfidence(m.registrations),
				seatCount: 0.9,
				passengerAllowed: 0.9,
				registrationCount: 1,
				firstRegistrationYear: 1,
				lastRegistrationYear: 1,
				// A guess from the model name. Anything real must beat it.
				category: 0.2
			},

			externalId: m.externalId,
			sourceUrl: `https://opendata.rdw.nl/resource/m9d7-ebf2.json?merk=${encodeURIComponent(
				m.make.toUpperCase()
			)}`,
			images: []
		};
	}
}

/**
 * The model's price, or null when the registry does not really know one.
 *
 * Two separate questions, and both have to be answered yes: did enough
 * registered examples record a price, and is the resulting figure one a
 * motorcycle could actually have cost.
 */
/**
 * The model's engine power, or null when the registry does not really know.
 *
 * The maximum across sampled registrations, because A2 versions are the same
 * machine with less power — a restricted example can lower the average but
 * never the maximum.
 */
export function derivePower(model: {
	powerReadings: number[];
	displacementCc?: number;
	/** Fewer readings than this and there is no answer. Defaults to `MIN_POWER_READINGS`. */
	minReadings?: number;
}): number | undefined {
	const readings = model.powerReadings.filter((kw) => kw > 0);
	if (readings.length < (model.minReadings ?? MIN_POWER_READINGS)) return undefined;

	const max = Math.max(...readings);
	const hp = max / 0.7457;
	const cc = model.displacementCc;

	// Taking the maximum finds the unrestricted version, but it also finds the
	// tuned one. A Hayabusa came back at 320 hp because somebody registered a
	// modified example; 244 hp per litre is not a production motorcycle.
	if (cc && hp / (cc / 1000) > MAX_HP_PER_LITRE) return undefined;
	// And "Zelfbouw Ferox Softail" — a home-built special — was recorded at
	// 1,000 kW. Nothing on two wheels makes that.
	if (hp > MAX_PLAUSIBLE_HP) return undefined;

	// Every example sitting exactly on a licence ceiling, on a machine big
	// enough that the ceiling is clearly a restriction rather than its output.
	const onCeiling = LICENCE_CEILINGS_KW.some((ceiling) => Math.abs(max - ceiling) < 0.6);
	const bigEnoughToBeRestricted = (model.displacementCc ?? 0) > CEILING_SUSPECT_ABOVE_CC;
	if (onCeiling && bigEnoughToBeRestricted) return undefined;

	return max;
}

/**
 * One model year, with the same plausibility rules as the model itself.
 *
 * A year's power is the maximum of a handful of readings, so it needs at least
 * two: a single reading is one person's paperwork, and one restricted example
 * must not become "this year made 35 kW". The licence-ceiling and
 * power-per-litre guards in `derivePower` apply exactly as they do to the model.
 */
export function normalizeYear(
	year: RdwModelYear,
	model: Pick<RdwModel, 'displacementCc'>
): ModelYearObservation {
	const readings = year.powerReadings.filter((kw) => kw > 0);
	const maxPowerKw =
		readings.length >= 2
			? derivePower({
					powerReadings: readings,
					displacementCc: year.medianCc ?? model.displacementCc,
					minReadings: 2
				})
			: undefined;

	return {
		year: year.year,
		registrationCount: year.registrations,
		medianPriceEur: plausiblePrice({ pricedCount: year.pricedCount, priceEur: year.medianPrice }),
		medianMassKg: within(year.medianKg, PLAUSIBLE.massKg) ?? null,
		medianDisplacementCc: within(year.medianCc, PLAUSIBLE.displacementCc) ?? null,
		maxPowerKw: maxPowerKw ?? null
	};
}

/**
 * How much to trust that power figure.
 *
 * Never high. A registry reports what machines were registered at, not what a
 * manufacturer publishes, so a published specification must always win — see
 * `catalog/merge.ts`. This only decides whether RDW's number is better than
 * nothing, and how much better.
 */
/**
 * How much a figure averaged over `n` registrations is worth.
 *
 * Rises quickly and then flattens: the difference between five examples and
 * fifty is large, between five hundred and five thousand almost nothing.
 * Deliberately capped below 1 so a published specification can still win where
 * the field priority says it should.
 */
export function sampleConfidence(registrations: number): number {
	if (registrations <= 0) return 0.1;
	return Math.min(0.9, 0.35 + Math.log10(registrations) * 0.18);
}

export function powerConfidence(model: { powerReadings: number[] }): number {
	const readings = model.powerReadings.filter((kw) => kw > 0);
	if (readings.length < MIN_POWER_READINGS) return 0;
	// Readings that disagree mean we have seen both a restricted and an
	// unrestricted example, so the maximum is demonstrably the real output.
	const varied = new Set(readings).size > 1;
	return varied ? 0.45 : 0.3;
}

export function plausiblePrice(m: Pick<RdwModel, 'pricedCount' | 'priceEur'>): number | null {
	if (m.pricedCount < MIN_PRICED_REGISTRATIONS) return null;
	if (m.priceEur === undefined) return null;
	if (m.priceEur < PLAUSIBLE_PRICE_EUR.min || m.priceEur > PLAUSIBLE_PRICE_EUR.max) return null;
	return m.priceEur;
}

export const rdwProvider = new RdwProvider();

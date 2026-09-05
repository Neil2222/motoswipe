/**
 * Reading a manufacturer's model page: what it states, and what that proves.
 *
 * Three makers, three page styles, one contract: return only what the page
 * says in so many words. Nothing is derived from the family name, and a page
 * that does not name the model it is supposed to be about returns nothing at
 * all — that is how a replaced or redirected URL fails safely.
 *
 * Pure functions over the HTML string, so they can be tested against a saved
 * page without the network.
 */

export interface OfficialSpecs {
	/** The model year the page is for, where it says so. */
	modelYear?: number;
	seatHeightMm?: number;
	torqueNm?: number;
	powerKw?: number;
	powerHp?: number;
	wetWeightKg?: number;
	dryWeightKg?: number;
	displacementCc?: number;
	fuelCapacityL?: number;
	wheelbaseMm?: number;
	/** Dutch list price in euros, the lowest variant when several are listed. */
	priceEur?: number;
	/** The official image, and the model year its asset name states. */
	image?: OfficialImage;
	/**
	 * Up to three official photographs of the same proven model year — other
	 * colours, the other side, a three-quarter view — the first being `image`.
	 * Whole-bike views only; a maker's detail shots stay out.
	 */
	images?: OfficialImage[];
}

export interface OfficialImage {
	url: string;
	modelYear?: number;
	evidence: string;
}

/** How many official photographs a page may contribute to a card. */
export const OFFICIAL_IMAGE_LIMIT = 3;

/** A maker's close-up, filed by name: not a photograph of the motorcycle. */
const OFFICIAL_DETAIL =
	/(?:^|[^a-z])(?:(?:detail|engine|dash|display|tft|cockpit|instrument|wheel|exhaust|seat|tank|brake|light|logo|badge|switch|screen|close|zoom|gear)(?:[^a-z]|$)|accessor|helmet|cloth|apparel)/i;

/**
 * What identifies the picture behind a URL: the path without the query, a
 * CDN's transformation segment, a rendition suffix or a size suffix
 * ("hero_l" / "hero_m" / "hero_s", "-1080", "_1920x1080"). Two of those are
 * the same photograph at different sizes, and a card must not show it twice.
 */
function sameOfficialPicture(url: string): string {
	const key = decodeURIComponent(url)
		.toLowerCase()
		.replace(/[?#].*$/, '')
		.replace(/\/image\/upload\/(?:[a-z_]+[^/]*\/)+/, '/image/upload/')
		.replace(/\/jcr:content\/renditions\/.*$/, '')
		.replace(/\/_?jcr_content\/renditions\/.*$/, '')
		// A size folder in front of the file: ".../web/446/bobber_rhs_446px.jpg".
		.replace(/\/\d{2,4}\/([^/]+)$/, '/$1');
	const ext = /\.[a-z0-9]+$/.exec(key)?.[0] ?? '';
	let stem = key.slice(0, key.length - ext.length);
	// Cloudinary appends six random characters to an uploaded file's name.
	if (key.includes('/image/upload/')) stem = stem.replace(/_[a-z0-9]{6}$/, '');
	for (;;) {
		const next = stem.replace(/[-_](?:xs|s|m|l|xl|\d{2,4}(?:x\d{2,4})?(?:px)?)$/, '');
		if (next === stem) break;
		stem = next;
	}
	// The file name alone: Honda files the same photograph under each variant
	// folder it applies to ("cb750_hornet_ec_2026" and "…_ec_35kw_2026").
	return stem.split('/').pop() ?? stem;
}

/** The first few distinct whole-bike images, in the order given. */
function officialGallery(images: OfficialImage[]): OfficialImage[] {
	const seen = new Set<string>();
	const kept: OfficialImage[] = [];
	for (const image of images) {
		const key = sameOfficialPicture(image.url);
		if (seen.has(key) || OFFICIAL_DETAIL.test(key.split('/').pop() ?? '')) continue;
		seen.add(key);
		kept.push(image);
		if (kept.length === OFFICIAL_IMAGE_LIMIT) break;
	}
	return kept;
}

const num = (text: string | undefined): number | undefined => {
	if (!text) return undefined;
	const m = /-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?|-?\d+(?:\.\d+)?/.exec(text);
	if (!m) return undefined;
	const value = Number(m[0].replace(/\./g, '').replace(',', '.'));
	return Number.isFinite(value) ? value : undefined;
};

const bounded = (value: number | undefined, min: number, max: number) =>
	value !== undefined && value >= min && value <= max ? value : undefined;

/** Whether the page is about the model at all. */
export function pageNames(html: string, expect: string): boolean {
	const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '';
	const og = /property="og:title" content="([^"]*)"/i.exec(html)?.[1] ?? '';
	const needle = expect.toLowerCase().replace(/[^a-z0-9]/g, '');
	const hay = (title + ' ' + og + ' ' + html.slice(0, 20000))
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
	return hay.includes(needle);
}

// ---------------------------------------------------------------------------
// Honda NL
// ---------------------------------------------------------------------------

/**
 * Honda's specification pages list `<h5>label</h5><p>value</p>` items and name
 * every variant with its model year: `data-variant-name="NC750X DCT 2026"`,
 * `data-price="10.899 €"`. Image paths carry the year as "26YM_".
 */
export function parseHondaPage(html: string, family = '', assetFolder?: string): OfficialSpecs {
	const item = (label: RegExp): string | undefined => {
		const re = new RegExp(`<h5>\\s*(${label.source})\\s*</h5>\\s*<p>([^<]*)</p>`, 'i');
		return re.exec(html)?.[2];
	};

	const variants = [...html.matchAll(/data-variant-name="([^"]*?)\s+((?:19|20)\d{2})"/g)];
	const years = variants.map((v) => Number(v[2])).filter((y) => y >= 2000);
	// The page describes the current model year; when several are listed,
	// the earliest is the one on sale now and the later one is next year's.
	const modelYear = years.length ? Math.min(...years) : undefined;

	const prices = [...html.matchAll(/data-price="([^"]*)"/g)]
		.map((m) => num(m[1]))
		.filter((p): p is number => p !== undefined && p > 500 && p < 150_000);

	const power = item(/Max\.? vermogen[^<]*|Vermogen[^<]*/);
	const kw = power ? bounded(num(power), 1, 250) : undefined;

	// The page also carries the site's navigation, with other models' images
	// in it. Only an asset filed under this model's own folder counts.
	const found: OfficialImage[] = [];
	const key = family.toLowerCase().replace(/[^a-z0-9]/g, '');
	for (const asset of html.matchAll(
		/(?:src|data-src|data-srcset|content)="([^"]*?\/content\/dam\/[^"]*?((?:19|20)?\d{2})YM_[^"]*?\.(?:png|jpg|jpeg|webp))/gi
	)) {
		// A `srcset` carries "url 320w, url 600w"; a file name with spaces in
		// it ("MAT PEARL GLARE WHITE") must not be cut at the first one. The
		// candidate is the run up to the extension, spaces encoded.
		const raw = asset[1].replace(/\/jcr:content\/renditions\/[^"]*$/, '');
		const upTo = /^(.*?\.(?:png|jpe?g|webp))(?:\s|$)/i.exec(raw)?.[1];
		if (!upTo) continue;
		let path = upTo;
		try {
			path = encodeURI(decodeURI(upTo));
		} catch {
			// a stray percent sign: keep the path as written
		}
		const folder = path.toLowerCase().replace(/[^a-z0-9/]/g, '');
		if (assetFolder) {
			// "crf1100l_at" must not pass for "crf1100l_atas": whole folder only.
			if (!path.toLowerCase().includes(`/${assetFolder.toLowerCase()}/`)) continue;
		} else if (key && !folder.includes(key)) {
			// Whole key only. A looser match once let "cb125r" pass for the
			// CUVe scooter and "hornet" for the wrong Hornet.
			continue;
		}
		const yy = Number(asset[2]);
		const year = yy < 100 ? 2000 + yy : yy;
		found.push({
			url: path.startsWith('http') ? path : `https://www.honda.nl${path}`,
			modelYear: year,
			evidence: `official Honda NL image; asset name states model year ${year}`
		});
	}
	// The first asset's year is the page's; the other colours of that year
	// follow it, and nothing of another year does.
	const images = officialGallery(found.filter((i) => i.modelYear === found[0]?.modelYear));
	const image = images[0];

	return {
		modelYear,
		seatHeightMm: bounded(num(item(/Zithoogte[^<]*/)), 500, 1000),
		torqueNm: bounded(num(item(/Max\.? koppel[^<]*|Koppel \(Nm[^<]*/)), 5, 300),
		powerKw: kw,
		powerHp: kw !== undefined ? Math.round((kw / 0.7457) * 10) / 10 : undefined,
		wetWeightKg: bounded(num(item(/Rijklaargewicht[^<]*/)), 40, 600),
		displacementCc: bounded(num(item(/Cilinderinhoud[^<]*/)), 20, 3500),
		fuelCapacityL: bounded(num(item(/Tankinhoud[^<]*|Inhoud brandstoftank[^<]*/)), 2, 60),
		wheelbaseMm: bounded(num(item(/Wielbasis[^<]*/)), 900, 2200),
		priceEur: prices.length ? Math.min(...prices) : undefined,
		image,
		images: images.length ? images : undefined
	};
}

// ---------------------------------------------------------------------------
// Suzuki NL
// ---------------------------------------------------------------------------

/**
 * Suzuki's pages carry a table of `<td class="table-header">Zithoogte mm</td>
 * <td class="table-content">810</td>` rows, and an official image whose asset
 * code ends in the model-year letter: "GSX800RQM5" is a 2025 model (M0 = 2020).
 */
export function parseSuzukiPage(html: string): OfficialSpecs {
	const cell = (label: RegExp): string | undefined => {
		const re = new RegExp(
			`<td class="table-header">\\s*(${label.source})\\s*</td>\\s*<td class="table-content">([^<]*)</td>`,
			'i'
		);
		return re.exec(html)?.[2];
	};

	// The table states power in horsepower ("Vermogen pk/t.p.m.") on most pages
	// and in kilowatts on some; the header says which.
	const inKw = cell(/(?:Max\.? )?[Vv]ermogen[^<]*kW[^<]*/);
	const inPk = cell(/(?:Max\.? )?[Vv]ermogen[^<]*(?:pk|PS)[^<]*/);
	const kw = inKw
		? bounded(num(inKw), 1, 250)
		: inPk
			? bounded(Math.round(num(inPk)! * 0.7457 * 10) / 10, 1, 250)
			: undefined;

	let image: OfficialSpecs['image'];
	const og = /property="og:image" content="([^"]+)"/i.exec(html)?.[1];
	if (og) {
		const code = /Suzuki_([A-Z0-9]+?)(M\d)_/i.exec(og);
		const year = code ? 2020 + Number(code[2].slice(1)) : undefined;
		image = {
			url: og,
			modelYear: year,
			evidence: year
				? `official Suzuki NL image; asset code ${code![1]}${code![2]} states model year ${year}`
				: 'official Suzuki NL model page image'
		};
	}

	// Suzuki's pages quote prices for financing examples and other models
	// alongside the model's own; there is no marked-up list price to read, so
	// none is taken.

	return {
		modelYear: image?.modelYear,
		seatHeightMm: bounded(num(cell(/Zithoogte[^<]*/)), 500, 1000),
		torqueNm: bounded(num(cell(/Koppel[^<]*/)), 5, 300),
		powerKw: kw,
		powerHp: kw !== undefined ? Math.round((kw / 0.7457) * 10) / 10 : undefined,
		wetWeightKg: bounded(num(cell(/(?:Rijklaar ?)?[Gg]ewicht[^<]*/)), 40, 600),
		displacementCc: bounded(num(cell(/Cilinderinhoud[^<]*/)), 20, 3500),
		fuelCapacityL: bounded(num(cell(/Tankinhoud[^<]*|Brandstoftank[^<]*/)), 2, 60),
		wheelbaseMm: bounded(num(cell(/Wielbasis[^<]*/)), 900, 2200),
		image
	};
}

// ---------------------------------------------------------------------------
// Yamaha NL
// ---------------------------------------------------------------------------

/**
 * Yamaha's pages render their specifications client-side; only the official
 * image is in the HTML, under `/product-assets/<model year>/`.
 */
export function parseYamahaPage(html: string): OfficialSpecs {
	const og = /property="og:image" content="([^"]+)"/i.exec(html)?.[1];
	if (!og) return {};
	const year = /\/product-assets\/((?:19|20)\d{2})\//.exec(og)?.[1];
	return {
		modelYear: year ? Number(year) : undefined,
		image: {
			url: og,
			modelYear: year ? Number(year) : undefined,
			evidence: year
				? `official Yamaha NL image; asset path states model year ${year}`
				: 'official Yamaha NL model page image'
		}
	};
}

// ---------------------------------------------------------------------------
// Triumph NL
// ---------------------------------------------------------------------------

/**
 * Triumph's specification pages carry an accessible table per variant —
 * `<th id="tiger-900-gt-pro-zadelhoogte">Zadelhoogte</th><td headers="…">Verstelbaar
 * 820 - 840 mm</td>` — and colour assets filed under "my26 colours/<model>/",
 * which names the model year. The first variant's column is read; a range
 * ("820 - 840 mm") yields its lower figure, which is the seat's lowest setting.
 */
export function parseTriumphPage(html: string, family = '', modelHtml = ''): OfficialSpecs {
	// One table per variant ("Street Triple 765 R", "… RS"): every variant's
	// cell is read. Power and torque take the strongest variant, as the
	// registry's type approval does; seat height takes the lowest setting.
	const values = (label: RegExp): string[] => {
		const re = new RegExp(
			String.raw`<th[^>]*>\s*(?:${label.source})\s*</th>\s*<td[^>]*>([^<]*)</td>`,
			'gi'
		);
		return [...html.matchAll(re)].map((m) => m[1].replace(/\s+/g, ' ').trim());
	};
	const value = (label: RegExp): string | undefined => values(label)[0];
	const max = (list: (number | undefined)[]): number | undefined => {
		const known = list.filter((v): v is number => v !== undefined);
		return known.length ? Math.max(...known) : undefined;
	};

	const powerKwOf = (text: string): number | undefined => {
		const kwText = /(\d+(?:[.,]\d+)?)\s*kW/i.exec(text)?.[1];
		const pkText = /(\d+(?:[.,]\d+)?)\s*pk/i.exec(text)?.[1];
		return kwText
			? bounded(Number(kwText.replace(',', '.')), 1, 250)
			: pkText
				? bounded(Math.round(Number(pkText.replace(',', '.')) * 0.7457 * 10) / 10, 1, 250)
				: undefined;
	};
	const kw = max(values(/Max\.? vermogen(?: EC)?/).map(powerKwOf));

	// The model page files its photographs under "myNN/…" with the model in
	// the file name — "street-triple-r-my26-phantom-black-rhs", "my24_tiger1200
	// rallyexplorer_hero". A file that names another model is another model's.
	const key = family.toLowerCase().replace(/[^a-z0-9]/g, '');
	const candidates: { url: string; year: number; hero: boolean }[] = [];
	for (const asset of (modelHtml || html).matchAll(
		/https:\/\/media[.]triumphmotorcycles[.]co[.]uk[^"'\s]*?\/([^/"'\s]+\.(?:png|jpg|jpeg|webp))/gi
	)) {
		const file = decodeURIComponent(asset[1]).toLowerCase();
		const flat = file.replace(/[^a-z0-9]/g, '');
		// A thumbnail or a cropped hero is not the photograph.
		if (/\/thumbnails?\/|\/c_fill|\/c_crop/i.test(asset[0])) continue;
		const my = /my(\d{2})/.exec(flat);
		// "street-triple-r-my26" is the current Street Triple 765: the family
		// name without its displacement also names it, as long as the file does
		// not carry a different displacement of its own.
		const base = key.replace(/\d+$/, '');
		const digits = key.slice(base.length);
		const afterBase = flat.includes(base)
			? (/^\d+/.exec(flat.slice(flat.indexOf(base) + base.length))?.[0] ?? '')
			: null;
		const named =
			flat.includes(key) ||
			(afterBase !== null &&
				base.length >= 6 &&
				(afterBase === '' || afterBase === digits || !digits));
		if (!my || !named) continue;
		candidates.push({
			url: asset[0].replace(/\/image\/upload\/[^/]+\//, '/image/upload/w_1200,c_scale/'),
			year: 2000 + Number(my[1]),
			hero: /hero|rhs/.test(flat)
		});
	}
	candidates.sort((a, b) => b.year - a.year || Number(b.hero) - Number(a.hero));
	const images = officialGallery(
		candidates
			.filter((c) => c.year === candidates[0]?.year)
			.map((c) => ({
				url: c.url,
				modelYear: c.year,
				evidence: `official Triumph NL image; file name states model year MY${String(c.year).slice(2)}`
			}))
	);
	const image = images[0];

	const seats = values(/Zadelhoogte/)
		.map((v) => bounded(num(v), 500, 1000))
		.filter((v): v is number => v !== undefined);
	const weight = value(/Gewicht rijklaar|Rijklaar gewicht|Gewicht \(rijklaar\)|Natgewicht/);

	return {
		modelYear: image?.modelYear,
		seatHeightMm: seats.length ? Math.min(...seats) : undefined,
		torqueNm: max(values(/Max\.? koppel(?: EC)?/).map((v) => bounded(num(v), 5, 300))),
		powerKw: kw,
		powerHp: kw !== undefined ? Math.round((kw / 0.7457) * 10) / 10 : undefined,
		wetWeightKg: bounded(num(weight), 40, 600),
		displacementCc: bounded(num(value(/Cilinderinhoud/)), 20, 3500),
		wheelbaseMm: bounded(num(value(/Wielbasis/)), 900, 2200),
		fuelCapacityL: bounded(num(value(/Tankinhoud|Inhoud brandstoftank/)), 2, 60),
		image,
		images: images.length ? images : undefined
	};
}

// ---------------------------------------------------------------------------
// KTM NL
// ---------------------------------------------------------------------------

/**
 * KTM's model page names the model year in its title ("2024 KTM 1290 Super
 * Duke GT") and carries an official image whose asset name repeats it; the
 * specification page lists label/value rows. "Weight (without fuel)" is not a
 * wet weight and is kept as a dry figure.
 */
export function parseKtmPages(modelHtml: string, specHtml: string): OfficialSpecs {
	const title = /property="og:title" content="([^"]*)"/i.exec(modelHtml)?.[1] ?? '';
	const year = /\b((?:20)\d{2})\s+KTM\b/i.exec(title)?.[1];
	const modelYear = year ? Number(year) : undefined;

	let image: OfficialSpecs['image'];
	const og = /property="og:image" content="([^"]+)"/i.exec(modelHtml)?.[1];
	if (og && !/logo/i.test(og)) {
		image = {
			url: og,
			modelYear,
			evidence: modelYear
				? `official KTM NL page titled "${title.replace(/\s*\|.*$/, '')}", model year ${modelYear}`
				: 'official KTM NL model page image'
		};
	}

	const row = (label: RegExp): string | undefined => {
		const re = new RegExp(
			String.raw`content-col">\s*(?:${label.source})\s*</div>\s*<div class="c-technical-specifications-modal__content-col">\s*([^<]{1,60}?)\s*</div>`,
			'i'
		);
		return re.exec(specHtml)?.[1];
	};
	const power = row(/Power/);
	const kwText = power ? /(\d+(?:[.,]\d+)?)\s*kW/i.exec(power)?.[1] : undefined;
	const hpText = power ? /(\d+(?:[.,]\d+)?)\s*(?:hp|PS)/i.exec(power)?.[1] : undefined;
	const kw = kwText
		? bounded(Number(kwText.replace(',', '.')), 1, 250)
		: hpText
			? bounded(Math.round(Number(hpText.replace(',', '.')) * 0.7457 * 10) / 10, 1, 250)
			: undefined;

	return {
		modelYear,
		seatHeightMm: bounded(num(row(/Seat height/)), 500, 1000),
		torqueNm: bounded(num(row(/Torque/)), 5, 300),
		powerKw: kw,
		powerHp: kw !== undefined ? Math.round((kw / 0.7457) * 10) / 10 : undefined,
		dryWeightKg: bounded(num(row(/Weight \(without fuel\)|Dry weight/)), 40, 600),
		displacementCc: bounded(num(row(/Displacement/)), 20, 3500),
		fuelCapacityL: bounded(num(row(/Tank capacity[^<]*/)), 2, 60),
		wheelbaseMm: bounded(num(row(/Wheelbase/)), 900, 2200),
		image
	};
}

// ---------------------------------------------------------------------------
// Kawasaki NL
// ---------------------------------------------------------------------------

/**
 * Kawasaki's model page is served complete — the earlier note that it was
 * rendered client-side was about a URL scheme the site no longer uses. The
 * title states the model year ("Versys 650 | 2026 | Kawasaki"), the
 * specification table is `<th>label</th><td>value</td>` rows in Dutch, and
 * the list price follows "Vanaf".
 *
 * Every product image carries Kawasaki's asset code, which starts with the
 * model year and the type: `26KLE650H` is a 2026 KLE650H, the Versys 650.
 * Studio views (code `D…`, `DRS` = right side) are preferred over gallery
 * action shots (`A…`), and a side view over a three-quarter one, because a
 * card wants the machine, not the scenery. Accessory and cover photographs
 * carry no such code and are never chosen.
 */
export function parseKawasakiPage(html: string): OfficialSpecs {
	const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '';
	const year = /\|\s*((?:20)\d{2})\s*\|/.exec(title)?.[1];
	const modelYear = year ? Number(year) : undefined;

	// --- Image ------------------------------------------------------------------
	// "Resource_320370_26KLE650H_J_44TBU1DRS3CG_A.jpg": model year 26, type
	// KLE650H, then the colour code (44TBU1, or 141GN1), the view (DRS) and
	// a suffix.
	const ASSET =
		/\/content\/dam\/products\/pim\/(studio|gallery)\/(?:[a-z0-9-]+\/)?Resource_\d+_(\d{2})([A-Z]{2,3}\d{3,4}[A-Z]?)(?:_[A-Z0-9]+)*?_\d{2,3}[A-Z]{2,3}\d([A-Z]{2,4})\d[A-Z]{2}_[A-Z]\.(?:jpe?g|png)/g;
	type Candidate = { path: string; year: number; code: string; rank: number };
	const candidates = new Map<string, Candidate>();
	for (const match of html.matchAll(ASSET)) {
		const [path, kind, yy, type, view] = match;
		const assetYear = 2000 + Number(yy);
		// A next-year page is published with the current year's photographs;
		// the photograph keeps its own year as evidence. Anything older, or
		// newer than the page, is some other model's.
		if (modelYear !== undefined && (assetYear > modelYear || assetYear < modelYear - 1)) continue;
		// Whole-bike views only. Studio right side first (the profile every
		// card in the catalogue leads with), then left side, then the studio
		// three-quarter views, then riding shots from the gallery. Feature
		// close-ups (F…), accessorised bikes (DO…) and the rest stay out.
		const rank =
			kind === 'studio'
				? /^DRS$/.test(view)
					? 0
					: /^DLS$/.test(view)
						? 1
						: /^D[LR]F$/.test(view)
							? 2
							: undefined
				: /^A[LR][SF]A?$|^AFA$/.test(view)
					? 3
					: undefined;
		if (rank === undefined) continue;
		if (!candidates.has(path)) {
			candidates.set(path, { path, year: assetYear, code: `${yy}${type}`, rank });
		}
	}
	// One of each view before a second colour of the same view, so a gallery
	// of three shows the bike from more than one side.
	const byRank = [...candidates.values()].sort(
		(a, b) => a.rank - b.rank || a.path.localeCompare(b.path)
	);
	const ordered: Candidate[] = [];
	for (const rank of [0, 1, 2, 3]) {
		const first = byRank.find((c) => c.rank === rank);
		if (first) ordered.push(first);
	}
	for (const c of byRank) if (!ordered.includes(c)) ordered.push(c);
	const images = officialGallery(
		ordered.map((c) => ({
			url: `https://www.kawasaki.nl${c.path}/jcr:content/renditions/cq5dam.web.1280.1280.png`,
			modelYear: c.year,
			evidence: `official Kawasaki NL image; asset code ${c.code} states model year ${c.year}`
		}))
	);
	const image: OfficialSpecs['image'] | undefined = images[0];

	// --- Specifications ---------------------------------------------------------
	const row = (label: RegExp): string | undefined => {
		const re = new RegExp(
			String.raw`<th[^>]*>\s*(?:<[^>]+>\s*)*[^<]*?(?:${label.source})[^<]*(?:<[^>]+>\s*)*</th>\s*<td[^>]*>\s*(?:<[^>]+>\s*)*([^<]{1,80}?)\s*(?:<[^>]+>\s*)*</td>`,
			'i'
		);
		return re.exec(html)?.[1];
	};
	const power = row(/Maximum vermogen|Max\.? vermogen/);
	const kwText = power ? /(\d+(?:[.,]\d+)?)\s*kW/i.exec(power)?.[1] : undefined;
	const psText = power ? /\{\s*(\d+(?:[.,]\d+)?)\s*PS\s*\}/i.exec(power)?.[1] : undefined;
	const kw = kwText ? bounded(Number(kwText.replace(',', '.')), 1, 250) : undefined;
	const hp = psText
		? bounded(Number(psText.replace(',', '.')), 1, 350)
		: kw !== undefined
			? Math.round((kw / 0.7457) * 10) / 10
			: undefined;

	const price = /Vanaf[\s\S]{0,400}?(?:€|&euro;|&#8364;)\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/.exec(
		html
	)?.[1];

	return {
		modelYear,
		seatHeightMm: bounded(num(row(/Zithoogte/)), 500, 1000),
		torqueNm: bounded(num(row(/Maximum koppel|Max\.? koppel/)), 5, 300),
		powerKw: kw,
		powerHp: hp,
		wetWeightKg: bounded(num(row(/Rijklaargewicht/)), 40, 600),
		dryWeightKg: bounded(num(row(/drooggewicht/)), 40, 600),
		displacementCc: bounded(num(row(/Cilinderinhoud/)), 20, 3500),
		wheelbaseMm: bounded(num(row(/Wielbasis/)), 900, 2200),
		priceEur: bounded(num(price), 500, 100000),
		image,
		images: images.length ? images : undefined
	};
}

// ---------------------------------------------------------------------------
// BMW Motorrad NL
// ---------------------------------------------------------------------------

/**
 * BMW's model pages carry the configurator's studio shots as `data-src`
 * attributes, filed under
 * `/images/models/<segment>/<model>[-<launch year>]/<model year>/softconfigurator/nsc-<model>-<colour>-softconfigurator.jpg`;
 * the model-year folder is the evidence. A page shows the model year on sale
 * (a "2027" folder in September 2026 is next year's colours), never an
 * earlier one. The specifications sit on the `technicaldata.html` page as
 * label/value rows: "Zithoogte, onbeladen" → "850 mm (optie verlaging: 790 mm)".
 *
 * `slug` is the model as BMW spells it in asset names ("s1000xr"). Images of
 * any other model on the page — the "you may also like" teasers — are ignored.
 */
export function parseBmwPages(html: string, specsHtml: string, slug: string): OfficialSpecs {
	const specs: OfficialSpecs = {};
	const site = 'https://www.bmw-motorrad.nl';
	const model = slug.replace(/[^a-z0-9-]/gi, '').toLowerCase();
	if (!model) return specs;

	// Studio shots of this model, dated by their folder; the first one is the
	// base colour. Thumbnails are the same picture small.
	const studio = new RegExp(
		String.raw`data-src="(/content/dam/[^"]*/images/models/[a-z-]+/${model}(?:-\d{4})?(?:/((?:19|20)\d{2})(?:-\d+)?)?/softconfigurator/nsc-${model}-([A-Z0-9]+)-softconfigurator\.jpg[^"]*)"`,
		'g'
	);
	const shots = [...html.matchAll(studio)].map((m) => ({
		url: site + m[1],
		year: m[2] ? Number(m[2]) : undefined,
		colour: m[3]
	}));
	const dated = shots.filter((s) => s.year !== undefined);
	const chosen = dated.length ? dated : shots.slice(0, 1);
	const images = officialGallery(
		chosen.map((s) => ({
			url: s.url,
			modelYear: s.year,
			evidence: s.year
				? `official BMW Motorrad NL configurator image (colour ${s.colour}); asset path states model year ${s.year}`
				: `official BMW Motorrad NL configurator image (colour ${s.colour})`
		}))
	);
	if (images.length) {
		specs.image = images[0];
		specs.images = images;
	} else {
		// The product stage the page opens with, when it is this model's.
		const stage = new RegExp(
			String.raw`property="og:image" content="([^"]*/models/[a-z-]+/${model}(?:-\d{4})?/((?:19|20)\d{2})(?:-\d+)?/productstage/nsc-${model}-[^"]*)"`
		).exec(html);
		if (stage) {
			specs.image = {
				url: stage[1],
				modelYear: Number(stage[2]),
				evidence: `official BMW Motorrad NL product image; asset path states model year ${stage[2]}`
			};
		}
	}
	if (specs.image?.modelYear) specs.modelYear = specs.image.modelYear;

	// The specification rows. BMW writes thousands both ways ("1.905 mm",
	// "1,541 mm"); the first figure of a value is the standard setting.
	const rows = new Map<string, string>();
	for (const m of specsHtml.matchAll(
		/class="table__label">\s*([^<]*?)\s*<\/div>\s*<div[^>]*class="table__value">\s*([^<]*)/g
	)) {
		rows.set(m[1].replace(/\s+/g, ' ').toLowerCase(), m[2].replace(/\s+/g, ' ').trim());
	}
	const row = (label: RegExp): string | undefined => {
		for (const [key, value] of rows) if (label.test(key)) return value;
		return undefined;
	};
	const figure = (text: string | undefined): number | undefined => {
		const m = text ? /\d{1,3}(?:[.,]\d{3})+|\d+(?:,\d+)?/.exec(text) : null;
		if (!m) return undefined;
		const raw = /^\d{1,3}(?:[.,]\d{3})+$/.test(m[0])
			? m[0].replace(/[.,]/g, '')
			: m[0].replace(',', '.');
		const value = Number(raw);
		return Number.isFinite(value) ? value : undefined;
	};

	specs.displacementCc = bounded(figure(row(/^cilinderinhoud/)), 50, 2500);
	const power = row(/^nominaal vermogen/);
	specs.powerKw = bounded(figure(/(\d+(?:,\d+)?)\s*kW/i.exec(power ?? '')?.[1]), 1, 250);
	specs.powerHp = bounded(figure(/(\d+(?:,\d+)?)\s*pk/i.exec(power ?? '')?.[1]), 1, 350);
	specs.torqueNm = bounded(figure(row(/koppel/)), 5, 300);
	specs.seatHeightMm = bounded(figure(row(/^zithoogte/)), 500, 1000);
	specs.wetWeightKg = bounded(figure(row(/^rijklaar gewicht/)), 60, 500);
	specs.wheelbaseMm = bounded(figure(row(/^wielbasis/)), 1000, 2000);
	specs.fuelCapacityL = bounded(figure(row(/^tankinhoud/)), 3, 40);
	for (const key of Object.keys(specs) as (keyof OfficialSpecs)[]) {
		if (specs[key] === undefined) delete specs[key];
	}
	return specs;
}

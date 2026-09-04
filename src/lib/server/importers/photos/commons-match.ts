import { normalizeBrand, normalizeModel, stripBrandPrefix } from '../match';

/**
 * Deciding whether a Wikimedia Commons photograph is actually of the motorcycle
 * we asked about.
 *
 * The Dutch registry knows about roughly four thousand machines nobody has
 * written an encyclopedia article for, and this app asks you to judge a bike on
 * how it looks. So the photographs have to come from somewhere, and Commons
 * search is the only free source of them.
 *
 * Commons search is a full-text search, not a lookup. Asking it for a
 * "Kawasaki Ninja 400" cheerfully returns a Ninja ZX-6R, and asking for a
 * "Harley-Davidson Street Glide" returns an Electra Glide dashboard. Showing
 * the wrong bike is worse than showing none: the entire product is the user
 * saying yes or no to what is in the picture.
 *
 * Hence everything below. Nothing here touches the network, so the rules that
 * decide what the user sees are cheap to test.
 */

/**
 * Titles that are a photograph of a *part* rather than of a motorcycle.
 *
 * Commons is full of these — they are useful to an encyclopedia and useless
 * here. "Suzuki DL650 2009 Indicator Lense.jpg" is a real search result for a
 * real bike, and it is a close-up of an orange plastic lens.
 */
const DETAIL_SHOT =
	/\b(engine|motor detail|dashboard|dash|cockpit|instrument|instrumentation|speedo|speedometer|tachometer|emblem|badge|logo|decal|lens|lense|mirror|handlebar|grip|lever|tank|fuel cap|wheel|tyre|tire|brake|caliper|disc|rotor|exhaust|muffler|silencer|swingarm|fork|shock|chain|sprocket|seat detail|headlight|headlamp|tail ?light|indicator|blinker|licen[cs]e plate|number plate|odometer|switch|key|manual|brochure|advert|poster|patent|diagram|drawing|blueprint|schematic|assembly|frame only|parts?|spares?|close ?-?up|interior|toolkit|r[ée]servoir|compteur|tableau de bord|armaturen|tacho|cockpit|auspuff|motorblok|dashboard|uitlaat|kilometerteller|schriftzug|scheinwerfer|r[üu]cklicht|lights?|rear[- ]lights?|petrol[- ]cap|gas cap|keyless|cruscotto|quadro|gearshift|panel)\b/i;

/** Whether a title names a part of the machine rather than the machine. */
export function looksLikeDetailShot(title: string): boolean {
	return DETAIL_SHOT.test(title.replace(/^File:/i, '').replace(/[_]/g, ' '));
}

/**
 * Titles that are a scene rather than a portrait of one machine — a rally
 * field, a showroom row, a parade. The bike we want may be in there somewhere,
 * but not as the subject.
 */
const CROWD_SHOT =
	/\b(rally|meeting|meet|parade|show ?room|dealership|exhibition|expo|museum hall|line ?-?up|group|crowd|race start|paddock|grid|traffic|street scene|car park|parking lot)\b/i;

/** Only real raster photographs. SVGs are diagrams and logos. */
const PHOTO_EXTENSION = /\.(jpe?g|png|webp)$/i;

/**
 * Accents dropped: "Ténéré" and "Tenere" are the same word, and Commons
 * spells it both ways. `normalizeModel` strips non-ASCII letters instead of
 * folding them, so both sides of every comparison are folded first.
 */
export function foldAccents(text: string): string {
	return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Reduces a Commons file title to the same alphabet `normalizeModel` uses, so
 * "File:BMW R 1250 GS (1).jpg" and a model named "R1250GS" meet in the middle.
 */
export function normalizeTitle(title: string): string {
	return foldAccents(title)
		.replace(/^File:/i, '')
		.replace(/\.[a-z0-9]+$/i, '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}

export interface PhotoCandidate {
	/** The Commons file title, e.g. "File:Kawasaki Ninja 400.jpg". */
	title: string;
	width?: number | null;
	height?: number | null;
}

export interface MatchContext {
	manufacturerName: string;
	model: string;
	/**
	 * Other models of the same manufacturer in the catalogue.
	 *
	 * Without these, a search for a Kawasaki Z900 accepts every photograph of a
	 * Z900RS: the normalised title contains the normalised model as a prefix,
	 * and they are different motorcycles. A sibling model that the title matches
	 * *more* specifically is proof the photograph is of that bike instead.
	 */
	siblingModels?: readonly string[];
}

/**
 * Whether a search result is a usable photograph of this exact motorcycle.
 *
 * Deliberately strict. A thin deck of correct bikes is the product working; a
 * full deck where a tenth of the pictures are the wrong machine is not.
 */
export function isPhotoOf(candidate: PhotoCandidate, context: MatchContext): boolean {
	const { title } = candidate;
	if (!PHOTO_EXTENSION.test(title)) return false;

	const readable = title.replace(/^File:/i, '').replace(/[_]/g, ' ');
	if (DETAIL_SHOT.test(readable) || CROWD_SHOT.test(readable)) return false;

	// A photograph too small or too oddly shaped to show a motorcycle.
	const { width, height } = candidate;
	if (width && height) {
		if (width < 640 || height < 400) return false;
		const aspect = width / height;
		if (aspect > 3 || aspect < 0.4) return false;
	}

	const brand = normalizeBrand(context.manufacturerName);
	const model = normalizeModel(foldAccents(context.model));
	if (!brand || !model) return false;

	const normalized = normalizeTitle(title);
	if (!normalized.includes(brand) || !normalized.includes(model)) return false;

	// A longer model of the same brand that the title also names is the better
	// explanation of what is in the picture. "Kawasaki Z900RS" names the Z900RS,
	// not the Z900.
	for (const sibling of context.siblingModels ?? []) {
		// The brand is stripped first, or a registry row spelled
		// "BMW R1200GSADVENTURE" counts as a longer, different model than
		// "R 1200 GS Adventure" and blocks that bike's own photographs.
		const other = normalizeModel(stripBrandPrefix(context.manufacturerName, sibling));
		if (other.length > model.length && other.includes(model) && normalized.includes(other)) {
			return false;
		}
	}

	return true;
}

/**
 * The search string sent to Commons.
 *
 * "motorcycle" is appended because model designations are not unique across the
 * world — "Suzuki DL650" is unambiguous, but plenty of bikes are named after
 * animals, places and numbers.
 */
export function buildSearchQuery(manufacturerName: string, model: string): string {
	return `${manufacturerName} ${model} motorcycle`.replace(/\s+/g, ' ').trim();
}

/**
 * Trim markers a registry appends that Commons never uses in a file name.
 *
 * Kept deliberately short. "ABS" and "DCT" are safe to drop because no
 * motorcycle is called one; a longer list starts eating real model names — XT,
 * SE and R are all bikes.
 */
const TRIM_SUFFIX = /\s+(abs|dct|e5|e4|eu[45]|a2|lams)\b/gi;

/**
 * The model names worth searching for, best first.
 *
 * A registry's model field is not a marketing name. It holds "Z800 ABS" where
 * Commons has "Z800", and "MTT850D (TRACER900 GT)" where the name anybody
 * would recognise is hiding in the brackets. Searching only the literal string
 * left a large number of perfectly well photographed motorcycles with no
 * picture at all.
 *
 * Each variant is matched against results on its own terms, so a photo accepted
 * for "Z800" still has to be a Z800 — the fallbacks widen the search, never the
 * standard of proof.
 */
export function modelVariants(model: string): string[] {
	const variants: string[] = [];
	const add = (value: string) => {
		const trimmed = value.replace(/\s+/g, ' ').trim();
		if (trimmed.length >= 2 && !variants.includes(trimmed)) variants.push(trimmed);
	};

	add(model);

	// "MTT850D (TRACER900 GT)" — the recognisable name is the parenthetical.
	const bracketed = /\(([^)]{2,})\)/.exec(model);
	if (bracketed) add(bracketed[1]);

	const withoutBrackets = model.replace(/\([^)]*\)/g, ' ');
	add(withoutBrackets);
	add(withoutBrackets.replace(TRIM_SUFFIX, ' '));

	return variants;
}

/**
 * Whether a file name positively identifies a *different* motorcycle.
 *
 * The mirror image of `isPhotoOf`, and needed for a different job. `isPhotoOf`
 * asks "can I prove this is the right bike" and is the correct test when
 * choosing between search results. But an article's lead image is curated by
 * editors and often named something like "File:At the 2019 show.jpg" — true of
 * the bike, provably of nothing. Demanding proof there throws away good
 * photographs.
 *
 * So this asks the opposite: "can I prove this is the *wrong* bike". It only
 * rejects a file that names another manufacturer, or another model in the
 * catalogue that explains the name better than ours does.
 *
 * Both real failures came through this gap. A Honda CBR600RR was on the
 * Kawasaki Z900's page, and so was a Z900**RS** — a different motorcycle whose
 * name contains the one we were looking for.
 */
export function namesADifferentMotorcycle(
	title: string,
	context: {
		manufacturerName: string;
		model: string;
		/** Normalised brand keys of every other manufacturer in the catalogue. */
		otherBrands?: readonly string[];
		/** Other models this manufacturer makes. */
		siblingModels?: readonly string[];
		/** Other names this model goes by — "Crosstourer" for the VFR1200X Crosstourer. */
		aliases?: readonly string[];
	}
): boolean {
	const normalized = normalizeTitle(title);
	const brand = normalizeBrand(context.manufacturerName);
	const model = normalizeModel(stripBrandPrefix(context.manufacturerName, context.model));
	if (!normalized) return false;
	const ours = [model, ...(context.aliases ?? []).map((a) => normalizeModel(a))].filter(Boolean);
	const namesOurs = ours.some((name) => normalized.includes(name));

	// Names another manufacturer and not this one.
	if (brand && !normalized.includes(brand)) {
		for (const other of context.otherBrands ?? []) {
			// Short brand keys match inside unrelated words; require something to
			// work with.
			if (other.length >= 4 && other !== brand && normalized.includes(other)) return true;
		}
	}

	if (!model) return false;

	for (const sibling of context.siblingModels ?? []) {
		const other = normalizeModel(stripBrandPrefix(context.manufacturerName, sibling));
		if (!other || other === model) continue;
		// A registry row called "Honda", "P" or "M4" is a type code or a blank,
		// not a motorcycle a photograph could be of; it must not veto a real one.
		if (other === brand || other.length < 3) continue;
		if (!normalized.includes(other)) continue;

		// A longer name that contains ours explains the file better: "z900rs" is
		// a better account of "Kawasaki Z900 RS" than "z900" is.
		if (other.length > model.length && other.includes(model)) return true;
		// A sibling that has nothing to do with our name, where ours is absent.
		if (!other.includes(model) && !namesOurs) return true;
	}

	return false;
}

/**
 * Orders accepted candidates so the best one becomes the card's primary image.
 *
 * A title that names the model and little else is almost always a clean
 * portrait of the bike; a long title is usually a photograph of an event that
 * happens to contain one. Landscape beats portrait because the card is wide,
 * and bigger beats smaller.
 */
export function rankCandidates<T extends PhotoCandidate>(
	candidates: readonly T[],
	context: MatchContext
): T[] {
	const brand = normalizeBrand(context.manufacturerName);
	const model = normalizeModel(context.model);
	const noise = (candidate: PhotoCandidate) =>
		normalizeTitle(candidate.title).replace(brand, '').replace(model, '').length;

	return [...candidates].sort((a, b) => {
		const byNoise = noise(a) - noise(b);
		if (byNoise !== 0) return byNoise;
		return (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0);
	});
}

/**
 * The model year a file name states, if it states one.
 *
 * "2018 Kawasaki Z900.jpg" and "Kawasaki Z900 (2018).jpg" say what year the
 * machine is; "Kawasaki Z900 2018-05-12.jpg" says when the photograph was
 * taken, and "Kawasaki Z900 at EICMA 2017.jpg" says where. Only a year that
 * sits right beside the model name, and is not part of a date, counts. The
 * rest return nothing, and the photograph stays evidence of the family alone.
 *
 * This is the only way an image ever reaches `MODEL_YEAR` scope, and a
 * generation ever gets a photograph that is provably its own.
 */
export interface YearInTitleOptions {
	/**
	 * The title may leave the brand out. True when the file was found in the
	 * model's own article or Commons category, where "MT-09 RN43 2017" cannot
	 * be anyone else's MT-09. False for a search result, where it could.
	 */
	brandImplied?: boolean;
}

/** A colour, which may stand between a leading year and the name. */
const COLOUR_WORD =
	/^(black|white|red|blue|green|yellow|orange|grey|gray|silver|gold|purple|brown|matt|matte|dark|light|metallic|schwarz|weiss|weiß|rot|blau|grün|gelb|grau|silber|zwart|wit|rood|blauw|groen|geel|grijs|noir|blanc|rouge|bleu|vert|jaune|gris)$/i;

/**
 * A camera's frame counter: "IMG 2019", "DSC 2015". Four digits after one of
 * these are not a year.
 */
const COUNTER_PREFIX =
	/^(img|dsc|dscf|dscn|dsci|cimg|p|pict|sam|gopr|gp|mvi|dji|pano|sdc|hpim|pic|photo|file|foto|sany|dcp|imag|mov|vid|no|nr|n°|#)$/i;

/** Words that make a year the year of an event, not of the machine. */
const EVENT_WORD =
	/^(show|salon|eicma|intermot|iaa|expo|fair|exhibition|messe|mondial|festival|rally|ride|meet|meeting|motodays|museum|tms|tokyo|paris|milan|cologne|köln|birmingham|nec|ims|auto|motorshow|motorcycleshow)$/i;

/** A month, in the languages Commons captions come in; a date is following. */
const MONTH_WORD =
	/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|januar|februar|märz|mai|juni|juli|oktober|dezember|januari|februari|maart|mei|augustus|december|janvier|février|mars|avril|juin|juillet|août|septembre|octobre|novembre|décembre)$/i;

/**
 * A trim, type or capacity code that may sit between the name and its year:
 * "XT", "ABS", "RN43", "750", "v1". Capitals, or carrying a digit — a word
 * ("Moto", "EICMA") or a preposition ("at", "the", "in") is not a code, and
 * what follows one is a caption.
 */
const CODE_TOKEN = /^(?:[A-Z]{1,3}|[A-Za-z0-9-]*\d[A-Za-z0-9-]*)$/;

/**
 * The spellings of the model a title may use: the catalogue's name, the
 * curated aliases ("Scrambler Desert Sled" for the Scrambler 800), and for a
 * two-word name of a number and a word, the two the other way round — "Duke
 * 790" is how half of Commons spells the 790 Duke.
 */
function modelSpellings(context: { model: string; aliases?: readonly string[] }): string[] {
	const spellings = [normalizeModel(foldAccents(context.model))];
	const words = context.model.trim().split(/\s+/);
	if (words.length === 2 && words.filter((w) => /^\d+$/.test(w)).length === 1) {
		spellings.push(normalizeModel(`${words[1]} ${words[0]}`));
	}
	for (const alias of context.aliases ?? []) {
		const spelling = normalizeModel(foldAccents(alias));
		if (spelling.length >= 3 && !spellings.includes(spelling)) spellings.push(spelling);
	}
	return spellings.filter(Boolean);
}

export function yearInTitle(
	title: string,
	context: { manufacturerName: string; model: string; aliases?: readonly string[] },
	now = new Date().getFullYear(),
	options: YearInTitleOptions = {}
): number | undefined {
	const brand = normalizeBrand(context.manufacturerName);
	if (!brand) return undefined;
	for (const model of modelSpellings(context)) {
		const year = yearInTitleFor(title, brand, model, now, options);
		if (year !== undefined) return year;
	}
	return undefined;
}

function yearInTitleFor(
	title: string,
	brand: string,
	model: string,
	now: number,
	options: YearInTitleOptions
): number | undefined {
	const readable = foldAccents(title)
		.replace(/^File:/i, '')
		.replace(/\.[a-z0-9]+$/i, '')
		.replace(/[_]/g, ' ');

	// A date is not a model year, wherever it sits.
	if (/\b(19|20)\d{2}[-./]\d{1,2}[-./]\d{1,2}\b/.test(readable)) return undefined;

	const isYear = (token: string) => {
		const year = Number(token);
		return /^(19[89]\d|20\d{2})$/.test(token) && year <= now + 1 ? year : undefined;
	};

	// A year that follows a comma opens a caption's date or place, not a
	// model year: "Moscow, 2023 Harley-Davidson Road Glide".
	const datedByComma = new Set<string>();
	for (const m of readable.matchAll(/,\s*((?:19|20)\d{2})\b/g)) datedByComma.add(m[1]);

	// Tokens, and for each the comma-separated segment it sits in: a year in
	// another segment than the name ("Triumph Thruxton, May 2026") is a
	// caption's date, whatever stands between.
	const tokens: string[] = [];
	const segmentOf: number[] = [];
	readable.split(/[,;]/).forEach((segment, index) => {
		for (const token of segment.split(/[\s()[\]]+/).filter(Boolean)) {
			tokens.push(token);
			segmentOf.push(index);
		}
	});
	// The name must be contiguous: the brand (one or more tokens), at most
	// one year, then the model's tokens in order. Plain lower-casing here,
	// not `normalizeModel`, which strips a trailing year — the very thing
	// being looked for. Anything else in the middle means the name was not
	// found there, and the search starts again at the next token.
	const joined = tokens.map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ''));
	let nameStart = -1;
	let nameEnd = -1;
	let between: number | undefined;
	let brandPart = '';
	let modelPart = '';
	let brandDone = false;

	const reset = () => {
		nameStart = -1;
		between = undefined;
		brandPart = '';
		modelPart = '';
		brandDone = false;
	};

	for (let index = 0; index < joined.length; index++) {
		const token = joined[index];
		if (!token) continue;
		if (nameStart === -1) {
			if (token.includes(brand)) {
				nameStart = index;
				brandDone = true;
				modelPart = token.slice(token.indexOf(brand) + brand.length);
				if (modelPart && !model.startsWith(modelPart)) {
					reset();
					continue;
				}
			} else if (brand.startsWith(token)) {
				nameStart = index;
				brandPart = token;
			} else if (options.brandImplied === true && model.startsWith(token)) {
				nameStart = index;
				brandDone = true;
				modelPart = token;
			} else {
				continue;
			}
		} else if (!brandDone) {
			if (brand.startsWith(brandPart + token)) {
				brandPart += token;
				brandDone = brandPart === brand;
			} else {
				reset();
				index--;
				continue;
			}
		} else if (modelPart === '' && between === undefined && isYear(tokens[index]) !== undefined) {
			between = isYear(tokens[index]);
		} else if (model.startsWith(modelPart + token)) {
			modelPart += token;
		} else {
			reset();
			index--;
			continue;
		}
		if (brandDone && modelPart === model) {
			nameEnd = index;
			break;
		}
	}
	if (nameEnd === -1) return undefined;

	// Between the brand and the model: "BMW 2010 R1200RT Special".
	if (between !== undefined) return between;

	// "MY2018", "MY 2016", "Modelljahr 2024", "Bj. 2020": the file says it is
	// a model year in so many words. Anywhere after the name, unless the
	// caption then hedges ("oder", "or").
	const rest = tokens.slice(nameEnd + 1);
	for (const [i, token] of rest.entries()) {
		const inline = /^(?:MY|MJ)((?:19|20)\d{2})$/i.exec(token);
		const stated = inline
			? isYear(inline[1])
			: /^(?:MY|MJ|Modelljahr|Modeljaar|Baujahr|Bj\.?)$/i.test(token)
				? isYear(rest[i + 1] ?? '')
				: undefined;
		if (stated) {
			const next = inline ? rest[i + 1] : rest[i + 2];
			return next && /^(oder|or|of)$/i.test(next) ? undefined : stated;
		}
	}

	// Immediately after the name, or after a trim, type or capacity code
	// that belongs to it: "Kawasaki Z900 2020", "Honda X-ADV 750 2025",
	// "MT-09 RN43 2017". A word in between ("Moto Cage 2015", "EICMA 2024")
	// could introduce a date or an event, and ends the search.
	for (const [i, token] of rest.entries()) {
		if (segmentOf[nameEnd + 1 + i] !== segmentOf[nameEnd]) break;
		const after = isYear(token);
		if (after) return datedByComma.has(token) ? undefined : after;
		if (EVENT_WORD.test(token) || MONTH_WORD.test(token) || !CODE_TOKEN.test(token)) break;
	}

	// Directly before the name, leading the title or after nothing more than
	// a colour: "2018 Kawasaki Z900", "Alpine white 2017 BMW R1200RT". A year
	// further in front belongs to a show, a rally or a date; so does one
	// preceded by the name of an event or written beside a comma.
	const before = tokens.slice(0, nameStart);
	if (before.length === 0 || before.length > 3) return undefined;
	// "2021 Black Yamaha MT-07": the colour is part of the name.
	const leadIndex = before.length - (COLOUR_WORD.test(before[before.length - 1]) ? 2 : 1);
	if (leadIndex < 0 || segmentOf[leadIndex] !== segmentOf[nameStart]) return undefined;
	const lead = before[leadIndex];
	const leading = isYear(lead);
	if (leading === undefined || datedByComma.has(lead)) return undefined;
	if (before.slice(0, leadIndex).some((t) => EVENT_WORD.test(t))) return undefined;
	return leading;
}

/**
 * The earliest year a file name places the photograph in, or undefined.
 *
 * Weaker than `yearInTitle` and used for a weaker claim. Whether a year in a
 * title is the model year, the date of the photograph or the year of the
 * show, the machine in the picture existed by then: a 2019 photograph cannot
 * show the 2021 restyle. The rebuild uses this to tell the generations of a
 * divided family apart. A caption's year is never later than the photograph,
 * so the earliest one is the safe bound; a camera's frame counter ("IMG
 * 2019") is not a year at all.
 */
export function photoYearInTitle(
	title: string,
	now = new Date().getFullYear()
): number | undefined {
	const readable = foldAccents(title)
		.replace(/^File:/i, '')
		.replace(/\.[a-z0-9]+$/i, '')
		.replace(/[_]/g, ' ');
	const years: number[] = [];
	const consider = (text: string) => {
		const year = Number(text);
		if (year >= 1980 && year <= now + 1) years.push(year);
	};

	// Dates: 2024-05-04, 2022-09, 06-2024, 11-1-2023, 22.04.2023, 20160704.
	for (const m of readable.matchAll(
		/\b((?:19|20)\d{2})[-./](?:0?[1-9]|1[0-2])(?:[-./](?:0?[1-9]|[12]\d|3[01]))?\b/g
	)) {
		consider(m[1]);
	}
	for (const m of readable.matchAll(/\b\d{1,2}(?:[-./]\d{1,2})?[-./]((?:19|20)\d{2})\b/g))
		consider(m[1]);
	for (const m of readable.matchAll(
		/\b((?:19|20)\d{2})(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\b/g
	)) {
		consider(m[1]);
	}

	// A year on its own, unless a frame counter's prefix stands before it.
	const tokens = readable.split(/[\s()[\],;–-]+/).filter(Boolean);
	tokens.forEach((token, index) => {
		if (!/^(?:19|20)\d{2}$/.test(token)) return;
		if (index > 0 && COUNTER_PREFIX.test(tokens[index - 1])) return;
		consider(token);
	});

	return years.length ? Math.min(...years) : undefined;
}

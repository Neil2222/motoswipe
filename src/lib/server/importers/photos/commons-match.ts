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
	/\b(engine|motor detail|dashboard|dash|cockpit|instrument|speedo|speedometer|tachometer|emblem|badge|logo|decal|lens|lense|mirror|handlebar|grip|lever|tank|fuel cap|wheel|tyre|tire|brake|caliper|disc|rotor|exhaust|muffler|silencer|swingarm|fork|shock|chain|sprocket|seat detail|headlight|headlamp|tail ?light|indicator|blinker|licen[cs]e plate|number plate|odometer|switch|key|manual|brochure|advert|poster|patent|diagram|drawing|blueprint|schematic|assembly|frame only|parts?|spares?|close ?-?up|interior|toolkit)\b/i;

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
 * Reduces a Commons file title to the same alphabet `normalizeModel` uses, so
 * "File:BMW R 1250 GS (1).jpg" and a model named "R1250GS" meet in the middle.
 */
export function normalizeTitle(title: string): string {
	return title
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
	const model = normalizeModel(context.model);
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
export function yearInTitle(
	title: string,
	context: Pick<MatchContext, 'manufacturerName' | 'model'>,
	now = new Date().getFullYear()
): number | undefined {
	const readable = title
		.replace(/^File:/i, '')
		.replace(/\.[a-z0-9]+$/i, '')
		.replace(/[_]/g, ' ');

	// A date is not a model year, wherever it sits.
	if (/\b(19|20)\d{2}[-./]\d{1,2}[-./]\d{1,2}\b/.test(readable)) return undefined;

	const tokens = readable.split(/[\s()[\],;]+/).filter(Boolean);
	const model = normalizeModel(context.model);
	const brand = normalizeBrand(context.manufacturerName);
	if (!model || !brand) return undefined;

	// Where the name ends: the first token at which "brand … model" is complete.
	// Plain lower-casing here, not `normalizeModel`, which strips a trailing
	// year — the very thing being looked for.
	const joined = tokens.map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ''));
	let nameEnd = -1;
	let running = '';
	for (const [index, token] of joined.entries()) {
		running += token;
		if (running.endsWith(model) && running.includes(brand)) {
			nameEnd = index;
			break;
		}
	}
	if (nameEnd === -1) return undefined;

	const isYear = (token: string) => {
		const year = Number(token);
		return /^(19[89]\d|20\d{2})$/.test(token) && year <= now + 1 ? year : undefined;
	};

	// Immediately after the name, or leading the whole title: "2018 Kawasaki
	// Z900". A year further in front is a show, a rally or a date.
	const after = isYear(tokens[nameEnd + 1] ?? '');
	if (after) return after;
	const leading = isYear(tokens[0] ?? '');
	return leading && joined[1] && brand.startsWith(joined[1]) ? leading : undefined;
}

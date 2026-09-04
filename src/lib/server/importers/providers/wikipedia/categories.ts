// Relative, not `$lib`, and deliberately so.
//
// This module is reachable from `scripts/import.ts`, which the production
// container runs through tsx with no SvelteKit around. The `$lib` alias comes
// from `.svelte-kit/tsconfig.json`, which is generated and not shipped in the
// image, so a value import through it fails at runtime with
// "Cannot find package '$lib'". Type-only `$lib` imports are fine — they are
// erased — but anything that survives compilation must resolve on its own.
import { NON_ROAD_TAG } from '../../../../domain/enums';
import type { MotorcycleCategory, RidingPosition } from '$lib/domain/enums';
import { stripMarkup } from './infobox';

/**
 * Classifying what Wikipedia gives us.
 *
 * Three separate questions, deliberately kept apart:
 *
 *  1. Is this even a motorcycle? (`isNotAMotorcycle`)
 *  2. Is it something you could plausibly own and ride on a road?
 *     (`isNonRoad`)
 *  3. What kind of motorcycle is it? (`mapCategory`, with an article-category
 *     fallback)
 *
 * Every one of these was written after looking at what a real import actually
 * produced, which is why the patterns are as specific as they are.
 */

/**
 * Maps a free-text class onto MotoSwipe's taxonomy.
 *
 * Order matters: the list is walked top to bottom and the first match wins, so
 * the more specific phrases come first. "Sport touring" must be tested before
 * "sport" and "hyper naked" before "naked", or everything collapses into the
 * broadest bucket.
 *
 * Whatever the source actually said is kept in `categoryRaw`, so a better
 * mapping can be applied later without re-fetching a thousand articles.
 */
const RULES: { pattern: RegExp; category: MotorcycleCategory }[] = [
	// --- Compound terms first ---------------------------------------------
	{ pattern: /sport[\s-]?tour/i, category: 'SPORT_TOURING' },
	{ pattern: /hyper[\s-]?naked|super[\s-]?naked|street[\s-]?fighter/i, category: 'HYPER_NAKED' },
	{ pattern: /dual[\s-]?sport|dual[\s-]?purpose|on\/off[\s-]?road/i, category: 'DUAL_SPORT' },
	{ pattern: /caf[eé][\s-]?racer/i, category: 'CAFE_RACER' },
	{ pattern: /super[\s-]?moto|motard/i, category: 'SUPERMOTO' },
	{ pattern: /super[\s-]?sport|super[\s-]?bike|race[\s-]?replica/i, category: 'SUPERSPORT' },
	{ pattern: /adventure|rally[\s-]?raid/i, category: 'ADVENTURE' },
	{ pattern: /scrambler/i, category: 'SCRAMBLER' },
	{ pattern: /bobber|chopper/i, category: 'BOBBER' },
	{ pattern: /power[\s-]?cruiser|cruiser/i, category: 'CRUISER' },

	// --- Single-word terms ------------------------------------------------
	{ pattern: /scooter|moped|underbone|step[\s-]?through/i, category: 'SCOOTER' },
	{ pattern: /tour(?:ing|er)|bagger|full[\s-]?dress/i, category: 'TOURING' },
	{ pattern: /enduro|motocross|trail|off[\s-]?road|trials/i, category: 'DUAL_SPORT' },
	// No word boundary after "sport": the field is very often the single word
	// "Sportbike". Safe here because every compound is matched above.
	{ pattern: /sport/i, category: 'SPORT' },
	{ pattern: /standard|naked|roadster|street/i, category: 'NAKED' },
	{ pattern: /classic|retro|heritage|vintage/i, category: 'CLASSIC' },

	// --- Long tail, learned from a real import ----------------------------
	{ pattern: /muscle[\s-]?bike|power[\s-]?bike/i, category: 'HYPER_NAKED' },
	{ pattern: /commuter|utility|\broad\b|\bcity\b/i, category: 'NAKED' }
];

/**
 * How many separate kinds of motorcycle a class field can name before it stops
 * being a classification and starts being a list.
 *
 * The Kawasaki Z750's article gave "Super Sports Tourer Adventure Bobber
 * Cruiser" — five kinds of bike, because the infobox covers a whole model
 * range. First-match-wins turned that into "Supersport", and a naked bike went
 * into the deck as a race replica.
 */
const TOO_MANY_CATEGORIES = 3;

/**
 * Counts the distinct kinds of motorcycle a class field actually names.
 *
 * The rules overlap on purpose — "Sport touring" matches SPORT_TOURING, TOURING
 * and SPORT — so counting matched rules would call every compound term a list.
 * Only matches on separate stretches of text count, which is the difference
 * between one phrase read three ways and five phrases in a row.
 */
function distinctCategoriesNamed(text: string): number {
	const claimed: [number, number][] = [];
	const categories = new Set<MotorcycleCategory>();

	// Specific rules first, so a compound term claims its span before the
	// single words inside it get a chance at it.
	for (const rule of RULES) {
		const match = rule.pattern.exec(text);
		if (!match) continue;

		const start = match.index;
		const end = start + match[0].length;
		if (claimed.some(([from, to]) => start < to && end > from)) continue;

		claimed.push([start, end]);
		categories.add(rule.category);
	}

	return categories.size;
}

export function mapCategory(rawClass: string | undefined): {
	category: MotorcycleCategory;
	categoryRaw: string | null;
} {
	const text = rawClass ? stripMarkup(rawClass) : '';
	if (!text) return { category: 'OTHER', categoryRaw: null };

	// A field naming several different kinds of bike describes a range, not this
	// machine. Better to admit we do not know: an OTHER can still be filled in
	// by a source that does.
	if (distinctCategoriesNamed(text) >= TOO_MANY_CATEGORIES) {
		return { category: 'OTHER', categoryRaw: text.slice(0, 120) };
	}

	for (const rule of RULES) {
		if (rule.pattern.test(text)) {
			return { category: rule.category, categoryRaw: text.slice(0, 120) };
		}
	}

	// Unmapped is honestly OTHER, but the original wording is preserved so the
	// gap stays visible and fixable rather than silently lost.
	return { category: 'OTHER', categoryRaw: text.slice(0, 120) };
}

/**
 * Article categories, used when the infobox has no `class` field — true of
 * roughly a third of articles.
 *
 * Only categories mentioning a motorcycle-ish noun are considered, so
 * "Category:Motorcycle sport" cannot quietly turn a tourer into a sportbike and
 * "Category:Motorcycles introduced in 1969" is simply ignored.
 */
const CATEGORY_IS_RELEVANT = /motorcycl|motorbike|\bbikes?\b|scooter|moped/i;

export function mapCategoryFromArticleCategories(categories: readonly string[]): {
	category: MotorcycleCategory;
	categoryRaw: string | null;
} {
	for (const name of categories) {
		const clean = name.replace(/^Category:/i, '').trim();
		if (!CATEGORY_IS_RELEVANT.test(clean)) continue;

		for (const rule of RULES) {
			if (rule.pattern.test(clean)) {
				return { category: rule.category, categoryRaw: clean.slice(0, 120) };
			}
		}
	}
	return { category: 'OTHER', categoryRaw: null };
}

/**
 * Things Wikidata files as a "motorcycle model" that are not motorcycles.
 *
 * The clearest case is engine articles: "BMW 247 engine" is classified as a
 * motorcycle model and carries "Category:Motorcycle engines". Putting a
 * cylinder head in a swipe deck is not a matter of taste, it is wrong, so these
 * are dropped at import rather than filtered later.
 */
export function isNotAMotorcycle(title: string, categories: readonly string[]): boolean {
	// "BMW 247 engine", "Honda RC211V engine"
	if (/\bengines?$/i.test(title.trim())) return true;

	const isEngineArticle = categories.some((c) => /\bengines?\b/i.test(c));
	const isModelArticle = categories.some((c) =>
		/\b(motorcycles|motorbikes|scooters|mopeds)\b/i.test(c)
	);
	// An engine category with no counterbalancing model category means the
	// article is about the powerplant, not a machine you can sit on.
	return isEngineArticle && !isModelArticle;
}

/**
 * Machines you cannot realistically buy and ride on a road: Grand Prix
 * prototypes, streamliners, concept bikes, minibikes, military half-tracks.
 *
 * These stay in the catalogue — a dream-garage round has every right to include
 * a YZR-M1 — but they are tagged `non-road`, and rounds exclude them by default
 * so that somebody choosing a commuter is not shown a WWII Kettenkrad.
 */
const NON_ROAD_CLASS =
	/racing|\brace\b|moto\s?gp|grand prix|prototype|streamliner|concept|mini[\s-]?bike|military|sidecar/i;

/**
 * Article categories are weaker evidence than the infobox class, so only the
 * unambiguous ones count.
 *
 * "Land speed record motorcycles" and "Racing motorcycles" were both here and
 * were both removed: they put the Triumph Tiger T110 — an ordinary 1953 road
 * bike whose engine happened to power a record-setting streamliner — outside
 * every default deck. A category describing what a bike's engine once did is
 * not a statement about the bike.
 */
const NON_ROAD_CATEGORY =
	/military|world war|wehrmacht|armed forces|grand prix motorcycles|concept (?:motorcycles|vehicles)|tracked vehicles|half[\s-]?track/i;

export function isNonRoad(
	rawClass: string | undefined,
	categories: readonly string[] = []
): boolean {
	if (rawClass && NON_ROAD_CLASS.test(stripMarkup(rawClass))) return true;
	return categories.some((c) => NON_ROAD_CATEGORY.test(c.replace(/^Category:/i, '')));
}

/**
 * Descriptions that only restate what the card already says.
 *
 * Wikidata's one-line description is often just "motorcycle", "type of
 * motorcycle" or "Naked bike model from Honda" — true, and worth exactly
 * nothing under a heading that already reads SUZUKI / GS500 / SPORT. Over five
 * hundred rows carried one, and each of them made a page look like it had
 * information on it that it did not.
 *
 * Deliberately narrow: it matches a sentence built entirely out of category
 * words, a nationality and the manufacturer's name, and nothing else. Anything
 * with a real clause in it survives.
 */
const GENERIC_DESCRIPTION =
	/^(a |an |the )?((\w+ )?(type|model|kind|series|range|family|class) of )?((british|japanese|italian|german|american|austrian|indian|chinese|spanish|french|swedish|czech|dutch|korean|taiwanese|brazilian) )?(\w+ )?((sport|sports|super\s?sport|naked|touring|tourer|adventure|standard|racing|race|cruiser|off[\s-]?road|dual[\s-]?sport|dirt|street|classic|retro|electric|small|light|heavy|two[\s-]?wheeled|limited[\s-]?edition|special[\s-]?edition|middleweight|lightweight|heavyweight)[\s-]+)*(bike|motorcycle|motorbike|motor\s?cycle|scooter|moped|underbone|machine|vehicle|super\s?bike|sport\s?bike|street\s?bike|roadster|engine|brand|marque|manufacturer|company)s?( (bike|motorcycle|motorbike|motor\s?cycle|scooter|moped|underbone|machine|vehicle|super\s?bike|sport\s?bike|street\s?bike|roadster|engine|brand|marque|manufacturer|company)s?)*( (model|series|range|line))?( (from|by|made by|manufactured by|produced by) [\w\s.&-]{2,30})?\.?$/i;

/**
 * True when a description says nothing the rest of the card does not.
 *
 * Blank is more honest than a line of filler: a reader who sees a description
 * assumes somebody sat down and wrote it.
 */
export function isGenericDescription(description: string | null | undefined): boolean {
	const text = (description ?? '').trim();
	if (!text) return true;
	// Anything with real structure in it is doing work; leave it alone.
	if (/[,;:()]|\band\b|\bwith\b|\bwhich\b|\bthat\b|\bfor\b/i.test(text)) return false;
	return GENERIC_DESCRIPTION.test(text);
}

/**
 * Riding position, inferred from the category.
 *
 * This is an inference, not a published figure, so only the genuinely
 * unambiguous cases are claimed. A cruiser puts your feet forward; a supersport
 * puts your weight on your wrists. Everything else stays unknown.
 */
export function inferRidingPosition(category: MotorcycleCategory): RidingPosition | undefined {
	switch (category) {
		case 'CRUISER':
		case 'BOBBER':
			return 'FEET_FORWARD';
		case 'SUPERSPORT':
			return 'AGGRESSIVE';
		case 'SPORT':
		case 'CAFE_RACER':
			return 'SPORT_UPRIGHT';
		case 'ADVENTURE':
		case 'DUAL_SPORT':
		case 'SUPERMOTO':
		case 'TOURING':
		case 'NAKED':
		case 'SCRAMBLER':
		case 'SCOOTER':
			return 'UPRIGHT';
		default:
			return undefined;
	}
}

/**
 * Free-form tags, so the coarse enum is not the only handle on a motorcycle.
 * Cheap now, and exactly what a future recommendation layer would want.
 */
export function deriveTags(input: {
	categoryRaw?: string | null;
	engine?: string;
	transmission?: string;
}): string[] {
	const haystack = [input.categoryRaw, input.engine, input.transmission]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();
	// Final drive is only ever stated in the transmission field. Searching the
	// whole haystack tagged the Yamaha MT-07 as shaft-drive because its engine
	// description mentions a balance *shaft*.
	const drive = (input.transmission ?? '').toLowerCase();

	const tags = new Set<string>();
	const add = (pattern: RegExp, tag: string) => {
		if (pattern.test(haystack)) tags.add(tag);
	};
	const addDrive = (pattern: RegExp, tag: string) => {
		if (pattern.test(drive)) tags.add(tag);
	};

	add(/electric|battery/, 'electric');
	add(/two[\s-]?stroke|2[\s-]?stroke/, 'two-stroke');
	addDrive(/shaft[\s-]?(?:drive|final)|final drive[:\s-]*shaft|\bshaft\b/, 'shaft-drive');
	addDrive(/belt[\s-]?(?:drive|final)|final drive[:\s-]*belt|\bbelt\b/, 'belt-drive');
	addDrive(/chain[\s-]?(?:drive|final)|final drive[:\s-]*chain|\bchain\b/, 'chain-drive');
	add(/turbo|supercharg/, 'forced-induction');
	add(/carburett?or/, 'carburettor');
	add(/fuel[\s-]?inject/, 'fuel-injected');
	add(/retro|classic|heritage|vintage/, 'retro');
	add(/rotary|wankel/, 'rotary');

	return [...tags];
}

export { NON_ROAD_TAG };

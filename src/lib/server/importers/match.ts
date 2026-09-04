/**
 * Recognising the same motorcycle across different sources.
 *
 * RDW calls it `KAWASAKI / Z900`. Wikipedia calls it
 * `Kawasaki Heavy Industries Motorcycle & Engine / Z900`. They are one machine,
 * and if both sources create a row the swipe deck shows it twice — which is the
 * single most visible way a multi-source catalogue goes wrong.
 *
 * So every motorcycle carries a `matchKey`, and a second source that produces
 * the same key enriches the existing row instead of adding another.
 *
 * Pure functions, no database. This is exactly the kind of logic that is cheap
 * to test and expensive to get wrong.
 */

/**
 * Corporate boilerplate that differs between sources while naming one brand.
 *
 * Order matters: longer phrases first, so "motor company" is removed before
 * "motor" would have a chance to mangle "Moto Guzzi".
 */
const BRAND_NOISE = [
	'heavy industries motorcycle & engine',
	'heavy industries motorcycle and engine',
	'heavy industries',
	'motor corporation',
	'motor company',
	'motorcycle company',
	'motorcycles limited',
	'motorcycles ltd',
	'motorcycle & engine',
	'motorcycles',
	'motorcycle',
	'motorrad',
	'motor co',
	'motors',
	'engineering',
	'corporation',
	'company',
	'limited',
	'group',
	'gmbh',
	'ltd',
	'inc',
	's.p.a.',
	'spa',
	'a.g.',
	'ag',
	'nv',
	'bv'
];

/**
 * Brands that no amount of suffix-stripping reconciles, because the sources
 * genuinely use different names for the same manufacturer.
 */
const BRAND_ALIASES: Record<string, string> = {
	bmwmotorrad: 'bmw',
	harleydavidsonmotor: 'harleydavidson',
	'harley-davidson': 'harleydavidson',
	ktmsportmotorcycle: 'ktm',
	ktmsportmotorcycycle: 'ktm',
	pontedera: 'piaggio',
	mvagustamotor: 'mvagusta',
	husqvarnamotorcycles: 'husqvarna',
	royalenfieldmotors: 'royalenfield',
	royalenfieldindia: 'royalenfield',
	eichermotors: 'royalenfield',
	triumphmotorcycles: 'triumph',
	indianmotorcycle: 'indian',
	zeromotorcycles: 'zero',
	suzukimotorcycleindia: 'suzuki',
	atlashonda: 'honda',
	associatedmotorcycles: 'ajs'
};

/**
 * Reduces a manufacturer name to a stable key.
 *
 * "Kawasaki Heavy Industries Motorcycle & Engine" and "KAWASAKI" both become
 * "kawasaki"; "Moto Guzzi" survives as "motoguzzi" rather than being cut down
 * to "moto".
 */
/**
 * Normalising is pure, and the same handful of strings come round again and
 * again: checking one photograph against Honda's seven hundred models
 * normalised seven hundred names — thirty regular expressions each — and did it
 * again for every candidate. Caching took the Commons photo job from six hours
 * to well under one.
 *
 * Bounded in practice by the size of the catalogue: a few thousand entries.
 */
const brandCache = new Map<string, string>();
const modelCache = new Map<string, string>();

export function normalizeBrand(raw: string): string {
	const cached = brandCache.get(raw);
	if (cached !== undefined) return cached;

	let text = raw.toLowerCase().trim();

	// Strip corporate noise as whole words, not as substrings.
	for (const noise of BRAND_NOISE) {
		text = text.replace(new RegExp(`(^|\\s)${escape(noise)}(\\s|$)`, 'g'), ' ');
	}

	const key = text.replace(/[^a-z0-9]/g, '');
	const result = BRAND_ALIASES[key] ?? key;

	brandCache.set(raw, result);
	return result;
}

/**
 * Reduces a model name to a stable key.
 *
 * Spacing and punctuation are the main difference between sources: "Z 900" /
 * "Z900", "R 1250 GS" / "R1250GS", "MT-09" / "MT09". They all collapse to the
 * same key. Trailing model years are dropped, because one source dates a model
 * and another does not.
 */
export function normalizeModel(raw: string): string {
	const cached = modelCache.get(raw);
	if (cached !== undefined) return cached;

	const result = raw
		.toLowerCase()
		.replace(/\(.*?\)/g, ' ')
		// A trailing year is a variant marker in one source and absent in another.
		.replace(/\b(19|20)\d{2}\b\s*$/g, ' ')
		.replace(/[^a-z0-9]/g, '');

	modelCache.set(raw, result);
	return result;
}

/**
 * Removes a manufacturer name repeated at the start of a model name.
 *
 * Vehicle registries take the model as free text from whoever registered the
 * bike, so the make comes back doubled often enough to matter: RDW holds both
 * "BMW / R 1200 GS Adventure" and "BMW / BMW R1200GSADVENTURE", and KTM's most
 * popular machine is filed as "KTM / KTM 1290 Super Adventure S".
 *
 * Left alone these are separate motorcycles that never merge, they read wrong
 * on a card, and — the reason this was found — one of them makes the other
 * unphotographable, because a photo search treats a longer sibling name as
 * evidence the picture is of a different bike.
 *
 * Only leading words that spell out the brand are removed, and never the last
 * word, so a model genuinely called "Guzzi" survives.
 */
export function stripBrandPrefix(manufacturer: string, model: string): string {
	const brand = normalizeBrand(manufacturer);
	if (!brand) return model;

	let current = model.trim();
	// "KTM KTM 1290 Super Adventure S" needs two passes.
	for (let pass = 0; pass < 3; pass++) {
		const words = current.split(/\s+/);
		let consumed = '';
		let stripped = current;

		for (let i = 0; i < words.length - 1; i++) {
			consumed += normalizeModel(words[i]);
			if (consumed === brand) {
				stripped = words.slice(i + 1).join(' ');
				break;
			}
			if (!brand.startsWith(consumed)) break;
		}

		if (stripped === current) {
			// An encyclopedia abbreviates a two-word marque to its distinctive
			// half: "Guzzi California", "Agusta Superveloce", "Enfield Meteor".
			// The half on its own names the brand just as surely.
			const tail = brandTail(manufacturer);
			if (tail && words.length > 1 && normalizeModel(words[0]) === tail) {
				current = words.slice(1).join(' ');
				continue;
			}
			return current;
		}
		current = stripped;
	}
	return current;
}

/** The last word of a multi-word brand, when it is distinctive on its own. */
function brandTail(manufacturer: string): string | undefined {
	const words = manufacturer
		.toLowerCase()
		.split(/\s+/)
		.map((w) => normalizeModel(w))
		.filter(Boolean);
	if (words.length < 2) return undefined;
	const tail = words[words.length - 1];
	// "Motor", "Company" and friends are noise, not a name.
	return tail.length >= 5 && !BRAND_NOISE.includes(tail) ? tail : undefined;
}

/**
 * The key stored on every motorcycle. Returns null when either half is empty,
 * because a key of "|z900" would match every unbranded row against each other.
 */
export function buildMatchKey(manufacturer: string, model: string): string | null {
	const brand = normalizeBrand(manufacturer);
	const name = normalizeModel(model);
	if (!brand || !name) return null;
	return `${brand}|${name}`;
}

function escape(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Which fields a secondary source is allowed to fill in.
 *
 * Enrichment only ever fills a gap — it never overwrites a value the original
 * source already provided. That keeps the rule simple enough to reason about:
 * whoever created the row owns its facts, and a later source can only add what
 * was missing. A human correction (`manuallyEdited`) blocks everything, as
 * always.
 */
export const ENRICHABLE_FIELDS = [
	'displacementCc',
	'cylinders',
	'engineConfiguration',
	'cooling',
	'powerHp',
	'powerKw',
	'torqueNm',
	'transmission',
	'gears',
	'wetWeightKg',
	'dryWeightKg',
	'seatHeightMm',
	'seatWidthMm',
	'wheelbaseMm',
	'fuelCapacityLiters',
	'passengerAllowed',
	'seatCount',
	'passengerPegs',
	'ridingPosition',
	'licenseCategory',
	'msrpAmount',
	'msrpCurrency',
	'marketCountryCode',
	'availableNew',
	'firstRegistrationYear',
	'lastRegistrationYear',
	'registrationCount',
	'modelYear',
	'category',
	'description'
] as const;

export type EnrichableField = (typeof ENRICHABLE_FIELDS)[number];

/**
 * Picks the fields a secondary source may write: those the existing row has no
 * value for.
 *
 * `category` is a special case — an existing row classified as OTHER carries no
 * information, so a secondary source with a real category is an improvement
 * rather than an overwrite.
 */
export function selectEnrichment(
	existing: Record<string, unknown>,
	incoming: Record<string, unknown>,
	protectedFields: readonly string[] = []
): Record<string, unknown> {
	const patch: Record<string, unknown> = {};

	for (const field of ENRICHABLE_FIELDS) {
		if (protectedFields.includes(field)) continue;

		const incomingValue = incoming[field];
		if (incomingValue === undefined || incomingValue === null) continue;

		const currentValue = existing[field];

		if (field === 'category') {
			if (currentValue === 'OTHER' && incomingValue !== 'OTHER') patch[field] = incomingValue;
			continue;
		}

		if (currentValue === null || currentValue === undefined) {
			patch[field] = incomingValue;
		}
	}

	return patch;
}

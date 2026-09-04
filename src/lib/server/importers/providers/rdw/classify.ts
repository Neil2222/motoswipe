import type { MotorcycleCategory } from '$lib/domain/enums';

/**
 * Guessing a category from a model name.
 *
 * RDW is a vehicle registry: it records displacement, mass and price to the
 * gram and the euro, but it has no idea whether a bike is a cruiser or a
 * supersport. Its `inrichting` field reads "Niet geregistreerd" for almost
 * every motorcycle.
 *
 * So the category comes from the model name, which for motorcycles is
 * unusually informative — manufacturers name their ranges by type and have done
 * for decades. "GS" is an adventure bike, "Ninja" is a sportbike, "Vespa" is a
 * scooter.
 *
 * This is an inference and it is wrong sometimes. Two things keep that
 * acceptable: a motorcycle matched to a Wikipedia row inherits that row's real
 * category instead (see `selectEnrichment` — the guess only fills an OTHER),
 * and anything unrecognised stays OTHER rather than being forced into a bucket.
 *
 * Order matters throughout: the first match wins, so specific names come before
 * the general patterns that would swallow them.
 */
const RULES: { pattern: RegExp; category: MotorcycleCategory }[] = [
	// --- Named ranges, most specific first --------------------------------
	{
		pattern:
			/\b(gs|gsa)\b|adventure|africa\s?twin|tenere|ténéré|v-?strom|dl\d{3}|tiger|multistrada|super\s?ten|transalp|varadero|caponord|stelvio|norden|rally/i,
		category: 'ADVENTURE'
	},
	{
		pattern:
			/ninja|yzf|gsx-?r|cbr|panigale|rsv4|zx-?\d|daytona|fireblade|superbike|rr\b|r1\b|r6\b|r7\b/i,
		category: 'SUPERSPORT'
	},
	{
		pattern: /tracer|fjr|pan\s?european|sport\s?touring|gt\b|rt\b|st\d{3,4}|concours|ninja\s?1000/i,
		category: 'SPORT_TOURING'
	},
	{
		pattern:
			/gold\s?wing|goldwing|road\s?glide|electra|ultra|voyager|k\s?1600|ltd\b|bagger|tourer/i,
		category: 'TOURING'
	},
	{
		pattern:
			/vespa|scooter|burgman|tmax|t-?max|xmax|x-?max|nmax|forza|sh\d{2,3}|primavera|liberty|zip\b|agility|kymco|sym\b|medley|beverly|downtown|silver\s?wing/i,
		category: 'SCOOTER'
	},
	{ pattern: /bobber|chopper|rocker|breakout|fat\s?bob/i, category: 'BOBBER' },
	{
		pattern:
			/sportster|softail|dyna|road\s?king|shadow|vulcan|rebel|intruder|marauder|vn\d|drag\s?star|virago|boulevard|vt\d{3}|c50|c90|chief|scout|diavel|vmax|v-?max|cruiser|thunderbird|stryker/i,
		category: 'CRUISER'
	},
	{ pattern: /supermoto|\bsm\b|smc|smr|husqvarna\s?7\d\d|motard|drz.*sm/i, category: 'SUPERMOTO' },
	{
		pattern:
			/enduro|\bexc\b|\bxc\b|crf|yz\d|kx\d|rm-?z|te\d{3}|fe\d{3}|dr-?z|klx|xr\d|wr\d|dual\s?sport|trail|beta\s?rr/i,
		category: 'DUAL_SPORT'
	},
	{ pattern: /scrambler|desert\s?sled/i, category: 'SCRAMBLER' },
	{ pattern: /caf[eé]\s?racer|thruxton|continental\s?gt/i, category: 'CAFE_RACER' },
	{
		pattern:
			/bonneville|w800|w650|xsr|z900rs|classic|nine\s?t|ninet|r\s?18|meteor|interceptor|himalayan|guzzi\s?v7|street\s?twin|speed\s?twin/i,
		category: 'CLASSIC'
	},
	{
		pattern:
			/super\s?duke|streetfighter|hyper\s?motard|hypermotard|brutale|mt-?10|s\s?1000\s?r|tuono|z\s?h2|speed\s?triple/i,
		category: 'HYPER_NAKED'
	},

	// --- General shapes ----------------------------------------------------
	{
		pattern:
			/\bmt-?\d|\bz\s?\d{3}|duke|monster|street\s?triple|trident|cb\d{3,4}r?\b|svartpilen|vitpilen|naked|hornet|fz\d|er-?6n|gsx-?s|s\s?1000|nk\b/i,
		category: 'NAKED'
	},
	{
		pattern: /\bsv\d|\bgsx\b|\bcb\b|\bxj\b|\bzr\b|\bgs\d|bandit|fazer|versys|nc\d{3}|cb\d{3}f/i,
		category: 'NAKED'
	},
	{ pattern: /sport|\brs\b|\brr\b|\br\s?\d{3}\b/i, category: 'SPORT' }
];

/**
 * Model names that are really a displacement class or a trim, and say nothing
 * about the kind of motorcycle. Matching on these produces confident nonsense.
 */
const UNINFORMATIVE =
	/^(\d{2,4}\s?(cc|ccm)?|[a-z]{1,2}\d{0,2}|abs|std|standard|special|custom|limited|edition|se|le)$/i;

export function classifyByName(make: string, model: string): MotorcycleCategory {
	const text = `${make} ${model}`.trim();
	if (!model.trim() || UNINFORMATIVE.test(model.trim())) return 'OTHER';

	for (const rule of RULES) {
		if (rule.pattern.test(text)) return rule.category;
	}
	return 'OTHER';
}

/**
 * The European vehicle category tells us what licence a machine needs, which
 * RDW does record reliably.
 *
 * L3e is a motorcycle; the subclasses split it by power. Anything that is not
 * L3 is not what this app is about, and the importer filters those out — but
 * the mapping is here because it is real, published information rather than a
 * guess.
 */
export function licenceFromEuCategory(
	euCategory: string | undefined,
	powerKw: number | undefined,
	displacementCc: number | undefined
): 'AM' | 'A1' | 'A2' | 'A' | undefined {
	if (!euCategory) return undefined;
	const code = euCategory.toUpperCase();

	if (code.startsWith('L1') || code.startsWith('L2')) return 'AM';
	if (!code.startsWith('L3')) return undefined;

	// Within L3, the licence follows power and displacement, and those RDW does
	// publish. The thresholds are the EU ones.
	if (displacementCc !== undefined && displacementCc <= 125 && (powerKw ?? 0) <= 11) return 'A1';
	if (powerKw !== undefined) {
		if (powerKw <= 11) return 'A1';
		if (powerKw <= 35) return 'A2';
		return 'A';
	}
	return undefined;
}

/**
 * RDW stores names in capitals: "NINJA 650", "R 1250 GS ADVENTURE". Shouting
 * every model name on a card looks broken, but naive title case ruins the
 * initialisms motorcycles are full of — GS, RS, ABS, ZX, MT.
 */
export function tidyName(raw: string): string {
	return raw
		.trim()
		.replace(/\s+/g, ' ')
		.split(' ')
		.map((word) => {
			// Anything with a digit, or short and all-caps, is a designation:
			// Z900, ZX-6R, GS, RS. Leave it exactly as it is.
			if (/\d/.test(word) || word.length <= 3) return word;
			// Hyphenated compounds get each part treated separately.
			return word
				.split('-')
				.map((part) =>
					part.length <= 3 ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
				)
				.join('-');
		})
		.join(' ');
}

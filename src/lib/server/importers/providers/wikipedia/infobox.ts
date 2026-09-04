/**
 * Wikitext infobox parsing.
 *
 * Pure functions, no network, no database — which is the point. Fetching from
 * Wikipedia is not worth testing; turning
 * `{{convert|795|mm|1|abbr=on}}` into `795` reliably very much is, because it is
 * where a data importer quietly produces nonsense.
 *
 * The governing rule is the same as everywhere else in MotoSwipe: **never
 * invent a value**. Every extractor returns `undefined` when it cannot parse
 * something honestly, and `undefined` means "leave the column alone".
 */

// ---------------------------------------------------------------------------
// Template extraction
// ---------------------------------------------------------------------------

export type InfoboxFields = Record<string, string>;

/**
 * Pulls the `{{Infobox motorcycle}}` template out of an article and splits it
 * into fields.
 *
 * Brace depth has to be tracked properly: field values routinely contain nested
 * templates (`{{convert}}`, `{{unbulleted list}}`), and a naive split on `|`
 * would tear those in half.
 */
export function parseInfobox(wikitext: string): InfoboxFields | null {
	const start = /\{\{\s*infobox[ _]motorcycle\b/i.exec(wikitext);
	if (!start) return null;

	let depth = 0;
	let end = -1;
	for (let i = start.index; i < wikitext.length - 1; i++) {
		const pair = wikitext.slice(i, i + 2);
		if (pair === '{{') {
			depth++;
			i++;
		} else if (pair === '}}') {
			depth--;
			i++;
			if (depth === 0) {
				end = i + 1;
				break;
			}
		}
	}
	if (end === -1) return null;

	// Drop the opening `{{Infobox motorcycle` and the closing `}}`.
	const body = wikitext.slice(start.index + start[0].length, end - 2);

	const fields: InfoboxFields = {};
	let braces = 0;
	let brackets = 0;
	let current = '';

	const commit = (chunk: string) => {
		const eq = chunk.indexOf('=');
		if (eq === -1) return;
		const key = chunk.slice(0, eq).trim().toLowerCase();
		const value = chunk.slice(eq + 1).trim();
		if (key && value) fields[key] = value;
	};

	for (let i = 0; i < body.length; i++) {
		const pair = body.slice(i, i + 2);
		if (pair === '{{' || pair === '[[') {
			if (pair === '{{') braces++;
			else brackets++;
			current += pair;
			i++;
			continue;
		}
		if (pair === '}}' || pair === ']]') {
			if (pair === '}}') braces = Math.max(0, braces - 1);
			else brackets = Math.max(0, brackets - 1);
			current += pair;
			i++;
			continue;
		}
		// A `|` at the top level starts the next field.
		if (body[i] === '|' && braces === 0 && brackets === 0) {
			commit(current);
			current = '';
			continue;
		}
		current += body[i];
	}
	commit(current);

	return fields;
}

// ---------------------------------------------------------------------------
// Markup cleaning
// ---------------------------------------------------------------------------

/**
 * Templates whose arguments are content and must be kept.
 *
 * Richer articles wrap multi-value fields in a list template:
 *
 *     | power = {{unbulleted list
 *       | {{convert|55|kW|hp PS|abbr=on|1}} @ 9,000 rpm
 *       | {{convert|38.8|kW|hp PS|abbr=on|1}} @ 8,000 rpm }}
 *
 * Deleting the wrapper along with its contents — which an earlier version did —
 * threw away the power and torque of exactly the popular modern motorcycles
 * whose articles are best maintained. The Yamaha MT-07 imported with no engine,
 * no power and no weight because of this.
 */
const LIST_TEMPLATES = /^(unbulleted list|ubl|plainlist|flatlist|hlist|bulleted list|ubli)$/i;

/** Templates where only the first argument is the value. */
const FIRST_ARG_TEMPLATES = /^(nowrap|val|nobold|small|nobr|no wrap)$/i;

/** Templates that are pure furniture and should vanish entirely. */
const DROP_TEMPLATES =
	/^(citation needed|cn|fact|clarify|dubious|efn|refn|sfn|r|nbsp|·|spaces|break|smallcaps)$/i;

/**
 * Renders one template (which contains no nested templates) as plain text.
 */
/**
 * A number as wikitext writes them: "948", "1,000", "689.6" and — the form that
 * cost the Honda P50 a seat height of 79 metres — ".79".
 */
const NUMERIC_VALUE = /^\.?\d[\d.,]*$/;

/**
 * A range: "790-800", "760–840", "34 to 36". Only the lower bound is taken.
 * For an adjustable seat that is the honest figure, and for anything else the
 * two ends are close enough that the lower one is never misleading.
 */
const RANGE_VALUE = /^(\.?\d[\d.,]*)\s*(?:[-–—]|to)\s*\.?\d[\d.,]*$/i;

function renderTemplate(body: string): string {
	// Split on top-level pipes; the caller guarantees no nested braces, but
	// wiki links can still contain pipes.
	const args: string[] = [];
	let current = '';
	let brackets = 0;
	for (let i = 0; i < body.length; i++) {
		const pair = body.slice(i, i + 2);
		if (pair === '[[') {
			brackets++;
			current += pair;
			i++;
			continue;
		}
		if (pair === ']]') {
			brackets = Math.max(0, brackets - 1);
			current += pair;
			i++;
			continue;
		}
		if (body[i] === '|' && brackets === 0) {
			args.push(current);
			current = '';
			continue;
		}
		current += body[i];
	}
	args.push(current);

	const name = (args.shift() ?? '').trim();
	// Named parameters (abbr=on, date=2024) are formatting, never content.
	const positional = args.map((a) => a.trim()).filter((a) => a && !/^[a-z_ -]+=/i.test(a));

	if (DROP_TEMPLATES.test(name)) return ' ';
	if (LIST_TEMPLATES.test(name)) return positional.join(' ; ');
	if (FIRST_ARG_TEMPLATES.test(name)) return positional[0] ?? ' ';

	if (/^convert$|^cvt$/i.test(name)) {
		// {{convert|948|cc|abbr=on}}                       -> "948 cc"
		// {{convert|689.6|–|655.6|cc|abbr=on}}             -> "689.6 cc"
		// {{convert|790-800|mm|in|1|abbr=on}}              -> "790 mm"
		// {{convert|.79|m|in|1|abbr=on}}                   -> ".79 m"
		//
		// The value is convert's first positional argument, always. Searching
		// the arguments for "the first thing that looks like a number" instead
		// read the *precision* argument of {{convert|790-800|mm|in|1}} as the
		// value and gave the Kawasaki W650 a seat height of 1 mm.
		//
		// The unit is not reliably the second argument either: range and
		// multi-value forms put separators and second figures in between.
		// Taking args[1] blindly read the unit of a 689.6–655.6 cc engine as
		// "–", and every such displacement came out null.
		const first = positional[0] ?? '';
		const range = RANGE_VALUE.exec(first);
		const value = range ? range[1] : NUMERIC_VALUE.test(first) ? first : undefined;
		const unit = positional.find((a) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(a));
		if (value && unit) return `${value} ${unit}`;
		return positional.join(' ');
	}

	// Anything else is structural: an infobox sub-template, a flag icon, a
	// citation. Keep nothing but a space so words do not run together.
	return ' ';
}

/**
 * Turns wiki markup into plain text, keeping the words a human would read.
 *
 * Templates are expanded innermost-first so that nesting — a `{{convert}}`
 * inside an `{{unbulleted list}}` — resolves correctly.
 */
export function stripMarkup(value: string): string {
	let text = value
		.replace(/<ref[^>]*\/>/gi, '')
		.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
		.replace(/<!--[\s\S]*?-->/g, '');

	// Repeatedly rewrite the innermost templates until none are left. Bounded so
	// that unbalanced markup cannot loop forever.
	const innermost = /\{\{([^{}]*)\}\}/;
	for (let pass = 0; pass < 12; pass++) {
		if (!innermost.test(text)) break;
		text = text.replace(new RegExp(innermost, 'g'), (_m, body: string) => renderTemplate(body));
	}

	return (
		text
			// [[Target|Label]] -> Label ; [[Target]] -> Target
			.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
			.replace(/\[\[([^\]]*)\]\]/g, '$1')
			.replace(/\[[^\s\]]+\s+([^\]]*)\]/g, '$1')
			.replace(/<br\s*\/?>/gi, ' ; ')
			.replace(/<[^>]+>/g, ' ')
			.replace(/'''?/g, '')
			.replace(/&nbsp;/g, ' ')
			.replace(/&[a-z]+;/gi, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

/** Conversions into the units MotoSwipe stores. */
const TO_MM: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
const TO_KG: Record<string, number> = { kg: 1, lb: 0.45359237, lbs: 0.45359237, st: 6.35029318 };
const TO_CC: Record<string, number> = {
	cc: 1,
	cm3: 1,
	ccm: 1,
	l: 1000,
	litre: 1000,
	liter: 1000,
	cuin: 16.387064,
	ci: 16.387064
};
const TO_L: Record<string, number> = {
	l: 1,
	litre: 1,
	liter: 1,
	usgal: 3.785411784,
	impgal: 4.54609,
	gal: 3.785411784
};
const TO_NM: Record<string, number> = { nm: 1, lbft: 1.3558179, ftlb: 1.3558179 };

/**
 * Alternative spellings for units conventionally written with a space.
 * `{{convert}}` emits "cuin"; a human types "cu in".
 */
const UNIT_VARIANTS: Record<string, string[]> = {
	cuin: ['cuin', 'cu in'],
	usgal: ['usgal', 'us gal'],
	impgal: ['impgal', 'imp gal']
};

/**
 * Finds the first measurement in a string and converts it into `table`'s unit.
 *
 * Handles both the `{{convert}}` template (already flattened by `stripMarkup`)
 * and plainly typed values like `948 cc`, `795mm`, `17 L`.
 *
 * Two things here are load-bearing, and both are mistakes this function made
 * before it made them correctly:
 *
 *  - Units are matched against the table explicitly, longest first, rather than
 *    captured as "the letters after the number". Capturing read
 *    `948 cc liquid-cooled` as a unit named "ccliquid", and every displacement
 *    in the import came out null.
 *  - The boundary check runs on text that still has its spaces. Collapsing them
 *    first turns "cc liquid" back into "ccliquid" and destroys the very
 *    boundary being checked.
 */
/**
 * A measurement's number.
 *
 * No leading minus: nothing measured here — displacement, mass, seat height,
 * torque — is ever negative, and allowing one turned the "850-870 mm" seat of a
 * BMW R 1250 GS into -870. A bare leading point is allowed, because
 * `{{convert|.79|m}}` is how Wikipedia writes the Honda P50's seat height and
 * dropping the point made it 79 metres.
 *
 * A comma is a thousands separator in "1,000 cc" and a decimal point in
 * "191,8 kg" — editors write both. Three digits after it means thousands, one
 * or two means a decimal; see `toNumber`. Before that distinction existed, the
 * BMW S1000RR weighed 8 kg, because "191" failed to find a unit and the parser
 * moved on to the "8".
 */
const NUMBER_SOURCE = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+,\d{1,2}(?!\d)|\d*\.\d+|\d+`;
const NUMBER_PATTERN = new RegExp(`(${NUMBER_SOURCE})`, 'g');
/** "790-800 mm" is one measurement, whose unit sits after the upper bound. */
const RANGE_TAIL_PATTERN = new RegExp(String.raw`^\s*[-–—]\s*(?:${NUMBER_SOURCE})`);

/**
 * Reads a wikitext number, deciding what its commas mean.
 *
 * "1,000" is a thousand; "191,8" is a hundred and ninety-one point eight. Three
 * digits after the comma is the only thing separating them, and both forms
 * appear in the same infoboxes.
 */
function toNumber(raw: string): number {
	const decimalComma = /^\d+,\d{1,2}$/.test(raw);
	return Number(decimalComma ? raw.replace(',', '.') : raw.replace(/,/g, ''));
}

function findMeasure(raw: string, table: Record<string, number>): number | undefined {
	const text = stripMarkup(raw);
	// Longest first, so "usgal" wins over "gal" and "cuin" over "ci".
	const units = Object.keys(table).sort((a, b) => b.length - a.length);

	for (const match of text.matchAll(NUMBER_PATTERN)) {
		const value = toNumber(match[1]);
		if (!Number.isFinite(value)) continue;

		let tailStart = match.index + match[1].length;
		// Skip past the upper bound of a range so the unit is still found, while
		// keeping the lower bound as the value.
		const range = RANGE_TAIL_PATTERN.exec(text.slice(tailStart, tailStart + 24));
		if (range) tailStart += range[0].length;

		// What follows the number: symbol punctuation removed (N·m -> nm), a
		// leading space allowed, but internal spaces preserved.
		const tail = text
			.slice(tailStart, tailStart + 14)
			.toLowerCase()
			.replace(/[·⋅.]/g, '')
			.replace(/^\s{1,2}/, '');

		for (const unit of units) {
			for (const spelling of UNIT_VARIANTS[unit] ?? [unit]) {
				if (!tail.startsWith(spelling)) continue;
				// The unit must end here, not run on into another word: "cc" is a
				// unit in "cc liquid", but "l" is not one in "litres".
				const next = tail.charAt(spelling.length);
				if (next === '' || !/[a-z]/.test(next)) return value * table[unit];
			}
		}
	}
	return undefined;
}

const round = (value: number | undefined, dp = 0): number | undefined =>
	value === undefined ? undefined : Number(value.toFixed(dp));

export const parseLengthMm = (raw?: string) =>
	raw === undefined ? undefined : round(findMeasure(raw, TO_MM));

/**
 * A parsed length, discarded unless it is a figure a motorcycle could actually
 * have.
 *
 * Wikitext measurements are typed by hand into a free-text field, so a
 * proportion of them are simply wrong or written in a form no parser will read
 * correctly. A seat height of 79,000 mm on a card is worse than no seat height
 * at all — the fit hints are built on these numbers, and the whole point of
 * that feature is that it is careful.
 */
const bounded = (value: number | undefined, min: number, max: number) =>
	value === undefined || value < min || value > max ? undefined : value;

/** Seat heights run from a child's minibike to the tallest adventure bike. */
export const parseSeatHeightMm = (raw?: string) => bounded(parseLengthMm(raw), 400, 1000);

/** A wheelbase shorter than a bicycle's or longer than a limousine's is wrong. */
export const parseWheelbaseMm = (raw?: string) => bounded(parseLengthMm(raw), 900, 2200);

/**
 * From a moped to a fully-dressed tourer. Anything outside it is a parsing
 * accident, not a motorcycle — the BMW S1000RR came through at 8 kg.
 */
export const parseMotorcycleMassKg = (raw?: string) => bounded(parseMassKg(raw), 20, 600);

export const parseMassKg = (raw?: string) =>
	raw === undefined ? undefined : round(findMeasure(raw, TO_KG), 1);

export const parseVolumeL = (raw?: string) =>
	raw === undefined ? undefined : round(findMeasure(raw, TO_L), 1);

export const parseTorqueNm = (raw?: string) =>
	raw === undefined ? undefined : round(findMeasure(raw, TO_NM), 1);

/**
 * Displacement, from the free-text `engine` field.
 *
 * Sizes appear as `948 cc`, `1,000 cc`, `0.9 L` or `61 cu in`. A bare number is
 * ignored: `4-stroke` and `16-valve` are not displacements.
 */
export function parseDisplacementCc(engine?: string): number | undefined {
	if (!engine) return undefined;
	const value = findMeasure(engine, TO_CC);
	if (value === undefined) return undefined;
	// Sanity bounds: below 20 cc it is a typo, above 3000 cc it is a car.
	if (value < 20 || value > 3500) return undefined;
	return round(value);
}

/**
 * Power, returned in both units.
 *
 * Infoboxes write `92.2 kW (125 hp) @ 9500 rpm`, `125 bhp`, or a `{{convert}}`.
 * Whichever unit is stated is kept as stated; the other is derived only when it
 * is absent, and the derivation is a documented approximation rather than a
 * measurement.
 */
const KW_PER_HP = 0.7457;

export function parsePower(raw?: string): { hp?: number; kw?: number } {
	if (!raw) return {};
	const text = stripMarkup(raw);

	const kwMatch = /(\d+(?:[.,]\d+)?)\s*kW\b/i.exec(text);
	const hpMatch = /(\d+(?:[.,]\d+)?)\s*(?:bhp|hp|PS|CV)\b/i.exec(text);

	const kw = kwMatch ? Number(kwMatch[1].replace(',', '.')) : undefined;
	const hp = hpMatch ? Number(hpMatch[1].replace(',', '.')) : undefined;

	const plausible = (n?: number) => (n !== undefined && n > 0 && n < 700 ? n : undefined);

	const kilowatts = plausible(kw);
	const horsepower = plausible(hp);

	return {
		hp: horsepower ?? (kilowatts !== undefined ? round(kilowatts / KW_PER_HP, 1) : undefined),
		kw: kilowatts ?? (horsepower !== undefined ? round(horsepower * KW_PER_HP, 1) : undefined)
	};
}

/** Cooling method, from the free-text engine description. */
export function parseCooling(engine?: string): string | undefined {
	if (!engine) return undefined;
	const text = stripMarkup(engine).toLowerCase();
	if (/\bair[\s-]?(?:and|\/|&)?[\s-]?oil[\s-]?cool/.test(text)) return 'Air/oil';
	if (/\boil[\s-]?cool/.test(text)) return 'Oil';
	if (/\bliquid[\s-]?cool|\bwater[\s-]?cool/.test(text)) return 'Liquid';
	if (/\bair[\s-]?cool/.test(text)) return 'Air';
	return undefined;
}

/**
 * Engine layout and cylinder count.
 *
 * Both come from the same phrase, so they are parsed together — a "parallel
 * twin" is two cylinders by definition, and deriving the count separately would
 * risk the two disagreeing.
 */
const LAYOUTS: { pattern: RegExp; label: string; cylinders?: number }[] = [
	{
		pattern: /\b(?:inline[- ]?four|straight[- ]?four|in-line four|i4)\b/i,
		label: 'Inline-4',
		cylinders: 4
	},
	{
		pattern: /\b(?:inline[- ]?three|straight[- ]?three|triple)\b/i,
		label: 'Inline-3',
		cylinders: 3
	},
	{ pattern: /\b(?:inline[- ]?six|straight[- ]?six)\b/i, label: 'Inline-6', cylinders: 6 },
	{
		pattern: /\b(?:parallel[- ]?twin|straight[- ]?twin|inline[- ]?twin)\b/i,
		label: 'Parallel-twin',
		cylinders: 2
	},
	{ pattern: /\b(?:flat[- ]?twin|boxer)\b/i, label: 'Boxer twin', cylinders: 2 },
	{ pattern: /\bflat[- ]?(?:four|4)\b/i, label: 'Flat-4', cylinders: 4 },
	{ pattern: /\b(?:v[- ]?four|v4)\b/i, label: 'V4', cylinders: 4 },
	{ pattern: /\b(?:v[- ]?twin|v2|l[- ]?twin)\b/i, label: 'V-twin', cylinders: 2 },
	{ pattern: /\bv[- ]?(?:six|6)\b/i, label: 'V6', cylinders: 6 },
	{
		pattern: /\b(?:single[- ]?cylinder|thumper|one[- ]?cylinder)\b/i,
		label: 'Single',
		cylinders: 1
	},
	{ pattern: /\b(?:rotary|wankel)\b/i, label: 'Rotary' },
	{ pattern: /\belectric\b/i, label: 'Electric motor', cylinders: undefined }
];

export function parseEngineLayout(engine?: string): {
	configuration?: string;
	cylinders?: number;
} {
	if (!engine) return {};
	const text = stripMarkup(engine);

	for (const layout of LAYOUTS) {
		if (layout.pattern.test(text)) {
			return { configuration: layout.label, cylinders: layout.cylinders };
		}
	}

	// Fall back to an explicit cylinder count, e.g. "four-cylinder".
	const words: Record<string, number> = { single: 1, twin: 2, two: 2, three: 3, four: 4, six: 6 };
	const match = /\b(single|twin|two|three|four|six)[- ]cylinder\b/i.exec(text);
	if (match) return { cylinders: words[match[1].toLowerCase()] };

	const numeric = /\b(\d)[- ]cylinder\b/i.exec(text);
	if (numeric) return { cylinders: Number(numeric[1]) };

	return {};
}

/** Gearbox description and gear count, from the `transmission` field. */
export function parseTransmission(raw?: string): {
	transmission?: string;
	gears?: number;
} {
	if (!raw) return {};
	const text = stripMarkup(raw);
	if (!text) return {};

	const gearMatch = /\b(\d{1,2})[- ]speed\b/i.exec(text);
	const gears = gearMatch ? Number(gearMatch[1]) : undefined;

	// The final drive is the part a rider actually cares about.
	let drive: string | undefined;
	if (/\bshaft\b/i.test(text)) drive = 'Shaft';
	else if (/\bbelt\b/i.test(text)) drive = 'Belt';
	else if (/\bchain\b/i.test(text)) drive = 'Chain';

	if (/\b(cvt|continuously variable|twist[- ]?and[- ]?go)\b/i.test(text)) {
		return { transmission: 'CVT (automatic)', gears: undefined };
	}

	const parts = [gears ? `${gears}-speed` : undefined, drive].filter(Boolean);
	return {
		transmission: parts.length ? parts.join(', ') : text.slice(0, 80),
		gears: gears !== undefined && gears >= 1 && gears <= 12 ? gears : undefined
	};
}

/**
 * The model year, from the `production` field.
 *
 * "2017–present", "1969-1975", "2003" — the *first* year is taken, meaning the
 * year the model was introduced. Anything outside 1885 (the Daimler
 * Reitwagen) to next year is rejected as a misparse.
 */
/**
 * The years a model was in production, as a range.
 *
 * This is what tells a 1976 Kawasaki Z650 apart from a 2017 one. Wikipedia
 * writes the field as "1976–1983", "2017–present", "2020-" or a bare year, and
 * an open end genuinely means "still being made", not "unknown".
 */
export function parseProductionYears(raw?: string): { from?: number; to?: number } {
	if (!raw) return {};
	const text = stripMarkup(raw);
	const limit = new Date().getFullYear() + 1;

	const years = [...text.matchAll(/\b(1[89]\d{2}|20\d{2})\b/g)]
		.map((m) => Number(m[1]))
		.filter((y) => y >= 1885 && y <= limit);

	if (!years.length) return {};

	const from = years[0];
	// "2017-present", "2020–" and "2015 to date" are all open-ended.
	const openEnded = /present|current|date|onward|heden|[-\u2013\u2014]\s*$/i.test(text.trim());
	if (openEnded) return { from };

	const to = years.length > 1 ? Math.max(...years) : undefined;
	return to !== undefined && to >= from ? { from, to } : { from };
}

export function parseProductionYear(raw?: string): number | undefined {
	if (!raw) return undefined;
	const text = stripMarkup(raw);
	const match = /\b(1[89]\d{2}|20\d{2})\b/.exec(text);
	if (!match) return undefined;
	const year = Number(match[1]);
	const limit = new Date().getFullYear() + 1;
	return year >= 1885 && year <= limit ? year : undefined;
}

/** True when production has ended, so the bike is a used-market proposition. */
export function parseStillProduced(raw?: string): boolean | undefined {
	if (!raw) return undefined;
	const text = stripMarkup(raw).toLowerCase();
	if (/present|current|ongoing|–\s*$|-\s*$/.test(text)) return true;
	// Two years with a separator between them reads as a closed range.
	if (/\b(1[89]\d{2}|20\d{2})\s*[–—-]\s*(1[89]\d{2}|20\d{2})\b/.test(text)) return false;
	return undefined;
}

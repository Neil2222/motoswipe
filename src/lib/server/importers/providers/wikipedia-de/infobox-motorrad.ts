import type { MotorcycleCategory } from '$lib/domain/enums';
import { stripMarkup } from '../wikipedia/infobox';

/**
 * German Wikipedia's `Infobox Motorrad`, read the way its editors write it.
 *
 * The template states figures in German conventions: seat height in
 * centimetres ("79,5"), power as "kW / PS" ("92,2 / 125 bei 9500/min"), torque
 * in Nm with the revs after ("98,6 bei 7700/min"), and a decimal comma
 * throughout. Where an article covers several years it lists several values
 * ("79,5, ab 2020 82"); the first is the launch figure and is the one taken,
 * with the caveat recorded through the provider's confidence.
 */

export interface InfoboxMotorrad {
	image?: string;
	imageCaption?: string;
	bauart?: string;
	productionFrom?: number;
	productionTo?: number;
	displacementCc?: number;
	cylinders?: number;
	cooling?: string;
	powerKw?: number;
	powerHp?: number;
	torqueNm?: number;
	gears?: number;
	wetWeightKg?: number;
	dryWeightKg?: number;
	seatHeightMm?: number;
	wheelbaseMm?: number;
	fuelCapacityL?: number;
}

/** The infobox's parameters, raw. */
export function infoboxParameters(wikitext: string): Map<string, string> | null {
	const start = wikitext.search(/\{\{\s*Infobox Motorrad/i);
	if (start === -1) return null;

	// Walk to the matching closing braces, since values nest templates.
	let depth = 0;
	let end = -1;
	for (let i = start; i < wikitext.length - 1; i++) {
		if (wikitext.startsWith('{{', i)) {
			depth++;
			i++;
		} else if (wikitext.startsWith('}}', i)) {
			depth--;
			i++;
			if (depth === 0) {
				end = i + 1;
				break;
			}
		}
	}
	if (end === -1) return null;

	const body = wikitext.slice(start + 2, end - 2);
	const params = new Map<string, string>();
	// Split on top-level pipes only.
	let current = '';
	depth = 0;
	const parts: string[] = [];
	for (let i = 0; i < body.length; i++) {
		const two = body.slice(i, i + 2);
		if (two === '{{' || two === '[[') depth++;
		if (two === '}}' || two === ']]') depth--;
		if (body[i] === '|' && depth === 0) {
			parts.push(current);
			current = '';
		} else {
			current += body[i];
		}
	}
	parts.push(current);

	for (const part of parts.slice(1)) {
		const eq = part.indexOf('=');
		if (eq === -1) continue;
		const key = part.slice(0, eq).trim();
		const value = part.slice(eq + 1).trim();
		if (key) params.set(key, value);
	}
	return params;
}

/** The first number in a German-formatted value: "79,5, ab 2020 82" → 79.5. */
export function firstNumber(raw: string | undefined): number | undefined {
	if (!raw) return undefined;
	const text = stripMarkup(raw).replace(/−/g, '-');
	// Thousands-grouped first ("2.065"), then a decimal comma ("79,5"), then a
	// plain number — in that order, or "2017" reads as 201 with a stray digit.
	const match = /-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?|-?\d+(?:\.\d+)?/.exec(text);
	if (!match) return undefined;
	const value = Number(match[0].replace(/\./g, '').replace(',', '.'));
	return Number.isFinite(value) ? value : undefined;
}

const bounded = (value: number | undefined, min: number, max: number) =>
	value !== undefined && value >= min && value <= max ? value : undefined;

/** Seat height: centimetres in the template, occasionally millimetres. */
export function parseSitzhoehe(raw: string | undefined): number | undefined {
	const n = firstNumber(raw);
	if (n === undefined) return undefined;
	const mm = n < 200 ? Math.round(n * 10) : Math.round(n);
	return bounded(mm, 500, 1000);
}

/**
 * `Leistung`, in the forms editors actually write it:
 *
 *   "92,2 / 125 bei 9500/min"          kW / PS
 *   "80 PS (59 kW) bei 6550/min"       PS first, kW in brackets
 *   "158,5 kW (215,5 PS) bei 13.000/min"
 *   "33 / 45 bei 10.000/min, A2: 26 / 35"
 *
 * A number next to a unit is read as that unit; where the article lists a
 * restricted version too, the model's own output is the highest, for the same
 * reason the registry's is. Only with no unit at all does the kW / PS order
 * of the template apply.
 */
export function parseLeistung(raw: string | undefined): { kw?: number; hp?: number } {
	if (!raw) return {};
	const text = stripMarkup(raw).replace(/\u00a0/g, ' ');
	const de = (v: string) => Number(v.replace(/\./g, '').replace(',', '.'));

	const kws = [...text.matchAll(/(\d{1,3}(?:,\d+)?)\s*kW/gi)].map((m) => de(m[1]));
	const pss = [...text.matchAll(/(\d{1,3}(?:,\d+)?)\s*PS\b/gi)].map((m) => de(m[1]));
	if (kws.length || pss.length) {
		const kw = kws.length ? bounded(Math.max(...kws), 1, 250) : undefined;
		const hp = pss.length ? bounded(Math.max(...pss), 1, 340) : undefined;
		return { kw, hp };
	}

	// "kW / PS", possibly repeated for a restricted version.
	const pairs = [...text.matchAll(/(\d{1,3}(?:,\d+)?)\s*\/\s*(\d{1,3}(?:,\d+)?)/g)].map((m) => ({
		kw: de(m[1]),
		hp: de(m[2])
	}));
	if (pairs.length) {
		const best = pairs.reduce((a, b) => (b.kw > a.kw ? b : a));
		return { kw: bounded(best.kw, 1, 250), hp: bounded(best.hp, 1, 340) };
	}

	// A lone number is kW by the template's convention.
	const lone = /(\d{1,3}(?:,\d+)?)/.exec(text);
	return lone ? { kw: bounded(de(lone[1]), 1, 250) } : {};
}

export function parseInfoboxMotorrad(wikitext: string): InfoboxMotorrad | null {
	const p = infoboxParameters(wikitext);
	if (!p) return null;
	const get = (...keys: string[]) => {
		for (const key of keys) {
			const value = p.get(key);
			if (value && value.trim()) return value;
		}
		return undefined;
	};

	const power = parseLeistung(get('Leistung'));
	// An article that covers several machines of one name says which one its
	// figures describe: "Technische Daten: Modell 1973–1979" on the Kawasaki
	// Z 400. That span, not the whole production run, is what the numbers
	// belong to.
	const caption = stripMarkup(get('Bildtext', 'Bildbeschreibung') ?? '');
	const stated =
		/Technische Daten:?\s*(?:Modell\s*)?((?:18|19|20)\d{2})\s*(?:[–-]|bis)\s*((?:18|19|20)\d{2})/i.exec(
			caption
		);
	const from = stated
		? Number(stated[1])
		: firstNumber(get('Produktion von', 'Produktionszeitraum', 'Bauzeit'));
	const to = stated ? Number(stated[2]) : firstNumber(get('Produktion bis'));
	const kw = power.kw;
	const hp = power.hp ?? (kw !== undefined ? Math.round((kw / 0.7457) * 10) / 10 : undefined);

	return {
		image: get('Bild'),
		imageCaption: get('Bildtext', 'Bildbeschreibung'),
		bauart: get('Bauart', 'Klasse'),
		productionFrom: bounded(from, 1885, 2100),
		productionTo: bounded(to, 1885, 2100),
		displacementCc: bounded(firstNumber(get('Hubraum')), 20, 3500),
		cylinders: bounded(firstNumber(get('Zylinder', 'Zylinderzahl')), 1, 8),
		cooling: get('Kühlung') ? stripMarkup(get('Kühlung')!) : undefined,
		powerKw: kw,
		powerHp: hp,
		torqueNm: bounded(firstNumber(get('Drehmoment')), 5, 300),
		gears: bounded(firstNumber(get('Gänge', 'Getriebe')), 1, 8),
		wetWeightKg: bounded(firstNumber(get('Gewicht fahrbereit', 'Leergewicht fahrbereit')), 40, 600),
		dryWeightKg: bounded(firstNumber(get('Trockengewicht', 'Leergewicht')), 40, 600),
		seatHeightMm: parseSitzhoehe(get('Sitzhöhe')),
		wheelbaseMm: bounded(
			(() => {
				const n = firstNumber(get('Radstand'));
				return n === undefined ? undefined : n < 400 ? n * 10 : n;
			})(),
			900,
			2200
		),
		fuelCapacityL: bounded(firstNumber(get('Tankvolumen', 'Tankinhalt')), 2, 60)
	};
}

/**
 * `Bauart` — the editors' own class — onto the catalogue's categories.
 *
 * German Wikipedia's vocabulary is small and consistent, which is why it can
 * be mapped without guessing. Anything not listed stays OTHER.
 */
export function mapBauart(raw: string | undefined): {
	category: MotorcycleCategory;
	categoryRaw: string | null;
} {
	if (!raw) return { category: 'OTHER', categoryRaw: null };
	const text = stripMarkup(raw).toLowerCase();
	const categoryRaw = stripMarkup(raw).slice(0, 80);
	const pick = (category: MotorcycleCategory) => ({ category, categoryRaw });

	if (/supersport|superbike|rennmaschine|sportmotorrad/.test(text)) return pick('SUPERSPORT');
	if (/naked ?bike|streetfighter|roadster/.test(text)) return pick('NAKED');
	if (/reiseenduro|adventure/.test(text)) return pick('ADVENTURE');
	if (/enduro|geländemotorrad|crossmotorrad|motocross/.test(text)) return pick('DUAL_SPORT');
	if (/supermoto/.test(text)) return pick('SUPERMOTO');
	if (/sporttourer|sport-tourer|crossover/.test(text)) return pick('SPORT_TOURING');
	if (/tourer|tourenmotorrad|reisemotorrad/.test(text)) return pick('TOURING');
	if (/chopper|cruiser|custom/.test(text)) return pick('CRUISER');
	if (/bobber/.test(text)) return pick('BOBBER');
	if (/café ?racer|cafe ?racer/.test(text)) return pick('CAFE_RACER');
	if (/scrambler/.test(text)) return pick('SCRAMBLER');
	if (/motorroller|roller|scooter/.test(text)) return pick('SCOOTER');
	if (/retro|classic|klassiker|modern classic/.test(text)) return pick('CLASSIC');
	if (/allrounder|standard/.test(text)) return pick('NAKED');
	if (/sportler|sport/.test(text)) return pick('SPORT');
	return { category: 'OTHER', categoryRaw };
}

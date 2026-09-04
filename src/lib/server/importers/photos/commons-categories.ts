import { normalizeBrand, normalizeModel, stripBrandPrefix } from '../match';
import {
	foldAccents,
	namesADifferentMotorcycle,
	normalizeTitle,
	yearInTitle
} from './commons-match';

/**
 * Photographs from Wikimedia Commons category trees.
 *
 * Full-text search finds a fraction of what Commons holds: the Kawasaki Z900
 * category has seventeen files and search surfaced five. Walking the category
 * finds the rest, and category files come with things a search result does
 * not — a caption, a photograph date, and sometimes a year-named subcategory.
 *
 * Every piece of that is evidence with a definite reach, and this module is
 * careful to claim no more than each supports:
 *
 *  - a **year in the file name or caption** ("2021 Black Yamaha MT-07") proves
 *    the model year;
 *  - a **year-named subcategory** proves the same for everything in it;
 *  - a **photograph date** proves only that the machine already existed. A Z900
 *    photographed in 2018 cannot be the 2020 restyle, so where exactly one
 *    generation had started by then, the date proves that generation. A
 *    photograph from 2023 could be any of three, and proves nothing;
 *  - **membership of the family's category** proves the family — and only when
 *    the file's own name or caption names the model too. Commons categories
 *    collect self-portraits and stands at shows; a category is an index, not a
 *    caption.
 *
 * Pure. The Commons API calls live in the script that uses this.
 */

export interface CategoryFile {
	title: string;
	url: string;
	sourceUrl: string | null;
	width: number | null;
	height: number | null;
	description: string;
	/** ISO date the photograph was taken, when Commons knows it. */
	takenOn: string | null;
	extmetadata?: Record<string, { value?: string }>;
	/** The subcategory it was found in, if not the family category itself. */
	subcategory?: string;
}

export interface GenerationSpanLike {
	id: string;
	from: number | null;
	to: number | null;
}

export type Placement =
	| { scope: 'MODEL_YEAR'; generationId: string; year: number; evidence: string }
	| { scope: 'GENERATION'; generationId: string; evidence: string }
	| { scope: 'FAMILY'; evidence: string };

/** Detail and crowd shots that are not a picture of the motorcycle. */
const NOT_THE_BIKE =
	/\b(engine|motor|exhaust|dashboard|instrument|cockpit|speedometer|tank|seat|wheel|brake|headlight|tail ?light|logo|badge|emblem|detail|close-?up|interior|self ?portrait|selfie|crash|accident|wreck)\b/i;

/**
 * Picks the Commons category that is the family's own.
 *
 * Search returns look-alikes — "Kawasaki Z900RS" for "Kawasaki Z900", a
 * generation code in brackets for a Triumph — and the family category is the
 * one whose name, stripped of spacing and punctuation, is exactly the brand
 * and model.
 */
export function chooseFamilyCategory(
	candidates: readonly string[],
	context: { manufacturerName: string; model: string }
): string | undefined {
	const wanted = key(context.manufacturerName, context.model);
	const exact = candidates.find((title) => key('', title.replace(/^Category:/i, '')) === wanted);
	if (exact) return exact;
	// "Category:Honda NC750X (RC90)": a code in brackets is still the family.
	return candidates.find(
		(title) => key('', title.replace(/^Category:/i, '').replace(/\s*\([^)]*\)\s*$/, '')) === wanted
	);
}

/**
 * Whether a subcategory belongs to the family rather than to a relative.
 *
 * "Kawasaki Z900 (2020)" and "Kawasaki Z900 by year" are the family's own;
 * "Kawasaki Z900RS" is a different motorcycle that happens to be filed
 * underneath, and any subcategory that names a catalogue sibling is skipped.
 */
export function isFamilySubcategory(
	title: string,
	context: { manufacturerName: string; model: string; siblingModels: readonly string[] }
): boolean {
	const name = title.replace(/^Category:/i, '');
	const wanted = key(context.manufacturerName, context.model);
	const k = key('', name);
	if (!k.startsWith(wanted)) return false;
	if (k === wanted) return true;
	// A longer sibling that explains the name better: Z900RS under Z900.
	for (const sibling of context.siblingModels) {
		const other = key(
			context.manufacturerName,
			stripBrandPrefix(context.manufacturerName, sibling)
		);
		if (other.length > wanted.length && k.startsWith(other)) return false;
	}
	// What follows the family name must read as a qualifier, not a model:
	// a year, or a bracketed code.
	const rest = name.slice(name.toLowerCase().indexOf(context.model.toLowerCase().slice(0, 3)));
	return /\(\s*(19|20)\d{2}\s*\)|\b(19|20)\d{2}\b|\([A-Z0-9-]{2,}\)|by year|by model year/i.test(
		rest
	);
}

/** The model year a year-named subcategory states. */
export function subcategoryYear(title: string, now = new Date().getFullYear()): number | undefined {
	const match = /\b((?:19|20)\d{2})\b/.exec(title.replace(/^Category:/i, ''));
	const year = match ? Number(match[1]) : undefined;
	return year !== undefined && year <= now + 1 ? year : undefined;
}

/**
 * Whether a category file is a usable photograph of this family.
 *
 * Strict on purpose. The file must be a photograph, of a plausible size and
 * shape, must not be a detail or a person, must name the model in its own
 * title or caption, and must not name a different machine.
 */
export function isFamilyPhoto(
	file: CategoryFile,
	context: {
		manufacturerName: string;
		model: string;
		siblingModels: readonly string[];
		otherBrands?: readonly string[];
	}
): boolean {
	if (!/\.(jpe?g|png|webp)$/i.test(file.title)) return false;
	if (file.width && file.height) {
		if (file.width < 640 || file.height < 400) return false;
		const aspect = file.width / file.height;
		if (aspect > 3 || aspect < 0.5) return false;
	}

	const caption = plain(file.description);
	const readable = `${file.title.replace(/^File:/i, '')} ${caption}`;
	if (NOT_THE_BIKE.test(readable)) return false;

	// The file itself has to say what it shows. The brand may be shortened
	// to its first word — "Harley Sport Glide" — inside the family's own
	// category, where no other maker's Sport Glide can be filed.
	const brand = normalizeBrand(context.manufacturerName);
	const brandWord = normalizeBrand(context.manufacturerName.split(/[\s-]+/)[0] ?? '');
	const model = normalizeModel(foldAccents(context.model));
	const named =
		normalizeTitle(file.title) +
		' ' +
		foldAccents(caption)
			.toLowerCase()
			.replace(/[^a-z0-9]/g, '');
	if (!named.includes(model)) return false;
	const brandNamed = named.includes(brand) || (brandWord.length >= 5 && named.includes(brandWord));
	if (!brandNamed && !file.subcategory) return false;

	if (namesADifferentMotorcycle(file.title, context)) return false;
	if (caption && namesADifferentMotorcycle(`File:${caption}.jpg`, context)) return false;

	return true;
}

/**
 * The narrowest scope the evidence supports, and which generation gets it.
 */
export function placeFile(
	file: CategoryFile,
	context: { manufacturerName: string; model: string },
	generations: readonly GenerationSpanLike[],
	now = new Date().getFullYear()
): Placement {
	// Every file here sits in the family's own category, so a title that
	// leaves the brand out still names this family's machine.
	const implied = { brandImplied: true };
	const stated =
		yearInTitle(file.title, context, now, implied) ??
		yearInTitle(`File:${plain(file.description).slice(0, 200)}.jpg`, context, now, implied) ??
		(file.subcategory ? subcategoryYear(file.subcategory, now) : undefined);

	const divided = generations.length > 1;

	if (stated !== undefined) {
		const own = generations.find(
			(g) => g.from !== null && g.to !== null && stated >= g.from && stated <= g.to
		);
		if (own) {
			const where = file.subcategory
				? `filed under "${file.subcategory.replace(/^Category:/i, '')}"`
				: 'file name or caption states the year';
			return { scope: 'MODEL_YEAR', generationId: own.id, year: stated, evidence: where };
		}
		if (!divided && generations[0]) {
			return {
				scope: 'MODEL_YEAR',
				generationId: generations[0].id,
				year: stated,
				evidence: 'file name or caption states the year'
			};
		}
	}

	// A photograph date rules out every generation that did not yet exist —
	// allowing a year, since next year's model stands at the autumn shows.
	const taken = file.takenOn ? Number(file.takenOn.slice(0, 4)) : undefined;
	if (divided && taken && taken >= 1990) {
		const possible = generations.filter((g) => g.from !== null && g.from <= taken + 1);
		const later = generations.filter((g) => g.from !== null && g.from > taken + 1);
		if (possible.length === 1 && later.length) {
			return {
				scope: 'GENERATION',
				generationId: possible[0].id,
				evidence: `photographed ${file.takenOn!.slice(0, 7)}, before the ${later[0].from} redesign`
			};
		}
	}

	if (!divided && generations[0]) {
		return {
			scope: 'GENERATION',
			generationId: generations[0].id,
			evidence: `in Commons category of the ${context.model}; family has one generation`
		};
	}
	return { scope: 'FAMILY', evidence: `in Commons category of the ${context.model}` };
}

function key(manufacturer: string, model: string): string {
	return (normalizeBrand(manufacturer) + normalizeModel(model)).replace(/[^a-z0-9]/g, '');
}

function plain(html: string): string {
	return html
		.replace(/<[^>]+>/g, ' ')
		.replace(/&[a-z]+;/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

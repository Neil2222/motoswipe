import { prisma } from '../db/client';
import { namesADifferentMotorcycle } from '../importers/photos/commons-match';
import { baselineEligibility, type Evidence, type ImageStatus } from './evidence';
import { identify } from './identity';

/**
 * Re-judges a generation's photograph and eligibility from what is in the
 * database now.
 *
 * The rebuild computes evidence for every row, but photographs arrive between
 * rebuilds — the Commons job adds them one family at a time — and a card's
 * eligibility must follow immediately, not at the next five-minute rebuild.
 * This is the small, database-aware piece both jobs share: read the row's
 * stored evidence and its primary image, decide the image status, store the
 * verdict.
 */

/**
 * Suffixes that, glued straight onto a model name in a file name, name a
 * different motorcycle rather than a trim of this one. "Z900RS" is not a Z900;
 * "Z900 SE" is. A sibling in the catalogue is caught by name; this catches the
 * ones the catalogue does not know.
 */
const OTHER_MODEL_SUFFIX = /^(rs|rr|sx|x|xt|r|tracer|rally|adventure|scrambler|cafe|caferacer)$/;

/**
 * Whether a file name suggests the photograph is of a different machine that
 * merely shares this one's name.
 */
export function looksLikeAnotherModel(
	title: string,
	context: {
		manufacturerName: string;
		model: string;
		otherBrands?: readonly string[];
		siblingModels?: readonly string[];
	}
): boolean {
	if (namesADifferentMotorcycle(title, context)) return true;

	const normalized = title
		.replace(/^File:/i, '')
		.replace(/\.[a-z0-9]+$/i, '')
		.toLowerCase();
	const model = context.model.toLowerCase().replace(/[^a-z0-9]/g, '');
	if (!model) return false;

	// The model name followed, without a space, by letters that make it another
	// model: "z900rs" in "kawasaki z900rs front.jpg".
	const glued = new RegExp(`${escape(model)}([a-z]{1,10})(?![a-z0-9])`, 'g');
	for (const match of normalized.replace(/[^a-z0-9]/g, ' ').matchAll(glued)) {
		if (!OTHER_MODEL_SUFFIX.test(match[1])) continue;
		// "Thruxton R" is curated as a trim of the Thruxton; "Z900RS" is not a
		// trim of anything. The identity rules already know which is which.
		const asWritten = identify({
			manufacturerName: context.manufacturerName,
			model: `${context.model}${match[1].toUpperCase()}`
		});
		const ours = identify({ manufacturerName: context.manufacturerName, model: context.model });
		if (asWritten && ours && asWritten.canonicalModel === ours.canonicalModel) continue;
		return true;
	}
	return false;
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface ImageVerdict {
	status: ImageStatus;
	eligible: boolean;
	reasons: string[];
}

/**
 * Judges the primary photograph of each row and stores the result.
 *
 * `divided` — whether the family has several generations — decides whether a
 * family-scope photograph is good enough. `evidence` is what the rebuild
 * stored; only its image status and the eligibility that follows are changed.
 */
export async function reassessImages(
	motorcycleIds: readonly string[],
	vetting: (motorcycleId: string) => {
		manufacturerName: string;
		model: string;
		otherBrands?: readonly string[];
		siblingModels?: readonly string[];
	}
): Promise<Map<string, ImageVerdict>> {
	const verdicts = new Map<string, ImageVerdict>();
	if (!motorcycleIds.length) return verdicts;

	const rows = await prisma.motorcycle.findMany({
		where: { id: { in: [...motorcycleIds] } },
		select: {
			id: true,
			evidence: true,
			familyId: true,
			images: {
				orderBy: [{ sortOrder: 'asc' }],
				select: {
					id: true,
					scope: true,
					attribution: true,
					url: true,
					isPrimary: true,
					license: true
				}
			}
		}
	});

	// Whether each family has more than one active generation.
	const familyIds = [...new Set(rows.map((r) => r.familyId).filter((f): f is string => !!f))];
	const generationCounts = new Map<string, number>();
	if (familyIds.length) {
		for (const group of await prisma.motorcycle.groupBy({
			by: ['familyId'],
			where: { familyId: { in: familyIds }, isActive: true },
			_count: true
		})) {
			if (group.familyId) generationCounts.set(group.familyId, group._count);
		}
	}

	// The narrowest evidence leads: a photograph known to be of this model year
	// outranks one known to be of the family, whatever order they arrived in.
	const rank = (scope: string) => (scope === 'MODEL_YEAR' ? 0 : scope === 'GENERATION' ? 1 : 2);

	for (const row of rows) {
		const evidence = (row.evidence ?? {}) as Partial<Evidence>;
		const divided = (row.familyId ? (generationCounts.get(row.familyId) ?? 1) : 1) > 1;

		const primary = [...row.images].sort((a, b) => rank(a.scope) - rank(b.scope))[0];
		if (primary && !primary.isPrimary) {
			await prisma.motorcycleImage.updateMany({
				where: { motorcycleId: row.id },
				data: { isPrimary: false }
			});
			await prisma.motorcycleImage.update({
				where: { id: primary.id },
				data: { isPrimary: true }
			});
		}

		let status: ImageStatus = 'NONE';
		if (primary) {
			if (
				primary.license !== 'manufacturer' &&
				looksLikeAnotherModel(primary.attribution ?? primary.url, vetting(row.id))
			) {
				status = 'SUSPICIOUS';
			} else if (primary.scope === 'MODEL_YEAR') status = 'MODEL_YEAR';
			else if (primary.scope === 'GENERATION') status = 'GENERATION';
			else status = divided ? 'FAMILY_ONLY' : 'GENERATION';
		}

		const judged: Evidence = {
			fields: evidence.fields ?? ({} as Evidence['fields']),
			image: status,
			availability: evidence.availability ?? 'UNKNOWN',
			market: evidence.market ?? 'UNKNOWN',
			priceCurrency: evidence.priceCurrency ?? 'NONE'
		};
		const { eligible, reasons } = baselineEligibility(judged);

		await prisma.motorcycle.update({
			where: { id: row.id },
			data: {
				evidence: judged as never,
				imageStatus: status,
				discoveryEligible: eligible,
				ineligibleReasons: reasons
			}
		});
		verdicts.set(row.id, { status, eligible, reasons });
	}

	return verdicts;
}

import { prisma } from '../db/client';
import { EVIDENCE_FIELDS, type Evidence, type EvidenceField } from './evidence';

/**
 * The state of the catalogue, in the numbers the audits use.
 *
 * Same definitions as `scripts/audit-modern.ts`: a "modern" generation is one
 * still on sale in or after `since`; registrations weight every percentage,
 * because a card nobody in the Netherlands could buy matters less than a
 * Z900. Read-only, and cheap enough for an admin page: one query over the
 * modern generations with their evidence and image scopes.
 */

export interface StatusRow {
	label: string;
	cards: number;
	registrations: number;
}

export interface FieldRow {
	field: EvidenceField;
	present: number;
	verified: number;
	high: number;
	inferred: number;
	unknown: number;
	conflicting: number;
}

export interface CatalogueHealth {
	since: number;
	generatedAt: string;
	generations: number;
	registrations: number;
	/** Primary image status per card, MODEL_YEAR first. */
	images: StatusRow[];
	/** Cards whose primary image is proven for the model year or generation. */
	trustedImage: StatusRow;
	/** How many proven photographs a card carries for the swipe deck. */
	photosPerCard: { none: number; one: number; two: number; threePlus: number };
	/** Where the primary images come from. */
	imageSources: { source: string; cards: number }[];
	fields: FieldRow[];
	eligible: StatusRow;
	ineligible: StatusRow[];
	/** Of the 100 most registered modern generations, how many are in discovery. */
	top100Eligible: number;
	availability: { status: string; cards: number }[];
	price: { current: number; historical: number; none: number };
}

export async function catalogueHealth(since = 2020): Promise<CatalogueHealth> {
	const modern = await prisma.motorcycle.findMany({
		where: {
			isActive: true,
			OR: [
				{ generationTo: { gte: since } },
				{ AND: [{ generationTo: null }, { lastRegistrationYear: { gte: since } }] }
			]
		},
		select: {
			registrationCount: true,
			imageStatus: true,
			discoveryEligible: true,
			ineligibleReasons: true,
			evidence: true,
			availability: true,
			images: {
				where: { OR: [{ isPrimary: true }, { scope: { in: ['MODEL_YEAR', 'GENERATION'] } }] },
				select: { isPrimary: true, source: true }
			}
		},
		orderBy: { registrationCount: { sort: 'desc', nulls: 'last' } }
	});

	type Row = (typeof modern)[number];
	const regs = (rows: Row[]) => rows.reduce((s, m) => s + (m.registrationCount ?? 0), 0);
	const status = (label: string, rows: Row[]): StatusRow => ({
		label,
		cards: rows.length,
		registrations: regs(rows)
	});

	const imageStatuses = ['MODEL_YEAR', 'GENERATION', 'FAMILY_ONLY', 'SUSPICIOUS', 'NONE'];
	const images = imageStatuses.map((s) =>
		status(
			s,
			modern.filter((m) => m.imageStatus === s)
		)
	);
	const trusted = modern.filter(
		(m) => m.imageStatus === 'MODEL_YEAR' || m.imageStatus === 'GENERATION'
	);

	const photosPerCard = { none: 0, one: 0, two: 0, threePlus: 0 };
	for (const m of modern) {
		const n = m.images.length;
		if (n === 0) photosPerCard.none++;
		else if (n === 1) photosPerCard.one++;
		else if (n === 2) photosPerCard.two++;
		else photosPerCard.threePlus++;
	}

	const sourceCounts = new Map<string, number>();
	for (const m of modern) {
		const primary = m.images.find((i) => i.isPrimary);
		if (!primary) continue;
		const key = primary.source ?? 'unknown';
		sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
	}
	const imageSources = [...sourceCounts]
		.map(([source, cards]) => ({ source, cards }))
		.sort((a, b) => b.cards - a.cards);

	const fields: FieldRow[] = EVIDENCE_FIELDS.map((field) => {
		const statuses = modern.map(
			(m) => (m.evidence as Evidence | null)?.fields?.[field] ?? 'UNKNOWN'
		);
		const c = (s: string) => statuses.filter((x) => x === s).length;
		return {
			field,
			present: statuses.filter((x) => x !== 'UNKNOWN').length,
			verified: c('VERIFIED'),
			high: c('HIGH'),
			inferred: c('INFERRED'),
			unknown: c('UNKNOWN'),
			conflicting: c('CONFLICTING')
		};
	});

	const eligibleRows = modern.filter((m) => m.discoveryEligible);
	const reasons = new Map<string, Row[]>();
	for (const m of modern) {
		if (m.discoveryEligible) continue;
		for (const r of m.ineligibleReasons) reasons.set(r, [...(reasons.get(r) ?? []), m]);
	}
	const ineligible = [...reasons]
		.map(([label, rows]) => status(label, rows))
		.sort((a, b) => b.registrations - a.registrations);

	const availabilityCounts = new Map<string, number>();
	for (const m of modern) {
		availabilityCounts.set(m.availability, (availabilityCounts.get(m.availability) ?? 0) + 1);
	}
	const priceKind = (m: Row) => (m.evidence as Evidence | null)?.priceCurrency ?? 'NONE';

	return {
		since,
		generatedAt: new Date().toISOString(),
		generations: modern.length,
		registrations: regs(modern),
		images,
		trustedImage: status('trusted', trusted),
		photosPerCard,
		imageSources,
		fields,
		eligible: status('eligible', eligibleRows),
		ineligible,
		top100Eligible: modern.slice(0, 100).filter((m) => m.discoveryEligible).length,
		availability: [...availabilityCounts]
			.map(([s, cards]) => ({ status: s, cards }))
			.sort((a, b) => b.cards - a.cards),
		price: {
			current: modern.filter((m) => priceKind(m) === 'CURRENT').length,
			historical: modern.filter((m) => priceKind(m) === 'HISTORICAL').length,
			none: modern.filter((m) => priceKind(m) === 'NONE').length
		}
	};
}

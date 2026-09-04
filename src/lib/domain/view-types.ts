import type { MotorcycleCategory, RoundStatus, RoundVisibility, SwipeDecision } from './enums';

/**
 * Shapes shared between server load functions and components.
 *
 * These are hand-written rather than derived from Prisma's generated types,
 * because the generated types live under `$lib/server` and importing them into
 * a component would drag the client into server-only code.
 */

/** The minimum a swipe card needs. Kept small — it is fetched in batches. */
export interface CardBike {
	id: string;
	model: string;
	variant: string | null;
	modelYear: number | null;
	/** Years examples were registered new in the Netherlands. See the schema. */
	firstRegistrationYear: number | null;
	lastRegistrationYear: number | null;
	/**
	 * The years this generation covers, as a label: "2020–2024", "2025–".
	 * Present once the catalogue has divided the family into generations.
	 */
	generationLabel?: string | null;
	category: MotorcycleCategory | string;
	manufacturer: { name: string };
	images: { url: string }[];
}

/** A card plus the specs shown behind the info button. */
export interface CardBikeDetail extends CardBike {
	displacementCc: number | null;
	powerHp: number | null;
	wetWeightKg: number | null;
	seatHeightMm: number | null;
	msrpAmount: number | null;
	msrpCurrency: string | null;
	passengerAllowed: boolean | null;
}

export interface SwipeProgress {
	total: number;
	swiped: number;
	remaining: number;
	likes: number;
	superlikes: number;
	dislikes: number;
	skips: number;
	shortlist: number;
}

export interface ShortlistEntry {
	decision: SwipeDecision;
	updatedAt: string | Date;
	motorcycle: CardBikeDetail & {
		torqueNm: number | null;
		seatWidthMm: number | null;
		seatCount: number | null;
		passengerPegs: boolean | null;
		ridingPosition: string | null;
		manufacturer: { id: string; name: string };
	};
}

/**
 * A round plus its counters, as rendered on the dashboard.
 *
 * Lives here rather than in round.service so components can type against it
 * without importing from `$lib/server`.
 */
export interface RoundSummary {
	id: string;
	name: string;
	description: string | null;
	goal: string | null;
	status: RoundStatus;
	visibility: RoundVisibility;
	filters: unknown;
	createdAt: Date;
	updatedAt: Date;
	completedAt: Date | null;
	archivedAt: Date | null;
	/** Motorcycles matching the round's filters right now. */
	total: number;
	swiped: number;
	likes: number;
	superlikes: number;
	dislikes: number;
	skips: number;
	comparisons: number;
	/** Top-ranked motorcycle once comparisons have been made. */
	winner: { id: string; model: string; manufacturerName: string } | null;
}

/**
 * The years to print on a card.
 *
 * `modelYear` is when a model was introduced, and on its own it is misleading:
 * a round filtered to "2015 and newer" showed a Yamaha YBR125 labelled 2005,
 * which reads as a bug rather than as the fact that the bike has been sold
 * continuously since then.
 *
 * Where the Dutch registry knows when examples were actually put on the road,
 * that period is the honest answer. A model still being registered in the last
 * two years is shown as open-ended, because it has not stopped.
 */
export function describeYears(
	bike: Pick<
		CardBike,
		'modelYear' | 'firstRegistrationYear' | 'lastRegistrationYear' | 'generationLabel'
	>,
	now = new Date().getFullYear()
): string | null {
	// A generation's own span is the most specific truth there is: the 2020–2024
	// Z900, not "the Z900, registered since 2017".
	if (bike.generationLabel) return bike.generationLabel;

	const { firstRegistrationYear: from, lastRegistrationYear: to } = bike;

	if (from && to) {
		if (from === to) return String(from);
		return to >= now - 1 ? `${from}–` : `${from}–${to}`;
	}

	return bike.modelYear ? String(bike.modelYear) : ((from ?? to)?.toString() ?? null);
}

/**
 * Working out where one generation of a motorcycle ends and the next begins.
 *
 * Almost all of the difficulty is knowing what *not* to believe. The Dutch
 * registry records a machine's mass, price, capacity and rated power per
 * registration, and only two of those four can carry a generation boundary:
 *
 *  - **Capacity** changes when the engine changes. The Yamaha MT-09 went from
 *    847 cc to 890 cc in 2021, and that is a real generation.
 *  - **Rated power** changes for the same reason. The NC750X went from 40.3 kW
 *    to 43.1 kW in 2021; the Street Triple 765 from 90.5 kW to 95.6 kW in 2023.
 *
 * Mass and price cannot. A study of ten high-volume models found mass "steps"
 * of 210 → 268 → 189 kg on the MT-09 and 285 → 215 kg on the Tracer 9, both
 * from years with fewer than forty registrations. Every one was sampling noise.
 * Trusting mass would have invented four generations that never existed.
 *
 * And the signal MotoSwipe cares about most is the one the registry cannot see
 * at all. The Kawasaki Z900 was restyled in 2020 and again in 2025 and gained
 * three kilograms across nine years. A restyle is invisible here, so a Z900's
 * boundaries stay UNKNOWN until a human curates them. That is the honest
 * answer, and an honest unknown beats an invented boundary.
 */

export interface YearObservation {
	year: number;
	registrationCount: number;
	medianDisplacementCc?: number | null;
	maxPowerKw?: number | null;
}

export interface DetectedBoundary {
	/** The first year of the new generation. */
	year: number;
	reason: string;
}

/**
 * Years with fewer registrations than this are not evidence of anything.
 *
 * The false boundaries in the study all came from years with 19 to 38
 * registrations, where one unusual vehicle moves the median.
 */
export const MIN_REGISTRATIONS_PER_YEAR = 40;

/** A new engine, not a running change. Rounded capacities differ by ~1%. */
const DISPLACEMENT_CHANGE = 0.03;

/**
 * Rated power moves slightly between emissions standards without the machine
 * changing — the Z900 went 92.2 → 91 kW, which is not a generation.
 */
const POWER_CHANGE = 0.05;

/**
 * Boundaries the registry's data genuinely supports.
 *
 * Returns an empty list far more often than not, and that is the expected
 * result: most generation changes are styling, and styling is invisible here.
 */
export function detectBoundaries(observations: readonly YearObservation[]): DetectedBoundary[] {
	const usable = [...observations]
		.filter((o) => o.registrationCount >= MIN_REGISTRATIONS_PER_YEAR)
		.sort((a, b) => a.year - b.year);

	const boundaries: DetectedBoundary[] = [];
	let previous: YearObservation | undefined;

	for (const current of usable) {
		if (previous) {
			const cc = relativeChange(previous.medianDisplacementCc, current.medianDisplacementCc);
			if (cc !== undefined && cc > DISPLACEMENT_CHANGE) {
				boundaries.push({
					year: current.year,
					reason: `engine capacity ${previous.medianDisplacementCc} → ${current.medianDisplacementCc} cc`
				});
				previous = current;
				continue;
			}

			const kw = relativeChange(previous.maxPowerKw, current.maxPowerKw);
			if (kw !== undefined && kw > POWER_CHANGE) {
				boundaries.push({
					year: current.year,
					reason: `rated power ${previous.maxPowerKw} → ${current.maxPowerKw} kW`
				});
			}
		}
		previous = current;
	}

	return boundaries;
}

function relativeChange(
	before: number | null | undefined,
	after: number | null | undefined
): number | undefined {
	if (!before || !after) return undefined;
	return Math.abs(after - before) / before;
}

/**
 * Turns detected boundaries into the year spans a generation covers.
 *
 * With no boundaries this is a single span covering everything observed, which
 * is the common case and the correct one.
 */
export function toSpans(
	observations: readonly YearObservation[],
	boundaries: readonly DetectedBoundary[]
): { from: number; to: number; reason?: string }[] {
	const years = observations.map((o) => o.year).sort((a, b) => a - b);
	if (!years.length) return [];

	const starts = [years[0], ...boundaries.map((b) => b.year)].sort((a, b) => a - b);
	const spans: { from: number; to: number; reason?: string }[] = [];

	for (const [index, from] of starts.entries()) {
		const nextStart = starts[index + 1];
		const to = nextStart ? nextStart - 1 : years[years.length - 1];
		spans.push({
			from,
			to,
			reason: boundaries.find((b) => b.year === from)?.reason
		});
	}

	return spans;
}

/** How a span reads on a card. An open end means still being registered. */
export function spanLabel(
	from: number,
	to: number,
	currentYear = new Date().getFullYear()
): string {
	if (from === to) return String(from);
	return to >= currentYear - 1 ? `${from}–` : `${from}–${to}`;
}

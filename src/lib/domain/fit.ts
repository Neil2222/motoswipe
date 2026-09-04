/**
 * Rider-fit types and the standing caveat.
 *
 * These live in `domain/` rather than `server/fit/` because components render
 * them; the estimation logic itself stays server-side in `server/fit/fit.ts`.
 */

export const FitRating = {
	LIKELY_EASY: 'LIKELY_EASY',
	LIKELY_OK: 'LIKELY_OK',
	MAY_FEEL_TALL: 'MAY_FEEL_TALL',
	UNKNOWN: 'UNKNOWN'
} as const;
export type FitRating = (typeof FitRating)[keyof typeof FitRating];

export const FitConfidence = {
	/** Inseam supplied — the measurement that actually matters. */
	MEASURED: 'MEASURED',
	/** Inseam estimated from height. Wide error bars. */
	ESTIMATED: 'ESTIMATED',
	NONE: 'NONE'
} as const;
export type FitConfidence = (typeof FitConfidence)[keyof typeof FitConfidence];

export interface FitAssessment {
	rating: FitRating;
	confidence: FitConfidence;
	/** Two or three words, for a badge. */
	headline: string;
	/** A sentence for the detail page. Always hedged, always explains why. */
	explanation: string;
	/** Individual observations worth surfacing as bullets. */
	notes: string[];
	/**
	 * Seat height over usable inseam reach. Exposed for tests and debugging;
	 * never rendered, because the number invites false precision.
	 */
	reachRatio: number | null;
}

/**
 * Shown wherever a fit estimate appears. One sentence, so it sits under a badge
 * without being skimmed past as boilerplate.
 */
export const FIT_DISCLAIMER =
	'A guide, not a verdict — seat width, suspension sag, geometry and footwear all change how a bike feels. Sit on one.';

/** Colour/emphasis token for the UI, kept out of the components. */
export function fitTone(rating: FitRating): 'good' | 'neutral' | 'caution' | 'muted' {
	switch (rating) {
		case FitRating.LIKELY_EASY:
			return 'good';
		case FitRating.LIKELY_OK:
			return 'neutral';
		case FitRating.MAY_FEEL_TALL:
			return 'caution';
		default:
			return 'muted';
	}
}

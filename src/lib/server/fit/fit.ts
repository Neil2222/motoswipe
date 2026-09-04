import { FitConfidence, FitRating, type FitAssessment } from '$lib/domain/fit';

/**
 * Rider fit estimation.
 *
 * READ THIS BEFORE CHANGING ANYTHING HERE.
 *
 * A seat-height number cannot tell you whether a motorcycle fits a person. Seat
 * width where your thighs cross it, how far the suspension sags under your
 * weight, tank shape, boot sole thickness, hip flexibility and how much of the
 * bike's mass you have to hold up all matter at least as much. Two bikes with
 * an identical 830 mm seat can feel a hand's width apart.
 *
 * So this module produces a hint with its reasoning attached, never a verdict.
 * It says "likely comfortable", never "this bike fits you". Nothing in the app
 * hides a motorcycle based on the result unless the user explicitly enabled a
 * seat-height filter themselves.
 */

export interface RiderMeasurements {
	heightCm?: number | null;
	inseamCm?: number | null;
}

export interface MotorcycleFitInput {
	seatHeightMm?: number | null;
	seatWidthMm?: number | null;
	wetWeightKg?: number | null;
}

/**
 * Inseam estimated from height when the user has not measured it.
 *
 * 0.45 is a common approximation for inside leg over standing height.
 * Individual variation is easily ±5 cm, which at these seat heights is the
 * difference between flat feet and tiptoes — hence FitConfidence.ESTIMATED and
 * the softer wording wherever it is used.
 */
const INSEAM_FROM_HEIGHT_RATIO = 0.45;

/**
 * Straddling costs you a little reach: your legs splay over the seat rather
 * than hanging straight down.
 *
 * 0.95, not the 0.9 you sometimes see quoted. Inseam is measured crotch-to-floor
 * and, sitting on a bike, your crotch is essentially at seat height — so for a
 * normal-width seat the two are close to 1:1. Calibrating at 0.9 made the model
 * claim a 78 cm inseam rider could not flat-foot a 690 mm cruiser, which is
 * plainly wrong.
 */
const STRADDLE_FACTOR = 0.95;

/** Ordinary riding boots put roughly 25 mm under your heel. */
const BOOT_SOLE_MM = 25;

/**
 * Seat width past this starts eating reach noticeably. Most sources do not
 * publish seat width at all — which is exactly why the explanation always
 * mentions width as an unknown.
 */
const WIDE_SEAT_MM = 300;

export function assessFit(rider: RiderMeasurements, bike: MotorcycleFitInput): FitAssessment {
	const seatHeightMm = bike.seatHeightMm ?? null;

	if (!seatHeightMm) {
		return {
			rating: FitRating.UNKNOWN,
			confidence: FitConfidence.NONE,
			headline: 'Seat height unknown',
			explanation:
				'We have no seat height for this motorcycle, so we cannot say anything useful about reach. Sitting on one is the only reliable test anyway.',
			notes: [],
			reachRatio: null
		};
	}

	const hasInseam = typeof rider.inseamCm === 'number' && rider.inseamCm > 0;
	const hasHeight = typeof rider.heightCm === 'number' && rider.heightCm > 0;

	if (!hasInseam && !hasHeight) {
		return {
			rating: FitRating.UNKNOWN,
			confidence: FitConfidence.NONE,
			headline: 'Add your measurements',
			explanation: `Seat height is ${seatHeightMm} mm. Add your height — and ideally your inseam — to your profile and we will put that number in context.`,
			notes: [],
			reachRatio: null
		};
	}

	const inseamCm = hasInseam
		? (rider.inseamCm as number)
		: (rider.heightCm as number) * INSEAM_FROM_HEIGHT_RATIO;
	const confidence = hasInseam ? FitConfidence.MEASURED : FitConfidence.ESTIMATED;

	// Usable reach: inseam, reduced for straddling, plus a boot sole.
	let usableReachMm = inseamCm * 10 * STRADDLE_FACTOR + BOOT_SOLE_MM;

	const notes: string[] = [];

	if (bike.seatWidthMm && bike.seatWidthMm > WIDE_SEAT_MM) {
		const penalty = Math.min((bike.seatWidthMm - WIDE_SEAT_MM) * 0.12, 40);
		usableReachMm -= penalty;
		notes.push(
			`The seat is wide (${bike.seatWidthMm} mm), which pushes your legs apart and costs you reach.`
		);
	} else if (!bike.seatWidthMm) {
		notes.push(
			'Seat width is not published for this model. A wide seat can make a low bike feel taller than the number suggests.'
		);
	}

	const reachRatio = seatHeightMm / usableReachMm;

	// Bands, in terms of seat height over usable reach:
	//   <= 0.97  both feet down, more or less flat
	//   <= 1.08  balls of the feet — manageable for most riders
	//   >  1.08  tiptoes or one foot down
	// The bands are wide on purpose. The inputs are approximate and the
	// confounders (sag, seat width, footwear) are worth several percent each.
	let rating: FitRating;
	let headline: string;
	if (reachRatio <= 0.97) {
		rating = FitRating.LIKELY_EASY;
		headline = 'Likely comfortable';
	} else if (reachRatio <= 1.08) {
		rating = FitRating.LIKELY_OK;
		headline = 'Likely manageable';
	} else {
		rating = FitRating.MAY_FEEL_TALL;
		headline = 'May feel tall';
	}

	// Weight matters most exactly when reach is marginal: catching a heavy bike
	// on tiptoes is a different proposition from catching a light one.
	if (bike.wetWeightKg && bike.wetWeightKg >= 230 && rating !== FitRating.LIKELY_EASY) {
		notes.push(
			`At around ${Math.round(bike.wetWeightKg)} kg this is a heavy motorcycle, and being on tiptoes matters more when there is a lot of weight to catch.`
		);
	}
	if (bike.wetWeightKg && bike.wetWeightKg <= 170 && rating === FitRating.MAY_FEEL_TALL) {
		notes.push(
			`It is light though (around ${Math.round(bike.wetWeightKg)} kg), and a light bike is much easier to manage on the balls of your feet.`
		);
	}

	if (confidence === FitConfidence.ESTIMATED) {
		notes.push(
			'This uses an inseam estimated from your height. Measuring your actual inseam makes the estimate meaningfully better.'
		);
	}

	notes.push('Suspension sag under your weight typically lowers the seat by 10–30 mm.');

	return {
		rating,
		confidence,
		headline,
		explanation: buildExplanation(rating, seatHeightMm, confidence),
		notes,
		reachRatio
	};
}

function buildExplanation(
	rating: FitRating,
	seatHeightMm: number,
	confidence: FitConfidence
): string {
	const basis =
		confidence === FitConfidence.MEASURED ? 'your inseam' : 'an inseam estimated from your height';

	switch (rating) {
		case FitRating.LIKELY_EASY:
			return `The seat sits at ${seatHeightMm} mm. Against ${basis} you should get plenty of foot down, though seat width and how the suspension settles still change how it actually feels.`;
		case FitRating.LIKELY_OK:
			return `The seat sits at ${seatHeightMm} mm. Against ${basis} this is likely manageable — probably the balls of your feet rather than flat — but seat width and suspension sag can shift that either way.`;
		case FitRating.MAY_FEEL_TALL:
			return `The seat sits at ${seatHeightMm} mm, which is tall against ${basis}. Plenty of riders manage bikes like this with one foot down or a lowered seat, but sit on one before you commit.`;
		default:
			return `The seat sits at ${seatHeightMm} mm.`;
	}
}

export { FitRating, FitConfidence, type FitAssessment };
export { FIT_DISCLAIMER, fitTone } from '$lib/domain/fit';

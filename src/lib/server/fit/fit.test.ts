import { describe, expect, it } from 'vitest';
import { assessFit } from './fit';
import { FIT_DISCLAIMER, FitConfidence, FitRating, fitTone } from '$lib/domain/fit';

/**
 * These tests care as much about what FitService refuses to claim as about what
 * it does claim. Overstating a fit estimate is the failure mode that matters:
 * someone buying a motorcycle they cannot get their feet down on.
 */

const SHORT = { heightCm: 160, inseamCm: 70 };
const AVERAGE = { heightCm: 175, inseamCm: 78 };
const TALL = { heightCm: 192, inseamCm: 92 };

describe('assessFit — unknowns', () => {
	it('returns UNKNOWN when the motorcycle has no seat height', () => {
		const fit = assessFit(AVERAGE, { seatHeightMm: null });
		expect(fit.rating).toBe(FitRating.UNKNOWN);
		expect(fit.confidence).toBe(FitConfidence.NONE);
		expect(fit.reachRatio).toBeNull();
	});

	it('returns UNKNOWN when the rider has given no measurements', () => {
		const fit = assessFit({}, { seatHeightMm: 810 });
		expect(fit.rating).toBe(FitRating.UNKNOWN);
		expect(fit.confidence).toBe(FitConfidence.NONE);
		// It should still tell the user the seat height it knows about.
		expect(fit.explanation).toContain('810');
	});

	it('never claims a fit it cannot support', () => {
		const fit = assessFit({}, { seatHeightMm: 700 });
		expect(fit.explanation.toLowerCase()).not.toContain('fits you');
	});
});

describe('assessFit — confidence', () => {
	it('is MEASURED when an inseam is supplied', () => {
		expect(assessFit(AVERAGE, { seatHeightMm: 810 }).confidence).toBe(FitConfidence.MEASURED);
	});

	it('is ESTIMATED when only a height is supplied', () => {
		const fit = assessFit({ heightCm: 175 }, { seatHeightMm: 810 });
		expect(fit.confidence).toBe(FitConfidence.ESTIMATED);
	});

	it('says out loud that an estimate is an estimate', () => {
		const fit = assessFit({ heightCm: 175 }, { seatHeightMm: 810 });
		expect(fit.explanation).toContain('estimated');
		expect(fit.notes.some((n) => n.includes('estimated'))).toBe(true);
	});
});

describe('assessFit — ratings', () => {
	it('rates a low cruiser as easy for an average rider', () => {
		const fit = assessFit(AVERAGE, { seatHeightMm: 690 });
		expect(fit.rating).toBe(FitRating.LIKELY_EASY);
	});

	it('rates a tall supermoto as potentially tall for a short rider', () => {
		const fit = assessFit(SHORT, { seatHeightMm: 910 });
		expect(fit.rating).toBe(FitRating.MAY_FEEL_TALL);
	});

	it('rates the same supermoto as manageable for a tall rider', () => {
		const fit = assessFit(TALL, { seatHeightMm: 910 });
		expect(fit.rating).not.toBe(FitRating.MAY_FEEL_TALL);
	});

	it('gets harsher as the seat gets taller, for a fixed rider', () => {
		const ratings = [650, 750, 830, 900, 980].map(
			(seatHeightMm) => assessFit(AVERAGE, { seatHeightMm }).reachRatio as number
		);
		// Monotonic: a taller seat always yields a larger reach ratio.
		for (let i = 1; i < ratings.length; i++) {
			expect(ratings[i]).toBeGreaterThan(ratings[i - 1]);
		}
	});

	it('gets kinder as the rider gets taller, for a fixed seat', () => {
		const short = assessFit(SHORT, { seatHeightMm: 840 }).reachRatio as number;
		const average = assessFit(AVERAGE, { seatHeightMm: 840 }).reachRatio as number;
		const tall = assessFit(TALL, { seatHeightMm: 840 }).reachRatio as number;
		expect(short).toBeGreaterThan(average);
		expect(average).toBeGreaterThan(tall);
	});
});

describe('assessFit — refinements', () => {
	it('treats a wide seat as costing reach', () => {
		const narrow = assessFit(AVERAGE, { seatHeightMm: 800, seatWidthMm: 250 });
		const wide = assessFit(AVERAGE, { seatHeightMm: 800, seatWidthMm: 380 });
		expect(wide.reachRatio as number).toBeGreaterThan(narrow.reachRatio as number);
	});

	it('flags unknown seat width rather than ignoring it', () => {
		const fit = assessFit(AVERAGE, { seatHeightMm: 800, seatWidthMm: null });
		expect(fit.notes.some((n) => n.toLowerCase().includes('seat width'))).toBe(true);
	});

	it('warns about weight when reach is already marginal', () => {
		const fit = assessFit(SHORT, { seatHeightMm: 880, wetWeightKg: 260 });
		expect(fit.notes.some((n) => n.includes('heavy'))).toBe(true);
	});

	it('does not warn about weight when the rider is flat-footed anyway', () => {
		const fit = assessFit(TALL, { seatHeightMm: 690, wetWeightKg: 260 });
		expect(fit.rating).toBe(FitRating.LIKELY_EASY);
		expect(fit.notes.some((n) => n.includes('heavy'))).toBe(false);
	});

	it('offers reassurance when a tall bike is very light', () => {
		const fit = assessFit(SHORT, { seatHeightMm: 900, wetWeightKg: 150 });
		expect(fit.rating).toBe(FitRating.MAY_FEEL_TALL);
		expect(fit.notes.some((n) => n.includes('light'))).toBe(true);
	});

	it('always mentions suspension sag', () => {
		const fit = assessFit(AVERAGE, { seatHeightMm: 800 });
		expect(fit.notes.some((n) => n.toLowerCase().includes('sag'))).toBe(true);
	});
});

describe('assessFit — language', () => {
	it('hedges every rating rather than stating a verdict', () => {
		for (const seatHeightMm of [650, 780, 850, 950]) {
			const fit = assessFit(AVERAGE, { seatHeightMm });
			const text = `${fit.headline} ${fit.explanation}`.toLowerCase();
			expect(text).not.toContain('this bike fits you');
			expect(text).not.toContain('will fit');
			expect(text).toMatch(/likely|may|should|tall/);
		}
	});

	it('ships a disclaimer that names the confounding factors', () => {
		expect(FIT_DISCLAIMER).toMatch(/seat width/i);
		expect(FIT_DISCLAIMER).toMatch(/sag/i);
		expect(FIT_DISCLAIMER).toMatch(/sit on one/i);
	});
});

describe('fitTone', () => {
	it('maps each rating to a distinct tone', () => {
		expect(fitTone(FitRating.LIKELY_EASY)).toBe('good');
		expect(fitTone(FitRating.LIKELY_OK)).toBe('neutral');
		expect(fitTone(FitRating.MAY_FEEL_TALL)).toBe('caution');
		expect(fitTone(FitRating.UNKNOWN)).toBe('muted');
	});
});

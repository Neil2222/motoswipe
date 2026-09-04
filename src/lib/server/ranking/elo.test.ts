import { describe, expect, it } from 'vitest';
import {
	INITIAL_ELO,
	SUPERLIKE_ELO_BONUS,
	applyResult,
	expectedScore,
	kFactor,
	pairKey,
	selectPair,
	startingElo,
	suggestedComparisonCount
} from './elo';

describe('expectedScore', () => {
	it('gives equal ratings a coin flip', () => {
		expect(expectedScore(1500, 1500)).toBe(0.5);
	});

	it('is symmetric', () => {
		expect(expectedScore(1600, 1400) + expectedScore(1400, 1600)).toBeCloseTo(1, 10);
	});

	it('gives a 400-point lead roughly a 10:1 edge', () => {
		// The defining property of the Elo scale.
		expect(expectedScore(1900, 1500)).toBeCloseTo(10 / 11, 6);
	});

	it('is monotonic in the rating gap', () => {
		expect(expectedScore(1600, 1500)).toBeGreaterThan(expectedScore(1550, 1500));
	});
});

describe('kFactor', () => {
	it('decays as a motorcycle accumulates comparisons', () => {
		expect(kFactor(0)).toBeGreaterThan(kFactor(10));
		expect(kFactor(10)).toBeGreaterThan(kFactor(40));
	});

	it('never reaches zero, so late results still move the needle', () => {
		expect(kFactor(1000)).toBeGreaterThan(0);
	});
});

describe('applyResult', () => {
	it('moves the winner up and the loser down', () => {
		const out = applyResult(1500, 1500, 0, 0, 1);
		expect(out.ratingA).toBeGreaterThan(1500);
		expect(out.ratingB).toBeLessThan(1500);
	});

	it('conserves total rating when both have the same K', () => {
		const out = applyResult(1500, 1500, 0, 0, 1);
		expect(out.ratingA + out.ratingB).toBeCloseTo(3000, 6);
	});

	it('rewards an upset far more than an expected win', () => {
		const upset = applyResult(1200, 1800, 0, 0, 1);
		const expectedWin = applyResult(1800, 1200, 0, 0, 1);
		expect(upset.ratingA - 1200).toBeGreaterThan(expectedWin.ratingA - 1800);
	});

	it('handles scoreA = 0 as a loss for A', () => {
		const out = applyResult(1500, 1500, 0, 0, 0);
		expect(out.ratingA).toBeLessThan(1500);
		expect(out.ratingB).toBeGreaterThan(1500);
	});

	it('converges rather than oscillating over a long run', () => {
		// A always beats B. Ratings should separate, and each further win should
		// move A less than the one before as the result becomes expected.
		let a = INITIAL_ELO;
		let b = INITIAL_ELO;
		let comparisons = 0;
		const steps: number[] = [];

		for (let i = 0; i < 60; i++) {
			const out = applyResult(a, b, comparisons, comparisons, 1);
			steps.push(out.ratingA - a);
			a = out.ratingA;
			b = out.ratingB;
			comparisons++;
		}

		expect(a).toBeGreaterThan(b);
		// Monotonically decreasing step size: the table settles instead of
		// swinging on the fiftieth comparison.
		for (let i = 1; i < steps.length; i++) {
			expect(steps[i]).toBeLessThanOrEqual(steps[i - 1] + 1e-9);
		}
		// And by the end a further win barely moves it.
		expect(steps.at(-1)!).toBeLessThan(steps[0] / 10);
	});
});

describe('startingElo', () => {
	it('starts an ordinary like at the baseline', () => {
		expect(startingElo(false)).toBe(INITIAL_ELO);
	});

	it('gives a superlike a documented head start', () => {
		expect(startingElo(true)).toBe(INITIAL_ELO + SUPERLIKE_ELO_BONUS);
	});

	it('lets a handful of losses erase the superlike bonus', () => {
		// The comparison phase must be able to overrule the swipe phase.
		let superliked = startingElo(true);
		let liked = startingElo(false);
		let comparisons = 0;

		for (let i = 0; i < 5; i++) {
			const out = applyResult(superliked, liked, comparisons, comparisons, 0);
			superliked = out.ratingA;
			liked = out.ratingB;
			comparisons++;
		}

		expect(superliked).toBeLessThan(liked);
	});
});

describe('pairKey', () => {
	it('is order-independent', () => {
		expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'));
	});

	it('distinguishes different pairs', () => {
		expect(pairKey('a', 'b')).not.toBe(pairKey('a', 'c'));
	});
});

describe('selectPair', () => {
	const candidates = [
		{ motorcycleId: 'a', eloScore: 1500, comparisons: 0 },
		{ motorcycleId: 'b', eloScore: 1500, comparisons: 3 },
		{ motorcycleId: 'c', eloScore: 1900, comparisons: 3 },
		{ motorcycleId: 'd', eloScore: 1505, comparisons: 3 }
	];

	it('returns null with fewer than two candidates', () => {
		expect(selectPair([], { seenPairs: new Set() })).toBeNull();
		expect(selectPair([candidates[0]], { seenPairs: new Set() })).toBeNull();
	});

	it('gives the least-compared motorcycle a turn', () => {
		const pair = selectPair(candidates, { seenPairs: new Set(), random: () => 0 });
		expect(pair?.map((p) => p.motorcycleId)).toContain('a');
	});

	it('prefers an opponent with a close rating', () => {
		const pair = selectPair(candidates, { seenPairs: new Set(), random: () => 0 });
		// 'a' is at 1500; 'b' (1500) and 'd' (1505) are far closer than 'c' (1900).
		const other = pair?.find((p) => p.motorcycleId !== 'a');
		expect(['b', 'd']).toContain(other?.motorcycleId);
	});

	it('avoids a pairing that has already been voted on', () => {
		const seen = new Set([pairKey('a', 'b'), pairKey('a', 'd')]);
		const pair = selectPair(candidates, { seenPairs: seen, random: () => 0 });
		const other = pair?.find((p) => p.motorcycleId !== 'a');
		expect(other?.motorcycleId).toBe('c');
	});

	it('falls back to a repeat rather than stalling when every pair is seen', () => {
		const seen = new Set([pairKey('a', 'b'), pairKey('a', 'c'), pairKey('a', 'd')]);
		const pair = selectPair(candidates, { seenPairs: seen, random: () => 0 });
		expect(pair).not.toBeNull();
		expect(pair?.[0].motorcycleId).toBe('a');
	});

	it('never pairs a motorcycle with itself', () => {
		for (let i = 0; i < 50; i++) {
			const pair = selectPair(candidates, { seenPairs: new Set() });
			expect(pair?.[0].motorcycleId).not.toBe(pair?.[1].motorcycleId);
		}
	});
});

describe('suggestedComparisonCount', () => {
	it('asks for nothing below two motorcycles', () => {
		expect(suggestedComparisonCount(0)).toBe(0);
		expect(suggestedComparisonCount(1)).toBe(0);
	});

	it('stays far below a full round robin', () => {
		const n = 20;
		const roundRobin = (n * (n - 1)) / 2; // 190
		expect(suggestedComparisonCount(n)).toBeLessThan(roundRobin);
	});

	it('gives every motorcycle at least one outing', () => {
		for (const n of [2, 5, 12, 30]) {
			expect(suggestedComparisonCount(n)).toBeGreaterThanOrEqual(n);
		}
	});
});

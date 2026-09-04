/**
 * Elo, applied to motorcycles instead of chess players.
 *
 * Pure functions, no database. `RankingService` owns persistence; everything
 * here is directly unit-testable.
 */

export const INITIAL_ELO = 1500;

/**
 * Superlikes start 40 points up.
 *
 * Rationale: a superlike is already a strong stated preference, and starting it
 * level with an ordinary like throws that information away. 40 points is about
 * a 56% expected win rate — enough to seed the ordering sensibly, small enough
 * that four or five head-to-head losses erase it completely. The comparison
 * phase is allowed to overrule the swipe phase; that is the point of running it.
 */
export const SUPERLIKE_ELO_BONUS = 40;

/**
 * K-factor decays with experience: early results move a bike a long way, later
 * ones fine-tune. Without decay, a bike's rank keeps swinging on its 30th
 * comparison and the final table never settles.
 */
export function kFactor(comparisons: number): number {
	if (comparisons < 5) return 48;
	if (comparisons < 15) return 32;
	return 20;
}

/** Probability that A beats B given their ratings. */
export function expectedScore(ratingA: number, ratingB: number): number {
	return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export interface EloOutcome {
	ratingA: number;
	ratingB: number;
}

/**
 * One head-to-head result. `scoreA` is 1 when A wins, 0 when B wins.
 * (Draws are not offered in the UI, but 0.5 works if that ever changes.)
 */
export function applyResult(
	ratingA: number,
	ratingB: number,
	comparisonsA: number,
	comparisonsB: number,
	scoreA: number
): EloOutcome {
	const expectedA = expectedScore(ratingA, ratingB);
	const expectedB = 1 - expectedA;
	const kA = kFactor(comparisonsA);
	const kB = kFactor(comparisonsB);

	return {
		ratingA: ratingA + kA * (scoreA - expectedA),
		ratingB: ratingB + kB * (1 - scoreA - expectedB)
	};
}

export function startingElo(isSuperlike: boolean): number {
	return isSuperlike ? INITIAL_ELO + SUPERLIKE_ELO_BONUS : INITIAL_ELO;
}

// ---------------------------------------------------------------------------
// Pair selection
// ---------------------------------------------------------------------------

export interface PairCandidate {
	motorcycleId: string;
	eloScore: number;
	comparisons: number;
}

export interface PairSelectionOptions {
	/** Pairs already voted on, as the `pairKey` of each. */
	seenPairs: ReadonlySet<string>;
	/** Deterministic 0..1 source, so the choice is testable. */
	random?: () => number;
}

/** Order-independent key for a pair of motorcycles. */
export function pairKey(a: string, b: string): string {
	return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Chooses the next head-to-head.
 *
 * Strategy, in order of priority:
 *  1. Give the least-compared bike a turn, so nothing is left unranked.
 *  2. Prefer an opponent this bike has not met yet — a repeat pair adds far
 *     less information than a fresh one.
 *  3. Among those, prefer close ratings. A 1700 vs 1300 matchup is nearly
 *     always predictable and barely moves either score.
 *
 * Returns null when fewer than two candidates exist.
 */
export function selectPair(
	candidates: readonly PairCandidate[],
	options: PairSelectionOptions
): [PairCandidate, PairCandidate] | null {
	if (candidates.length < 2) return null;
	const random = options.random ?? Math.random;

	// 1. Least-compared, with a random tiebreak so the same bike does not lead
	//    every round of voting.
	const fewest = Math.min(...candidates.map((c) => c.comparisons));
	const leastCompared = candidates.filter((c) => c.comparisons === fewest);
	const a = leastCompared[Math.floor(random() * leastCompared.length)];

	const others = candidates.filter((c) => c.motorcycleId !== a.motorcycleId);
	const unseen = others.filter(
		(c) => !options.seenPairs.has(pairKey(a.motorcycleId, c.motorcycleId))
	);
	// If every pairing for A has been seen, fall back to all of them rather than
	// stalling the comparison phase.
	const pool = unseen.length > 0 ? unseen : others;

	// 3. Closest rating, again with a random tiebreak among equals.
	let bestDistance = Number.POSITIVE_INFINITY;
	let best: PairCandidate[] = [];
	for (const c of pool) {
		const distance = Math.abs(c.eloScore - a.eloScore);
		if (distance < bestDistance - 0.000001) {
			bestDistance = distance;
			best = [c];
		} else if (Math.abs(distance - bestDistance) <= 0.000001) {
			best.push(c);
		}
	}

	const b = best[Math.floor(random() * best.length)];
	return [a, b];
}

/**
 * How many comparisons are worth doing for n motorcycles.
 *
 * Full round-robin is n(n-1)/2 — 190 votes for 20 bikes, which nobody finishes.
 * Roughly n·log2(n) votes gets a stable top few, which is what the user
 * actually cares about. Shown as a target, never enforced.
 */
export function suggestedComparisonCount(n: number): number {
	if (n < 2) return 0;
	return Math.max(n, Math.round(n * Math.log2(n)));
}

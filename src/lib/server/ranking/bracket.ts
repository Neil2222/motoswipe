import { pairKey } from './elo';

/**
 * A knockout bracket for the demo.
 *
 * Elo pair selection is right for a real round: it keeps asking until the
 * table settles, and "enough" is a suggestion. A demo needs the opposite —
 * a fixed, short number of questions with a definite winner at the end.
 * Single elimination gives exactly that: n seeds, n − 1 matches, one bike
 * left standing. Seven seeds is six matches, which is what the demo promises.
 *
 * The bracket is never stored. It is a pure function of the seeds and the
 * votes recorded so far, so the next match is simply the first scheduled
 * pairing without a vote, and a round that is reopened shows the same state
 * it was left in. The winner of the final has beaten every opponent it met,
 * and because every match moves Elo, it also carries the highest rating.
 */

export const BRACKET_SIZE = 7;

export interface BracketVote {
	motorcycleAId: string;
	motorcycleBId: string;
	winnerMotorcycleId: string;
}

export interface BracketState {
	/** The next pairing to ask about, or null when the bracket is complete. */
	next: [string, string] | null;
	/** Matches already decided. */
	decided: number;
	/** Matches in the whole bracket: seeds − 1. */
	total: number;
	/** The last bike standing, once the final is decided. */
	champion: string | null;
}

/**
 * Seeds in bracket order: superlikes first, then in the order they were liked.
 * Capped at BRACKET_SIZE; a demo with more likes than that leaves the rest
 * out of the bracket rather than asking more questions.
 */
export function bracketSeeds(
	shortlist: readonly { motorcycleId: string; decision: string; likedAt: Date }[]
): string[] {
	return [...shortlist]
		.sort(
			(a, b) =>
				Number(b.decision === 'SUPERLIKE') - Number(a.decision === 'SUPERLIKE') ||
				a.likedAt.getTime() - b.likedAt.getTime() ||
				a.motorcycleId.localeCompare(b.motorcycleId)
		)
		.slice(0, BRACKET_SIZE)
		.map((s) => s.motorcycleId);
}

/**
 * Walks the bracket against the votes. Rounds pair seeds in order; with an
 * odd number the last one sits the round out and joins the next.
 */
export function bracketState(
	seeds: readonly string[],
	votes: readonly BracketVote[]
): BracketState {
	const total = Math.max(seeds.length - 1, 0);
	if (seeds.length < 2) return { next: null, decided: 0, total, champion: null };

	// The earliest vote for a pairing decides it; a later duplicate is inert.
	const winners = new Map<string, string>();
	for (const vote of votes) {
		const key = pairKey(vote.motorcycleAId, vote.motorcycleBId);
		if (!winners.has(key)) winners.set(key, vote.winnerMotorcycleId);
	}

	let round = [...seeds];
	let decided = 0;
	while (round.length > 1) {
		const advancing: string[] = [];
		for (let i = 0; i + 1 < round.length; i += 2) {
			const a = round[i];
			const b = round[i + 1];
			const winner = winners.get(pairKey(a, b));
			if (winner !== a && winner !== b) {
				return { next: [a, b], decided, total, champion: null };
			}
			decided++;
			advancing.push(winner);
		}
		if (round.length % 2 === 1) advancing.push(round[round.length - 1]);
		round = advancing;
	}

	return { next: null, decided, total, champion: round[0] };
}

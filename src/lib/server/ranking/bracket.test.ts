import { describe, expect, it } from 'vitest';
import { BRACKET_SIZE, bracketSeeds, bracketState, type BracketVote } from './bracket';

const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

function vote(a: string, b: string, winner: string): BracketVote {
	return { motorcycleAId: a, motorcycleBId: b, winnerMotorcycleId: winner };
}

describe('bracketSeeds', () => {
	it('puts superlikes first, then the order of liking, and caps the field', () => {
		const t = (n: number) => new Date(2026, 0, n);
		const shortlist = ids.map((id, i) => ({
			motorcycleId: id,
			decision: id === 'e' || id === 'h' ? 'SUPERLIKE' : 'LIKE',
			likedAt: t(10 - i)
		}));
		const seeds = bracketSeeds(shortlist);
		expect(seeds).toHaveLength(BRACKET_SIZE);
		// h was superliked later than e, but both come first; then likes by time.
		expect(seeds.slice(0, 2)).toEqual(['h', 'e']);
		expect(seeds.slice(2)).toEqual(['i', 'g', 'f', 'd', 'c']);
	});
});

describe('bracketState', () => {
	it('runs seven seeds through six matches to one champion', () => {
		const seeds = ids.slice(0, 7);
		let votes: BracketVote[] = [];
		const asked: string[] = [];
		for (;;) {
			const state = bracketState(seeds, votes);
			expect(state.total).toBe(6);
			expect(state.decided).toBe(votes.length);
			if (!state.next) {
				expect(state.champion).not.toBeNull();
				break;
			}
			asked.push(state.next.join('-'));
			// The higher seed always wins.
			votes = [...votes, vote(state.next[0], state.next[1], state.next[0])];
		}
		expect(asked).toEqual(['a-b', 'c-d', 'e-f', 'a-c', 'e-g', 'a-e']);
		expect(bracketState(seeds, votes).champion).toBe('a');
	});

	it('gives the bye to the odd seed out and lets an upset advance', () => {
		const seeds = ['a', 'b', 'c'];
		expect(bracketState(seeds, []).next).toEqual(['a', 'b']);
		const afterFirst = bracketState(seeds, [vote('a', 'b', 'b')]);
		expect(afterFirst.next).toEqual(['b', 'c']);
		const done = bracketState(seeds, [vote('a', 'b', 'b'), vote('c', 'b', 'c')]);
		expect(done.next).toBeNull();
		expect(done.champion).toBe('c');
		expect(done.decided).toBe(2);
		expect(done.total).toBe(2);
	});

	it('ignores votes for pairings that are not in the bracket, and repeats', () => {
		const seeds = ['a', 'b', 'c', 'd'];
		const state = bracketState(seeds, [
			vote('a', 'c', 'c'),
			vote('a', 'b', 'a'),
			vote('b', 'a', 'b')
		]);
		expect(state.next).toEqual(['c', 'd']);
		expect(state.decided).toBe(1);
	});

	it('is complete with nothing to ask for fewer than two seeds', () => {
		expect(bracketState(['a'], [])).toEqual({ next: null, decided: 0, total: 0, champion: null });
		expect(bracketState([], []).next).toBeNull();
	});
});

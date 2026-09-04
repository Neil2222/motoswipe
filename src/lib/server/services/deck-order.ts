/**
 * Deterministic deck ordering.
 *
 * The deck must be shuffled — showing 400 motorcycles in alphabetical order by
 * manufacturer is a miserable experience — but it must also be *stable*. If the
 * order were re-randomised on every request, a user who swipes 20 bikes, closes
 * the tab and comes back tomorrow would get a differently-ordered remainder,
 * and pagination would show duplicates or skip entries whenever the catalogue
 * grew.
 *
 * So the order is a pure function of (roundId, motorcycleId): the same round
 * always yields the same sequence, two rounds over the same catalogue yield
 * different sequences, and a motorcycle imported next week slots into a fixed
 * position without disturbing anything already swiped.
 */

/**
 * FNV-1a, 32-bit. Chosen for being tiny, dependency-free and well-distributed
 * enough for shuffling — this is not a security primitive.
 */
export function fnv1a(input: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		// hash *= 16777619, kept in 32-bit range without overflowing a double.
		hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
	}
	return hash >>> 0;
}

/**
 * Sort key for one motorcycle within one round. Ties (a hash collision) fall
 * back to the id, so the ordering is total and never depends on the order the
 * database happened to return rows in.
 */
export function deckSortKey(roundId: string, motorcycleId: string): number {
	return fnv1a(`${roundId}:${motorcycleId}`);
}

/**
 * Orders candidate ids into the round's stable deck sequence.
 * Does not mutate the input.
 */
export function orderDeck(roundId: string, motorcycleIds: readonly string[]): string[] {
	return [...motorcycleIds].sort((a, b) => {
		const ka = deckSortKey(roundId, a);
		const kb = deckSortKey(roundId, b);
		if (ka !== kb) return ka - kb;
		return a < b ? -1 : a > b ? 1 : 0;
	});
}

/**
 * The next `limit` ids that have not been swiped yet, in deck order.
 *
 * `exclude` covers cards the client already holds but has not yet reported a
 * decision for, so a queue top-up never hands back a card that is on screen.
 */
export function nextFromDeck(
	roundId: string,
	candidateIds: readonly string[],
	swipedIds: ReadonlySet<string>,
	limit: number,
	exclude: ReadonlySet<string> = new Set()
): string[] {
	const out: string[] = [];
	for (const id of orderDeck(roundId, candidateIds)) {
		if (swipedIds.has(id) || exclude.has(id)) continue;
		out.push(id);
		if (out.length >= limit) break;
	}
	return out;
}

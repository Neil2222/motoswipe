import type { SwipeDecision } from '$lib/domain/enums';
import { deckSortKey } from './deck-order';

export interface DeckCandidate {
	id: string;
	category: string;
	manufacturerId: string;
}

export interface PreferenceSwipe {
	decision: SwipeDecision;
	motorcycle: Pick<DeckCandidate, 'category' | 'manufacturerId'>;
}

type Evidence = Map<string, { signal: number; observations: number }>;

/** Rebuilt from saved decisions, so changing or undoing a swipe also unlearns it. */
export function deckPreferences(swipes: readonly PreferenceSwipe[]) {
	const categories: Evidence = new Map();
	const manufacturers: Evidence = new Map();
	function add(evidence: Evidence, key: string, signal: number) {
		const previous = evidence.get(key) ?? { signal: 0, observations: 0 };
		evidence.set(key, {
			signal: previous.signal + signal,
			observations: previous.observations + Math.abs(signal)
		});
	}
	for (const { decision, motorcycle } of swipes) {
		if (decision === 'SKIP') continue;
		const signal = decision === 'SUPERLIKE' ? 2 : decision === 'LIKE' ? 1 : -1;
		// OTHER is missing classification, not a shared style preference.
		if (motorcycle.category !== 'OTHER') add(categories, motorcycle.category, signal);
		add(manufacturers, motorcycle.manufacturerId, signal);
	}

	function affinity(evidence: Evidence, key: string) {
		const entry = evidence.get(key);
		// Three neutral observations soften conclusions from the first few swipes.
		return entry ? entry.signal / (entry.observations + 3) : 0;
	}

	return (bike: DeckCandidate): number => {
		const score =
			2.2 * affinity(categories, bike.category) +
			0.5 * affinity(manufacturers, bike.manufacturerId);
		// Positive baseline keeps disliked and unseen styles discoverable. These
		// are sampling weights, not probabilities that somebody will like a bike.
		return 0.25 + 0.75 * Math.exp(score);
	};
}

/**
 * Weighted shuffle without replacement. Each id has a stable random draw;
 * only new decisions change its weight. A neutral profile preserves the
 * original shuffle. Already buffered cards are excluded, never rearranged.
 */
export function personalizedDeck(
	roundId: string,
	candidates: readonly DeckCandidate[],
	swipes: readonly PreferenceSwipe[],
	excluded: ReadonlySet<string>,
	limit: number
): string[] {
	if (!Number.isFinite(limit) || limit <= 0) return [];
	const weight = deckPreferences(swipes);
	return candidates
		.filter((bike) => !excluded.has(bike.id))
		.map((bike) => {
			const draw = (deckSortKey(roundId, bike.id) + 0.5) / 0x100000000;
			return { id: bike.id, key: -Math.log1p(-draw) / weight(bike) };
		})
		.sort((a, b) => a.key - b.key || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
		.slice(0, Math.floor(limit))
		.map((bike) => bike.id);
}

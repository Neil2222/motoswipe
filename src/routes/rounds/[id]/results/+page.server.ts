import { requireOwnedRound } from '$lib/server/guards';
import { getRoundProgress } from '$lib/server/services/round.service';
import { comparisonCount, getRanking } from '$lib/server/services/ranking.service';
import { getRoundStatistics, MIN_SAMPLE } from '$lib/server/statistics/statistics.service';
import { suggestedComparisonCount } from '$lib/server/ranking/elo';
import { demoBracket } from '$lib/server/services/demo.service';
import { prisma } from '$lib/server/db/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { user, round } = await requireOwnedRound(event, event.params.id);

	const [progress, ranking, votes, statistics, manufacturers, bracket] = await Promise.all([
		getRoundProgress(round.id, round.filters),
		getRanking(round.id),
		comparisonCount(round.id),
		getRoundStatistics(round.id),
		prisma.manufacturer.findMany({ select: { id: true, name: true } }),
		user.isGuest ? demoBracket(round.id) : Promise.resolve(null)
	]);

	// A demo's progress is its knockout: matches decided out of matches in the
	// bracket. A real round counts every vote against the Elo suggestion.
	const comparisons = bracket ? bracket.decided : votes;

	// A bike with no comparisons has an Elo score it never earned, so the
	// "winner" is only meaningful once head-to-head voting has happened.
	const ranked = ranking.filter((r) => r.comparisons > 0);

	return {
		round: {
			id: round.id,
			name: round.name,
			description: round.description,
			goal: round.goal,
			status: round.status,
			filters: round.filters,
			completedAt: round.completedAt
		},
		progress,
		ranking,
		ranked,
		comparisons,
		suggestedComparisons: bracket ? bracket.total : suggestedComparisonCount(ranking.length),
		bracketComplete: bracket ? bracket.next === null && bracket.total > 0 : false,
		statistics,
		minSample: MIN_SAMPLE,
		manufacturers,
		isDemo: user.isGuest,
		justSaved: event.url.searchParams.get('saved') === '1'
	};
};

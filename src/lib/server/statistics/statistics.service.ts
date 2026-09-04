import { prisma } from '../db/client';
import type { MotorcycleCategory, SwipeDecision } from '$lib/domain/enums';

/**
 * Round statistics — "what does your taste actually look like".
 *
 * Everything here is plain aggregation over the round's swipes. No inference,
 * no scoring model, no AI. A like rate is a like rate.
 *
 * Small-sample honesty: a manufacturer you saw twice and liked once is not
 * "50% — your favourite brand", so rows carry their `shown` count and the UI
 * marks anything below `MIN_SAMPLE` as provisional rather than hiding it.
 */

export const MIN_SAMPLE = 4;

export interface GroupStat<T extends string> {
	key: T;
	shown: number;
	liked: number;
	superliked: number;
	disliked: number;
	skipped: number;
	/** (liked + superliked) / shown, 0..1. Skips excluded from the denominator. */
	likeRate: number;
	/** False when `shown` is too small for the rate to mean much. */
	significant: boolean;
}

export interface RoundStatistics {
	totals: {
		seen: number;
		likes: number;
		superlikes: number;
		dislikes: number;
		skips: number;
		likeRate: number;
		superlikeRate: number;
	};
	manufacturers: GroupStat<string>[];
	categories: GroupStat<MotorcycleCategory>[];
	/** Averages across liked + superliked bikes only. Null when no data exists. */
	likedAverages: {
		displacementCc: number | null;
		powerHp: number | null;
		torqueNm: number | null;
		wetWeightKg: number | null;
		seatHeightMm: number | null;
		modelYear: number | null;
		price: { amount: number; currency: string } | null;
		passengerCapableRatio: number | null;
	};
	/** Same averages over disliked bikes, so the two can be contrasted. */
	dislikedAverages: {
		displacementCc: number | null;
		powerHp: number | null;
		seatHeightMm: number | null;
	};
}

function rate(liked: number, superliked: number, shown: number, skipped: number): number {
	// Skips are "not now", not "no". Counting them as rejections would understate
	// every like rate.
	const denominator = shown - skipped;
	if (denominator <= 0) return 0;
	return (liked + superliked) / denominator;
}

function mean(values: (number | null | undefined)[]): number | null {
	const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
	if (nums.length === 0) return null;
	return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export async function getRoundStatistics(roundId: string): Promise<RoundStatistics> {
	const swipes = await prisma.swipe.findMany({
		where: { roundId },
		select: {
			decision: true,
			motorcycle: {
				select: {
					id: true,
					category: true,
					displacementCc: true,
					powerHp: true,
					torqueNm: true,
					wetWeightKg: true,
					seatHeightMm: true,
					modelYear: true,
					msrpAmount: true,
					msrpCurrency: true,
					passengerAllowed: true,
					manufacturer: { select: { id: true, name: true } }
				}
			}
		}
	});

	const totals = {
		seen: swipes.length,
		likes: 0,
		superlikes: 0,
		dislikes: 0,
		skips: 0,
		likeRate: 0,
		superlikeRate: 0
	};

	const byManufacturer = new Map<string, GroupStat<string>>();
	const byCategory = new Map<string, GroupStat<MotorcycleCategory>>();

	const liked: (typeof swipes)[number]['motorcycle'][] = [];
	const disliked: (typeof swipes)[number]['motorcycle'][] = [];

	const bump = <T extends string>(
		map: Map<string, GroupStat<T>>,
		key: T,
		decision: SwipeDecision
	) => {
		let stat = map.get(key);
		if (!stat) {
			stat = {
				key,
				shown: 0,
				liked: 0,
				superliked: 0,
				disliked: 0,
				skipped: 0,
				likeRate: 0,
				significant: false
			};
			map.set(key, stat);
		}
		stat.shown++;
		if (decision === 'LIKE') stat.liked++;
		else if (decision === 'SUPERLIKE') stat.superliked++;
		else if (decision === 'DISLIKE') stat.disliked++;
		else stat.skipped++;
	};

	for (const swipe of swipes) {
		const bike = swipe.motorcycle;

		if (swipe.decision === 'LIKE') totals.likes++;
		else if (swipe.decision === 'SUPERLIKE') totals.superlikes++;
		else if (swipe.decision === 'DISLIKE') totals.dislikes++;
		else totals.skips++;

		bump(byManufacturer, bike.manufacturer.name, swipe.decision);
		bump(byCategory, bike.category as MotorcycleCategory, swipe.decision);

		if (swipe.decision === 'LIKE' || swipe.decision === 'SUPERLIKE') liked.push(bike);
		else if (swipe.decision === 'DISLIKE') disliked.push(bike);
	}

	const judged = totals.seen - totals.skips;
	totals.likeRate = judged > 0 ? (totals.likes + totals.superlikes) / judged : 0;
	totals.superlikeRate = judged > 0 ? totals.superlikes / judged : 0;

	const finish = <T extends string>(map: Map<string, GroupStat<T>>): GroupStat<T>[] =>
		[...map.values()]
			.map((s) => ({
				...s,
				likeRate: rate(s.liked, s.superliked, s.shown, s.skipped),
				significant: s.shown - s.skipped >= MIN_SAMPLE
			}))
			// Best like rate first; within a tie, the one you saw more of.
			.sort((a, b) => b.likeRate - a.likeRate || b.shown - a.shown);

	// Price averages are only meaningful within a single currency. Use the most
	// common currency among liked bikes and average only those.
	const currencyCounts = new Map<string, number>();
	for (const bike of liked) {
		if (bike.msrpAmount != null && bike.msrpCurrency) {
			currencyCounts.set(bike.msrpCurrency, (currencyCounts.get(bike.msrpCurrency) ?? 0) + 1);
		}
	}
	const dominantCurrency =
		[...currencyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
	const priceMean = dominantCurrency
		? mean(liked.filter((b) => b.msrpCurrency === dominantCurrency).map((b) => b.msrpAmount))
		: null;

	const passengerKnown = liked.filter((b) => b.passengerAllowed !== null);

	return {
		totals,
		manufacturers: finish(byManufacturer),
		categories: finish(byCategory),
		likedAverages: {
			displacementCc: mean(liked.map((b) => b.displacementCc)),
			powerHp: mean(liked.map((b) => b.powerHp)),
			torqueNm: mean(liked.map((b) => b.torqueNm)),
			wetWeightKg: mean(liked.map((b) => b.wetWeightKg)),
			seatHeightMm: mean(liked.map((b) => b.seatHeightMm)),
			modelYear: mean(liked.map((b) => b.modelYear)),
			price:
				priceMean !== null && dominantCurrency
					? { amount: priceMean, currency: dominantCurrency }
					: null,
			passengerCapableRatio:
				passengerKnown.length > 0
					? passengerKnown.filter((b) => b.passengerAllowed).length / passengerKnown.length
					: null
		},
		dislikedAverages: {
			displacementCc: mean(disliked.map((b) => b.displacementCc)),
			powerHp: mean(disliked.map((b) => b.powerHp)),
			seatHeightMm: mean(disliked.map((b) => b.seatHeightMm))
		}
	};
}

/** Instance-wide counters for the admin overview. */
export async function getAdminStatistics() {
	const [users, rounds, swipes, motorcycles, manufacturers, images, votes, sessions] =
		await Promise.all([
			prisma.user.count(),
			prisma.discoveryRound.count(),
			prisma.swipe.count(),
			prisma.motorcycle.count(),
			prisma.manufacturer.count(),
			prisma.motorcycleImage.count(),
			prisma.comparisonVote.count(),
			prisma.authSession.count({ where: { expiresAt: { gt: new Date() } } })
		]);

	const [bySource, byDecision, retired, roundsByStatus] = await Promise.all([
		prisma.motorcycle.groupBy({ by: ['source'], _count: { _all: true } }),
		prisma.swipe.groupBy({ by: ['decision'], _count: { _all: true } }),
		prisma.motorcycle.count({ where: { isActive: false } }),
		prisma.discoveryRound.groupBy({ by: ['status'], _count: { _all: true } })
	]);

	const lastImport = await prisma.motorcycle.aggregate({ _max: { importedAt: true } });

	return {
		counts: { users, rounds, swipes, motorcycles, manufacturers, images, votes, sessions, retired },
		bySource: bySource.map((s) => ({ source: s.source, count: s._count._all })),
		byDecision: byDecision.map((d) => ({ decision: d.decision, count: d._count._all })),
		roundsByStatus: roundsByStatus.map((r) => ({ status: r.status, count: r._count._all })),
		lastImportAt: lastImport._max.importedAt
	};
}

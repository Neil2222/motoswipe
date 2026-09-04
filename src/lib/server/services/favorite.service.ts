import type { Prisma } from '$lib/server/db/generated/client';
import { prisma } from '../db/client';
import { MOTORCYCLE_CARD_SELECT } from './motorcycle.service';

/**
 * The garage: motorcycles somebody has kept, outside of any round.
 *
 * A round is a question with an end — "which bike this spring" — and a swipe is
 * an answer given inside one. This is the other thing people do: come across a
 * machine, like the look of it, and want it saved. The two must not be
 * conflated, because the same motorcycle can honestly be a LIKE in one round
 * and a DISLIKE in another, while a heart is simply a heart.
 *
 * Everything here is scoped by `userId` at the query level rather than filtered
 * afterwards, so there is no code path that could return somebody else's
 * garage.
 */

/** Newest first: a garage is a list of things you just found. */
const ORDER: Prisma.FavoriteOrderByWithRelationInput[] = [{ createdAt: 'desc' }];

export async function listFavorites(userId: string) {
	const rows = await prisma.favorite.findMany({
		where: { userId },
		orderBy: ORDER,
		select: {
			createdAt: true,
			motorcycle: { select: MOTORCYCLE_CARD_SELECT }
		}
	});

	return rows.map((row) => ({ savedAt: row.createdAt, bike: row.motorcycle }));
}

export async function countFavorites(userId: string): Promise<number> {
	return prisma.favorite.count({ where: { userId } });
}

/**
 * Which of these motorcycles the user has already saved.
 *
 * One query for a whole page of results, so a browse grid can draw fifty hearts
 * in the right state without fifty round trips.
 */
export async function favoriteIdsAmong(
	userId: string,
	motorcycleIds: readonly string[]
): Promise<Set<string>> {
	if (!motorcycleIds.length) return new Set();

	const rows = await prisma.favorite.findMany({
		where: { userId, motorcycleId: { in: [...motorcycleIds] } },
		select: { motorcycleId: true }
	});

	return new Set(rows.map((row) => row.motorcycleId));
}

export async function isFavorite(userId: string, motorcycleId: string): Promise<boolean> {
	const row = await prisma.favorite.findUnique({
		where: { userId_motorcycleId: { userId, motorcycleId } },
		select: { id: true }
	});
	return row !== null;
}

/**
 * Adds or removes a heart, and reports the state it ended in.
 *
 * Idempotent in both directions on purpose: a double-tap on a slow connection,
 * or two tabs open on the same bike, must not produce two rows or an error. The
 * unique constraint on `(userId, motorcycleId)` is what actually guarantees
 * that; this just makes the common path not depend on catching a violation.
 */
export async function toggleFavorite(
	userId: string,
	motorcycleId: string
): Promise<{ favorited: boolean }> {
	const existing = await prisma.favorite.findUnique({
		where: { userId_motorcycleId: { userId, motorcycleId } },
		select: { id: true }
	});

	if (existing) {
		await prisma.favorite.delete({ where: { id: existing.id } });
		return { favorited: false };
	}

	// `create` rather than `upsert`: the row demonstrably does not exist, and a
	// race that makes it exist is exactly what the unique index is for.
	try {
		await prisma.favorite.create({ data: { userId, motorcycleId } });
	} catch (error) {
		// Somebody else's tap won the race. The end state is what was asked for.
		if (!isUniqueViolation(error)) throw error;
	}
	return { favorited: true };
}

/** Explicitly set the state, for a UI that knows what it wants. */
export async function setFavorite(
	userId: string,
	motorcycleId: string,
	favorited: boolean
): Promise<{ favorited: boolean }> {
	if (favorited) {
		try {
			await prisma.favorite.create({ data: { userId, motorcycleId } });
		} catch (error) {
			if (!isUniqueViolation(error)) throw error;
		}
		return { favorited: true };
	}

	await prisma.favorite.deleteMany({ where: { userId, motorcycleId } });
	return { favorited: false };
}

function isUniqueViolation(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: string }).code === 'P2002'
	);
}

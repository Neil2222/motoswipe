import { prisma } from '$lib/server/db/client';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 50;

/**
 * Who exists, not what they swiped. Read-only like the rest of /admin: the
 * list answers "which accounts are on this box", and stops there. No password
 * hashes, no tokens, no session identifiers leave the server.
 */
export const load: PageServerLoad = async (event) => {
	const page = Math.max(Number(event.url.searchParams.get('page') ?? 1), 1);
	const query = (event.url.searchParams.get('q') ?? '').trim();
	// Guests are the demo accounts; they outnumber real users and are hidden
	// unless asked for.
	const includeGuests = event.url.searchParams.get('guests') === '1';

	const where = {
		...(includeGuests ? {} : { isGuest: false }),
		...(query
			? {
					OR: [
						{ email: { contains: query, mode: 'insensitive' as const } },
						{ username: { contains: query, mode: 'insensitive' as const } },
						{ displayName: { contains: query, mode: 'insensitive' as const } }
					]
				}
			: {})
	};

	const now = new Date();
	const [rows, total, guestCount] = await Promise.all([
		prisma.user.findMany({
			where,
			orderBy: { createdAt: 'desc' },
			skip: (page - 1) * PAGE_SIZE,
			take: PAGE_SIZE,
			select: {
				id: true,
				email: true,
				username: true,
				displayName: true,
				role: true,
				isGuest: true,
				emailVerifiedAt: true,
				createdAt: true,
				lastLoginAt: true,
				_count: { select: { rounds: true, favorites: true } }
			}
		}),
		prisma.user.count({ where }),
		prisma.user.count({ where: { isGuest: true } })
	]);

	// One query for the live sessions of the listed users only.
	const sessions = await prisma.authSession.groupBy({
		by: ['userId'],
		where: { userId: { in: rows.map((r) => r.id) }, expiresAt: { gt: now } },
		_count: { _all: true }
	});
	const sessionsBy = new Map(sessions.map((s) => [s.userId, s._count._all]));

	return {
		rows: rows.map((r) => ({ ...r, activeSessions: sessionsBy.get(r.id) ?? 0 })),
		total,
		guestCount,
		includeGuests,
		page,
		pageSize: PAGE_SIZE,
		pages: Math.max(Math.ceil(total / PAGE_SIZE), 1),
		query
	};
};

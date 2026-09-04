import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { prisma } from './db/client';
import { env } from './env';
import type { SessionUser } from '../../app.d.ts';

/**
 * Authorisation guards.
 *
 * THE RULE: no route handler may load round-scoped data without going through
 * `requireOwnedRound`. Changing `/rounds/<uuid>` to someone else's id must not
 * reveal anything — not the round, not its name, not that it exists.
 */

/** Signed-in user, or a redirect to login carrying the intended destination. */
export function requireUser(event: RequestEvent): SessionUser {
	const user = event.locals.user;
	if (!user) {
		const target = event.url.pathname + event.url.search;
		redirect(303, `/login?redirectTo=${encodeURIComponent(target)}`);
	}
	return user;
}

/** Signed-in user for an API endpoint: 401 JSON instead of a redirect. */
export function requireUserApi(event: RequestEvent): SessionUser {
	const user = event.locals.user;
	if (!user) error(401, { message: 'You need to sign in to do that' });
	return user;
}

export function requireAdmin(event: RequestEvent): SessionUser {
	const user = requireUser(event);
	if (user.role !== 'ADMIN') {
		// 404, not 403: an ordinary user has no business learning that /admin is
		// a real route on this instance.
		error(404, { message: 'Not found' });
	}
	return user;
}

export interface OwnedRound {
	id: string;
	userId: string;
	name: string;
	description: string | null;
	goal: string | null;
	status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
	visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC';
	filters: unknown;
	createdAt: Date;
	updatedAt: Date;
	completedAt: Date | null;
	archivedAt: Date | null;
}

/**
 * Loads a round only if it belongs to the signed-in user.
 *
 * Answers 404 for both "no such round" and "someone else's round" so a UUID
 * cannot be probed for existence. When the social layer arrives, read access
 * for PUBLIC/UNLISTED rounds gets added here and nowhere else — see
 * `requireRoundReadAccess` below, which is already the read-only seam.
 */
export async function requireOwnedRound(
	event: RequestEvent,
	roundId: string
): Promise<{ user: SessionUser; round: OwnedRound }> {
	const user = requireUser(event);

	if (!isUuid(roundId)) error(404, { message: 'Round not found' });

	const round = await prisma.discoveryRound.findUnique({ where: { id: roundId } });

	if (!round || round.userId !== user.id) {
		error(404, { message: 'Round not found' });
	}

	return { user, round: round as OwnedRound };
}

/** API variant: JSON 404/401 rather than an HTML error page. */
export async function requireOwnedRoundApi(
	event: RequestEvent,
	roundId: string
): Promise<{ user: SessionUser; round: OwnedRound }> {
	const user = requireUserApi(event);

	if (!isUuid(roundId)) error(404, { message: 'Round not found' });

	const round = await prisma.discoveryRound.findUnique({ where: { id: roundId } });
	if (!round || round.userId !== user.id) error(404, { message: 'Round not found' });

	return { user, round: round as OwnedRound };
}

/**
 * Read access to a round.
 *
 * Today this is exactly ownership. It exists as a separate function so that
 * when public/unlisted rounds ship, the visibility rules land in one place
 * instead of being sprinkled across every load function.
 *
 * Future shape:
 *   - owner            → always
 *   - PUBLIC           → anyone
 *   - UNLISTED         → anyone holding the id
 *   - PRIVATE          → owner only
 */
export async function requireRoundReadAccess(
	event: RequestEvent,
	roundId: string
): Promise<{ user: SessionUser; round: OwnedRound }> {
	return requireOwnedRound(event, roundId);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Guards Prisma against a malformed uuid reaching a `@db.Uuid` column, which
 * Postgres answers with a 22P02 error and we would surface as a 500.
 */
export function isUuid(value: string): boolean {
	return UUID_RE.test(value);
}

/**
 * A stable key for rate limiting.
 *
 * `event.getClientAddress()` is only trustworthy when adapter-node knows how
 * many proxies sit in front (ADDRESS_HEADER / XFF_DEPTH). When TRUST_PROXY_HOPS
 * is 0 and we are actually behind a proxy, every request looks like it comes
 * from the proxy — the limiter then throttles everyone together, which is
 * degraded but safe. Never the reverse.
 */
export function clientKey(event: RequestEvent): string {
	try {
		return event.getClientAddress();
	} catch {
		return 'unknown';
	}
}

export { env };

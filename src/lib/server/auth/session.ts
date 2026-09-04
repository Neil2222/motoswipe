import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { prisma } from '../db/client';
import { env } from '../env';
import type { SessionUser } from '../../../app.d.ts';

export const SESSION_COOKIE = 'motoswipe_session';

const TTL_MS = env.sessionTtlDays * 24 * 60 * 60 * 1000;
/**
 * Sliding expiry: once a session is past its halfway point, using it pushes the
 * expiry back out. Frequent users are never logged out mid-swipe; abandoned
 * sessions still die on schedule.
 */
const RENEW_THRESHOLD_MS = TTL_MS / 2;

/**
 * The raw token goes to the browser; only its HMAC lands in the database.
 *
 * HMAC rather than a plain SHA-256 so that a read-only database leak is not
 * enough to forge a session — the attacker also needs SESSION_SECRET, which
 * lives in the environment. It is keyed and fixed-length, so lookup stays a
 * single indexed query.
 */
function hashToken(token: string): string {
	return createHmac('sha256', env.sessionSecret).update(token).digest('hex');
}

function newToken(): string {
	// 32 bytes = 256 bits of entropy, base64url so it is cookie-safe.
	return randomBytes(32).toString('base64url');
}

export interface CreatedSession {
	sessionId: string;
	token: string;
	expiresAt: Date;
}

export async function createSession(
	userId: string,
	userAgent: string | null
): Promise<CreatedSession> {
	const token = newToken();
	const expiresAt = new Date(Date.now() + TTL_MS);

	const session = await prisma.authSession.create({
		data: {
			userId,
			tokenHash: hashToken(token),
			expiresAt,
			// Truncated: it is only there so a user can recognise their own devices
			// on a future "active sessions" screen.
			userAgent: userAgent ? userAgent.slice(0, 255) : null
		},
		select: { id: true }
	});

	return { sessionId: session.id, token, expiresAt };
}

export interface ResolvedSession {
	user: SessionUser;
	sessionId: string;
}

/**
 * Resolves a raw cookie token to a user, renewing the session when it is past
 * halfway. Returns null for missing, unknown or expired tokens.
 */
export async function validateSession(token: string): Promise<ResolvedSession | null> {
	if (!token) return null;

	const session = await prisma.authSession.findUnique({
		where: { tokenHash: hashToken(token) },
		select: {
			id: true,
			expiresAt: true,
			user: {
				select: {
					id: true,
					email: true,
					username: true,
					displayName: true,
					role: true
				}
			}
		}
	});

	if (!session) return null;

	if (session.expiresAt.getTime() <= Date.now()) {
		// Clean up as we go; the sweeper below is only a backstop.
		await prisma.authSession.delete({ where: { id: session.id } }).catch(() => {});
		return null;
	}

	if (session.expiresAt.getTime() - Date.now() < RENEW_THRESHOLD_MS) {
		await prisma.authSession
			.update({
				where: { id: session.id },
				data: { expiresAt: new Date(Date.now() + TTL_MS) }
			})
			.catch(() => {});
	}

	return { user: session.user, sessionId: session.id };
}

export async function revokeSession(sessionId: string): Promise<void> {
	await prisma.authSession.delete({ where: { id: sessionId } }).catch(() => {});
}

/** Used after a password change: every other device is signed out. */
export async function revokeAllSessionsForUser(userId: string, exceptId?: string): Promise<number> {
	const result = await prisma.authSession.deleteMany({
		where: { userId, ...(exceptId ? { NOT: { id: exceptId } } : {}) }
	});
	return result.count;
}

/** Housekeeping. Called opportunistically from hooks, never on the hot path. */
export async function purgeExpiredSessions(): Promise<number> {
	const result = await prisma.authSession.deleteMany({
		where: { expiresAt: { lt: new Date() } }
	});
	return result.count;
}

// ---------------------------------------------------------------------------
// Cookie handling
// ---------------------------------------------------------------------------

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		// Lax, not Strict: Strict would drop the cookie when a user follows a link
		// to MotoSwipe from anywhere else and land them on the login page. Lax
		// still blocks the cross-site POSTs that matter for CSRF.
		sameSite: 'lax',
		// Browsers reject Secure cookies over plain http, which would break a
		// local `npm run dev` on http://localhost.
		secure: env.isProduction,
		expires: expiresAt
	});
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: env.isProduction
	});
}

/** Constant-time string compare, for anything token-shaped outside Prisma. */
export function safeEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) return false;
	return timingSafeEqual(bufA, bufB);
}

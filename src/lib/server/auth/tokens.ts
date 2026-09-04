import { createHmac, randomBytes } from 'node:crypto';
import { prisma } from '../db/client';
import { env } from '../env';

/**
 * Single-use tokens sent by email: password reset and address verification.
 *
 * Same discipline as sessions. The browser gets the raw token in a link; the
 * database stores only its HMAC, keyed with SESSION_SECRET, so neither a
 * database leak nor a log line holding the hash can be turned into a reset.
 * A token is consumed exactly once, and issuing a new one of the same kind
 * invalidates the older ones — a user who clicks "send again" should not have
 * three live reset links in their inbox.
 */

export type TokenKind = 'PASSWORD_RESET' | 'EMAIL_VERIFY';

export const TOKEN_TTL_MS: Record<TokenKind, number> = {
	PASSWORD_RESET: 60 * 60 * 1000, // 1 hour
	EMAIL_VERIFY: 3 * 24 * 60 * 60 * 1000 // 3 days
};

function hashToken(token: string): string {
	return createHmac('sha256', env.sessionSecret).update(`token:${token}`).digest('hex');
}

/** Issues a fresh token for the user, replacing any live ones of that kind. */
export async function issueToken(userId: string, kind: TokenKind): Promise<string> {
	const token = randomBytes(32).toString('base64url');
	const expiresAt = new Date(Date.now() + TOKEN_TTL_MS[kind]);

	await prisma.$transaction([
		prisma.userToken.deleteMany({ where: { userId, kind, usedAt: null } }),
		prisma.userToken.create({ data: { userId, kind, tokenHash: hashToken(token), expiresAt } })
	]);

	return token;
}

/**
 * Looks a token up without consuming it, so a reset page can refuse an expired
 * link before asking for a new password.
 */
export async function peekToken(
	token: string,
	kind: TokenKind
): Promise<{ userId: string } | null> {
	if (!token || token.length > 200) return null;

	const row = await prisma.userToken.findUnique({
		where: { tokenHash: hashToken(token) },
		select: { userId: true, kind: true, expiresAt: true, usedAt: true }
	});
	if (!row || row.kind !== kind || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
		return null;
	}
	return { userId: row.userId };
}

/**
 * Consumes a token: marks it used and returns the user it belonged to, or null
 * when it is unknown, expired, of another kind, or already spent.
 */
export async function consumeToken(
	token: string,
	kind: TokenKind
): Promise<{ userId: string } | null> {
	if (!token || token.length > 200) return null;

	const tokenHash = hashToken(token);
	const now = new Date();

	// The conditional update is the atomic claim: two simultaneous clicks on
	// the same link cannot both succeed.
	const result = await prisma.userToken.updateMany({
		where: { tokenHash, kind, usedAt: null, expiresAt: { gt: now } },
		data: { usedAt: now }
	});
	if (result.count === 0) return null;

	const row = await prisma.userToken.findUnique({
		where: { tokenHash },
		select: { userId: true }
	});
	return row ? { userId: row.userId } : null;
}

/** Housekeeping: drops expired and spent tokens. */
export async function purgeStaleTokens(): Promise<number> {
	const result = await prisma.userToken.deleteMany({
		where: {
			OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }]
		}
	});
	return result.count;
}

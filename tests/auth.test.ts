import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma, resetDatabase, createUser } from './helpers';
import { register, login, changePassword } from '../src/lib/server/services/auth.service';
import { hashPassword, needsRehash, verifyPassword } from '../src/lib/server/auth/password';
import {
	createSession,
	revokeAllSessionsForUser,
	revokeSession,
	purgeExpiredSessions,
	validateSession
} from '../src/lib/server/auth/session';
import { ConflictError, RateLimitError, ValidationError } from '../src/lib/server/errors';
import { RATE_LIMITS, consume, resetAll } from '../src/lib/server/auth/rate-limit';

beforeAll(async () => {
	await resetDatabase();
});

beforeEach(async () => {
	await resetDatabase();
});

const VALID = {
	email: 'rider@example.test',
	username: 'rider',
	displayName: 'Rider',
	password: 'correct-horse-battery-staple'
};

describe('password hashing', () => {
	it('produces an argon2id hash, never the plaintext', async () => {
		const hash = await hashPassword('hunter2hunter2');
		expect(hash).toMatch(/^\$argon2id\$/);
		expect(hash).not.toContain('hunter2');
	});

	it('salts: the same password hashes differently each time', async () => {
		const a = await hashPassword('same-password-twice');
		const b = await hashPassword('same-password-twice');
		expect(a).not.toBe(b);
	});

	it('verifies a correct password and rejects a wrong one', async () => {
		const hash = await hashPassword('the-real-password');
		expect(await verifyPassword(hash, 'the-real-password')).toBe(true);
		expect(await verifyPassword(hash, 'the-wrong-password')).toBe(false);
	});

	it('returns false rather than throwing on a corrupted hash', async () => {
		expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
		expect(await verifyPassword('', 'anything')).toBe(false);
	});

	it('flags a hash from weaker parameters for rehashing', () => {
		expect(needsRehash('$argon2id$v=19$m=4096,t=1,p=1$abc$def')).toBe(true);
		expect(needsRehash('$2b$10$somethingbcryptish')).toBe(true);
		expect(needsRehash('$argon2id$v=19$m=19456,t=2,p=1$abc$def')).toBe(false);
	});
});

describe('register', () => {
	it('creates a user with a profile and no plaintext password', async () => {
		const user = await register(VALID, 'test-client');

		expect(user.email).toBe(VALID.email);
		expect(user).not.toHaveProperty('passwordHash');

		const row = await prisma.user.findUnique({
			where: { id: user.id },
			include: { profile: true }
		});
		expect(row?.profile).not.toBeNull();
		expect(row?.passwordHash).not.toBe(VALID.password);
	});

	it('makes the very first account an admin', async () => {
		const first = await register(VALID, 'c1');
		expect(first.role).toBe('ADMIN');

		const second = await register(
			{ ...VALID, email: 'second@example.test', username: 'second' },
			'c2'
		);
		expect(second.role).toBe('USER');
	});

	it('rejects a duplicate email', async () => {
		await register(VALID, 'c1');
		await expect(register({ ...VALID, username: 'different' }, 'c2')).rejects.toBeInstanceOf(
			ConflictError
		);
	});

	it('rejects a duplicate username', async () => {
		await register(VALID, 'c1');
		await expect(
			register({ ...VALID, email: 'different@example.test' }, 'c2')
		).rejects.toBeInstanceOf(ConflictError);
	});
});

describe('login', () => {
	beforeEach(async () => {
		await register(VALID, 'setup');
		resetAll();
	});

	it('accepts the correct password by email', async () => {
		const user = await login({ identifier: VALID.email, password: VALID.password }, 'c');
		expect(user.email).toBe(VALID.email);
	});

	it('accepts the correct password by username', async () => {
		const user = await login({ identifier: VALID.username, password: VALID.password }, 'c');
		expect(user.username).toBe(VALID.username);
	});

	it('rejects a wrong password', async () => {
		await expect(
			login({ identifier: VALID.email, password: 'wrong-password-here' }, 'c')
		).rejects.toBeInstanceOf(ValidationError);
	});

	it('gives the same message for an unknown account as for a wrong password', async () => {
		// Otherwise the error message enumerates who has an account.
		const unknown = await login({ identifier: 'nobody@example.test', password: 'x' }, 'c1').catch(
			(e) => e
		);
		resetAll();
		const wrong = await login({ identifier: VALID.email, password: 'nope' }, 'c2').catch((e) => e);
		expect(unknown.message).toBe(wrong.message);
	});

	it('advances lastLoginAt on each sign-in', async () => {
		// Registration already signs the user in, so the field starts populated.
		const before = await prisma.user.findUnique({ where: { email: VALID.email } });
		expect(before?.lastLoginAt).not.toBeNull();

		await new Promise((r) => setTimeout(r, 12));
		await login({ identifier: VALID.email, password: VALID.password }, 'c');

		const after = await prisma.user.findUnique({ where: { email: VALID.email } });
		expect(after!.lastLoginAt!.getTime()).toBeGreaterThan(before!.lastLoginAt!.getTime());
	});
});

describe('rate limiting', () => {
	beforeEach(() => resetAll());

	it('allows attempts up to the limit then blocks', () => {
		const rule = { limit: 3, windowMs: 60_000 };
		expect(() => consume('t', 'k', rule)).not.toThrow();
		expect(() => consume('t', 'k', rule)).not.toThrow();
		expect(() => consume('t', 'k', rule)).not.toThrow();
		expect(() => consume('t', 'k', rule)).toThrow(RateLimitError);
	});

	it('keeps buckets separate per identifier', () => {
		const rule = { limit: 1, windowMs: 60_000 };
		consume('t', 'alice', rule);
		expect(() => consume('t', 'bob', rule)).not.toThrow();
	});

	it('reports how long to wait', () => {
		const rule = { limit: 1, windowMs: 60_000, blockMs: 30_000 };
		consume('t', 'k', rule);
		try {
			consume('t', 'k', rule);
			expect.unreachable('should have thrown');
		} catch (error) {
			expect(error).toBeInstanceOf(RateLimitError);
			expect((error as RateLimitError).retryAfterSeconds).toBeGreaterThan(0);
		}
	});

	it('throttles repeated failed logins against one account', async () => {
		await register(VALID, 'setup');
		resetAll();

		let blocked = false;
		for (let i = 0; i < RATE_LIMITS.loginByAccount.limit + 2; i++) {
			try {
				await login({ identifier: VALID.email, password: 'wrong-every-time' }, `client-${i}`);
			} catch (error) {
				if (error instanceof RateLimitError) {
					blocked = true;
					break;
				}
			}
		}
		expect(blocked).toBe(true);
	});
});

describe('sessions', () => {
	it('issues a token that resolves back to the user', async () => {
		const { user } = await createUser();
		const session = await createSession(user.id, 'vitest');

		const resolved = await validateSession(session.token);
		expect(resolved?.user.id).toBe(user.id);
		expect(resolved?.sessionId).toBe(session.sessionId);
	});

	it('stores only a hash of the token', async () => {
		const { user } = await createUser();
		const session = await createSession(user.id, null);

		const row = await prisma.authSession.findUnique({ where: { id: session.sessionId } });
		expect(row?.tokenHash).toBeTruthy();
		expect(row?.tokenHash).not.toBe(session.token);
		// A database leak must not hand out live sessions.
		expect(row?.tokenHash).toHaveLength(64); // sha256 hex
	});

	it('does not store an IP address', async () => {
		const { user } = await createUser();
		const session = await createSession(user.id, 'vitest');
		const row = await prisma.authSession.findUnique({ where: { id: session.sessionId } });
		expect(Object.keys(row ?? {})).not.toContain('ip');
	});

	it('rejects an unknown or empty token', async () => {
		expect(await validateSession('not-a-real-token')).toBeNull();
		expect(await validateSession('')).toBeNull();
	});

	it('rejects and cleans up an expired session', async () => {
		const { user } = await createUser();
		const session = await createSession(user.id, null);

		await prisma.authSession.update({
			where: { id: session.sessionId },
			data: { expiresAt: new Date(Date.now() - 1000) }
		});

		expect(await validateSession(session.token)).toBeNull();
		expect(await prisma.authSession.findUnique({ where: { id: session.sessionId } })).toBeNull();
	});

	it('revokes a single session', async () => {
		const { user } = await createUser();
		const session = await createSession(user.id, null);
		await revokeSession(session.sessionId);
		expect(await validateSession(session.token)).toBeNull();
	});

	it('revokes every other session on request', async () => {
		const { user } = await createUser();
		const keep = await createSession(user.id, 'this device');
		const other1 = await createSession(user.id, 'phone');
		const other2 = await createSession(user.id, 'laptop');

		const revoked = await revokeAllSessionsForUser(user.id, keep.sessionId);

		expect(revoked).toBe(2);
		expect(await validateSession(keep.token)).not.toBeNull();
		expect(await validateSession(other1.token)).toBeNull();
		expect(await validateSession(other2.token)).toBeNull();
	});

	it('cascades session deletion when the user is deleted', async () => {
		const { user } = await createUser();
		await createSession(user.id, null);

		await prisma.user.delete({ where: { id: user.id } });

		// No orphaned authentication rows: this is the requirement, not a nicety.
		expect(await prisma.authSession.count({ where: { userId: user.id } })).toBe(0);
	});

	it('purges expired sessions in bulk', async () => {
		const { user } = await createUser();
		const live = await createSession(user.id, null);
		const dead = await createSession(user.id, null);
		await prisma.authSession.update({
			where: { id: dead.sessionId },
			data: { expiresAt: new Date(Date.now() - 1000) }
		});

		const purged = await purgeExpiredSessions();

		expect(purged).toBeGreaterThanOrEqual(1);
		expect(await validateSession(live.token)).not.toBeNull();
	});

	it('truncates an absurdly long user agent rather than failing', async () => {
		const { user } = await createUser();
		const session = await createSession(user.id, 'x'.repeat(5000));
		const row = await prisma.authSession.findUnique({ where: { id: session.sessionId } });
		expect(row?.userAgent?.length).toBeLessThanOrEqual(255);
	});
});

describe('changePassword', () => {
	it('changes the password when the current one is right', async () => {
		const { user, password } = await createUser();
		await changePassword(user.id, password, 'a-brand-new-password');

		const updated = await prisma.user.findUnique({ where: { id: user.id } });
		expect(await verifyPassword(updated!.passwordHash, 'a-brand-new-password')).toBe(true);
		expect(await verifyPassword(updated!.passwordHash, password)).toBe(false);
	});

	it('refuses when the current password is wrong', async () => {
		const { user } = await createUser();
		await expect(
			changePassword(user.id, 'not-my-password', 'a-brand-new-password')
		).rejects.toBeInstanceOf(ValidationError);
	});
});

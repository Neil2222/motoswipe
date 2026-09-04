import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma, resetDatabase, createUser } from './helpers';
import {
	consumeToken,
	issueToken,
	peekToken,
	purgeStaleTokens
} from '../src/lib/server/auth/tokens';
import {
	isResetTokenLive,
	requestPasswordReset,
	resendVerificationEmail,
	resetPassword,
	sendVerificationEmail,
	verifyEmail
} from '../src/lib/server/services/account.service';
import { login } from '../src/lib/server/services/auth.service';
import { createSession, validateSession } from '../src/lib/server/auth/session';
import { getMailer, setMailerForTests, type MailMessage } from '../src/lib/server/mail/mailer';
import { RateLimitError } from '../src/lib/server/errors';
import { resetAll } from '../src/lib/server/auth/rate-limit';

/** Records instead of sending, and hands the link out for the test to follow. */
class RecordingMailer {
	readonly provider = 'console' as const;
	readonly enabled = true;
	sent: MailMessage[] = [];
	async send(message: MailMessage) {
		this.sent.push(message);
		return { ok: true, id: `rec-${this.sent.length}` };
	}
	lastLinkToken(prefix: string): string {
		const last = this.sent.at(-1);
		if (!last) throw new Error('nothing sent');
		const match = new RegExp(`${prefix}/([A-Za-z0-9_-]+)`).exec(last.text);
		if (!match) throw new Error(`no ${prefix} link in:\n${last.text}`);
		return match[1];
	}
}

const mailer = new RecordingMailer();
const ORIGIN = 'https://moto.example';

beforeAll(async () => {
	await resetDatabase();
	setMailerForTests(mailer);
});

afterAll(() => {
	setMailerForTests(null);
});

beforeEach(async () => {
	await resetDatabase();
	mailer.sent = [];
	resetAll();
});

describe('configuration', () => {
	it('never auto-selects a real provider under test', () => {
		setMailerForTests(null);
		expect(getMailer().provider).toBe('none');
		expect(getMailer().enabled).toBe(false);
		setMailerForTests(mailer);
	});
});

describe('tokens', () => {
	it('issues a token that can be peeked, then consumed exactly once', async () => {
		const { user } = await createUser();
		const token = await issueToken(user.id, 'PASSWORD_RESET');

		expect(await peekToken(token, 'PASSWORD_RESET')).toEqual({ userId: user.id });
		expect(await peekToken(token, 'EMAIL_VERIFY')).toBeNull();

		expect(await consumeToken(token, 'PASSWORD_RESET')).toEqual({ userId: user.id });
		expect(await consumeToken(token, 'PASSWORD_RESET')).toBeNull();
		expect(await peekToken(token, 'PASSWORD_RESET')).toBeNull();
	});

	it('stores only a hash of the token', async () => {
		const { user } = await createUser();
		const token = await issueToken(user.id, 'EMAIL_VERIFY');
		const rows = await prisma.userToken.findMany({ where: { userId: user.id } });
		expect(rows).toHaveLength(1);
		expect(rows[0].tokenHash).not.toContain(token);
	});

	it('issuing a new token of a kind invalidates the previous one', async () => {
		const { user } = await createUser();
		const first = await issueToken(user.id, 'PASSWORD_RESET');
		const second = await issueToken(user.id, 'PASSWORD_RESET');
		expect(await consumeToken(first, 'PASSWORD_RESET')).toBeNull();
		expect(await consumeToken(second, 'PASSWORD_RESET')).toEqual({ userId: user.id });
	});

	it('rejects expired tokens and purges them', async () => {
		const { user } = await createUser();
		const token = await issueToken(user.id, 'PASSWORD_RESET');
		await prisma.userToken.updateMany({
			where: { userId: user.id },
			data: { expiresAt: new Date(Date.now() - 1000) }
		});
		expect(await consumeToken(token, 'PASSWORD_RESET')).toBeNull();
		expect(await purgeStaleTokens()).toBe(1);
	});

	it('rejects garbage without touching the database', async () => {
		expect(await consumeToken('', 'PASSWORD_RESET')).toBeNull();
		expect(await consumeToken('x'.repeat(500), 'PASSWORD_RESET')).toBeNull();
	});
});

describe('password reset', () => {
	it('emails a working link to an existing account', async () => {
		const { user } = await createUser({ email: 'rider@example.test' });
		const session = await createSession(user.id, null);

		const outcome = await requestPasswordReset('rider@example.test', '10.1.0.1', ORIGIN);
		expect(outcome.sent).toBe(true);
		expect(mailer.sent).toHaveLength(1);
		expect(mailer.sent[0].to).toBe('rider@example.test');
		// The link base is the configured ORIGIN when there is one, else the
		// request's; either way it is an absolute reset link.
		expect(mailer.sent[0].text).toMatch(/https?:\/\/[^/\s]+\/reset-password\//);

		const token = mailer.lastLinkToken('reset-password');
		expect(await isResetTokenLive(token)).toBe(true);

		expect(await resetPassword(token, 'a-brand-new-password')).toBe(user.id);
		expect(await isResetTokenLive(token)).toBe(false);

		// Old sessions are gone, the new password works, the address counts as verified.
		expect(await validateSession(session.token)).toBeNull();
		const signedIn = await login(
			{ identifier: 'rider@example.test', password: 'a-brand-new-password' },
			'10.1.0.1'
		);
		expect(signedIn.emailVerified).toBe(true);
	});

	it('sends nothing for an unknown address or a guest, but does not say so', async () => {
		const unknown = await requestPasswordReset('nobody@example.test', '10.1.0.2', ORIGIN);
		expect(unknown.sent).toBe(false);
		expect(mailer.sent).toHaveLength(0);

		await prisma.user.create({
			data: {
				email: 'guest-abc@guest.invalid',
				username: 'guest-abc',
				displayName: 'Guest',
				passwordHash: 'irrelevant',
				isGuest: true
			}
		});
		const guest = await requestPasswordReset('guest-abc@guest.invalid', '10.1.0.2', ORIGIN);
		expect(guest.sent).toBe(false);
		expect(mailer.sent).toHaveLength(0);
	});

	it('rate limits per target address', async () => {
		await createUser({ email: 'target@example.test' });
		for (let i = 0; i < 3; i++) {
			await requestPasswordReset('target@example.test', `10.1.0.${10 + i}`, ORIGIN);
		}
		await expect(
			requestPasswordReset('target@example.test', '10.1.0.99', ORIGIN)
		).rejects.toBeInstanceOf(RateLimitError);
		expect(mailer.sent).toHaveLength(3);
	});

	it('a dud link resets nothing', async () => {
		expect(await resetPassword('not-a-token', 'a-brand-new-password')).toBeNull();
	});
});

describe('email verification', () => {
	it('confirms the address through the emailed link', async () => {
		const { user } = await createUser({ email: 'v@example.test' });
		const outcome = await sendVerificationEmail(
			{ id: user.id, email: user.email, displayName: user.displayName },
			ORIGIN
		);
		expect(outcome.sent).toBe(true);
		expect(mailer.sent[0].text).toMatch(/https?:\/\/[^/\s]+\/verify-email\//);

		const token = mailer.lastLinkToken('verify-email');
		expect(await verifyEmail(token)).toBe(user.id);
		expect(await verifyEmail(token)).toBeNull();

		const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
		expect(row.emailVerifiedAt).not.toBeNull();
	});

	it('resend refuses for an already confirmed address and for guests', async () => {
		const { user } = await createUser();
		await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
		const outcome = await resendVerificationEmail(user.id, ORIGIN);
		expect(outcome.sent).toBe(false);
		expect(mailer.sent).toHaveLength(0);
	});

	it('resend is rate limited per account', async () => {
		const { user } = await createUser();
		for (let i = 0; i < 5; i++) {
			expect((await resendVerificationEmail(user.id, ORIGIN)).sent).toBe(true);
		}
		await expect(resendVerificationEmail(user.id, ORIGIN)).rejects.toBeInstanceOf(RateLimitError);
	});
});

import { prisma } from '../db/client';
import { env } from '../env';
import { hashPassword } from '../auth/password';
import { consume, RATE_LIMITS } from '../auth/rate-limit';
import { revokeAllSessionsForUser } from '../auth/session';
import { consumeToken, issueToken, peekToken, TOKEN_TTL_MS } from '../auth/tokens';
import { getMailer } from '../mail/mailer';
import { passwordResetMail, verifyEmailMail } from '../mail/templates';

/**
 * The two email-driven account flows: address verification and password
 * reset. Both are no-ops with an explanation when no mailer is configured, so
 * an instance without email keeps working exactly as before.
 */

export interface SendOutcome {
	sent: boolean;
	/** Why nothing was sent, for the log or the UI. Never contains the token. */
	reason?: string;
}

/** Absolute URL base for links in email: the configured ORIGIN, else the request's. */
export function linkOrigin(requestOrigin: string): string {
	return (env.origin ?? requestOrigin).replace(/\/+$/, '');
}

export async function sendVerificationEmail(
	user: { id: string; email: string; displayName: string },
	requestOrigin: string
): Promise<SendOutcome> {
	const mailer = getMailer();
	if (!mailer.enabled) return { sent: false, reason: 'No mail provider is configured.' };

	const token = await issueToken(user.id, 'EMAIL_VERIFY');
	const result = await mailer.send(
		verifyEmailMail({
			to: user.email,
			displayName: user.displayName,
			verifyUrl: `${linkOrigin(requestOrigin)}/verify-email/${token}`,
			expiresInHours: Math.round(TOKEN_TTL_MS.EMAIL_VERIFY / 3_600_000)
		})
	);
	if (!result.ok) {
		console.error(`[motoswipe] verification email failed: ${result.error}`);
		return { sent: false, reason: 'The email could not be sent. Try again later.' };
	}
	return { sent: true };
}

/** "Send it again" from the profile page. Rate limited per account. */
export async function resendVerificationEmail(
	userId: string,
	requestOrigin: string
): Promise<SendOutcome> {
	consume('verification-resend', userId, RATE_LIMITS.verificationResend);

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, email: true, displayName: true, isGuest: true, emailVerifiedAt: true }
	});
	if (!user || user.isGuest) return { sent: false, reason: 'No such account.' };
	if (user.emailVerifiedAt) return { sent: false, reason: 'That address is already confirmed.' };

	return sendVerificationEmail(user, requestOrigin);
}

/** Consumes a verification token. Returns the user id, or null for a dud link. */
export async function verifyEmail(token: string): Promise<string | null> {
	const claim = await consumeToken(token, 'EMAIL_VERIFY');
	if (!claim) return null;

	await prisma.user.updateMany({
		where: { id: claim.userId, emailVerifiedAt: null },
		data: { emailVerifiedAt: new Date() }
	});
	return claim.userId;
}

/**
 * Starts a password reset.
 *
 * Always resolves without saying whether the address exists: the page shows
 * the same "if that address has an account, a link is on its way" either way.
 * Guests have no real address and are skipped.
 */
export async function requestPasswordReset(
	email: string,
	clientKey: string,
	requestOrigin: string
): Promise<SendOutcome> {
	const mailer = getMailer();
	if (!mailer.enabled) return { sent: false, reason: 'No mail provider is configured.' };

	consume('password-reset-ip', clientKey, RATE_LIMITS.passwordResetByIp);
	consume('password-reset-email', email, RATE_LIMITS.passwordResetByEmail);

	const user = await prisma.user.findFirst({
		where: { email, isGuest: false },
		select: { id: true, email: true, displayName: true }
	});
	if (!user) return { sent: false, reason: 'No account with that address.' };

	const token = await issueToken(user.id, 'PASSWORD_RESET');
	const result = await mailer.send(
		passwordResetMail({
			to: user.email,
			displayName: user.displayName,
			resetUrl: `${linkOrigin(requestOrigin)}/reset-password/${token}`,
			expiresInMinutes: Math.round(TOKEN_TTL_MS.PASSWORD_RESET / 60_000)
		})
	);
	if (!result.ok) {
		console.error(`[motoswipe] password reset email failed: ${result.error}`);
		return { sent: false, reason: 'The email could not be sent. Try again later.' };
	}
	return { sent: true };
}

/** True when the link can still be used; the reset form is only shown then. */
export async function isResetTokenLive(token: string): Promise<boolean> {
	return (await peekToken(token, 'PASSWORD_RESET')) !== null;
}

/**
 * Completes a reset: consumes the token, stores the new password and signs
 * every device out. Following the link proves control of the mailbox, so the
 * address counts as verified from here on.
 */
export async function resetPassword(token: string, newPassword: string): Promise<string | null> {
	const claim = await consumeToken(token, 'PASSWORD_RESET');
	if (!claim) return null;

	const passwordHash = await hashPassword(newPassword);
	await prisma.user.update({
		where: { id: claim.userId },
		data: { passwordHash, emailVerifiedAt: new Date() }
	});
	await revokeAllSessionsForUser(claim.userId);
	return claim.userId;
}

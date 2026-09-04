import { prisma } from '../db/client';
import { env } from '../env';
import { equalizeLoginTiming, hashPassword, needsRehash, verifyPassword } from '../auth/password';
import { consume, RATE_LIMITS, registerRule, reset } from '../auth/rate-limit';
import { ConflictError, ForbiddenError, ValidationError } from '../errors';
import type { RegisterInput, LoginInput } from '$lib/domain/validation';
import type { SessionUser } from '../../../app.d.ts';

/**
 * Registration, login and password changes.
 *
 * Session creation itself lives in `auth/session.ts`; this service decides
 * *whether* a session should be created.
 */

function toSessionUser(u: {
	id: string;
	email: string;
	username: string;
	displayName: string;
	role: 'USER' | 'ADMIN';
	isGuest: boolean;
	emailVerifiedAt: Date | null;
}): SessionUser {
	return {
		id: u.id,
		email: u.email,
		username: u.username,
		displayName: u.displayName,
		role: u.role,
		isGuest: u.isGuest,
		emailVerified: u.emailVerifiedAt !== null
	};
}

export async function register(input: RegisterInput, clientKey: string): Promise<SessionUser> {
	if (!env.allowRegistration) {
		throw new ForbiddenError('Registration is closed on this instance.');
	}

	consume('register', clientKey, registerRule());

	const existing = await prisma.user.findFirst({
		where: { OR: [{ email: input.email }, { username: input.username }] },
		select: { email: true, username: true }
	});

	if (existing) {
		// Enumeration note: this instance is a small self-hosted app where a
		// "that email is taken" message is genuinely more useful than the privacy
		// gained by hiding it — the alternative (silently accepting, then
		// emailing) needs an SMTP dependency the deployment target does not have.
		throw new ConflictError(
			existing.email === input.email
				? 'An account with that email already exists.'
				: 'That username is already taken.'
		);
	}

	const passwordHash = await hashPassword(input.password);

	// The very first account becomes the admin. Otherwise a fresh self-hosted
	// instance has no way to reach /admin without a manual SQL update. Guests
	// do not count: somebody trying the demo before you has not taken your seat.
	const isFirstUser = (await prisma.user.count({ where: { isGuest: false } })) === 0;

	const user = await prisma.user.create({
		data: {
			email: input.email,
			username: input.username,
			displayName: input.displayName,
			passwordHash,
			role: isFirstUser ? 'ADMIN' : 'USER',
			lastLoginAt: new Date(),
			// Created eagerly so the profile page never has to handle "no row yet".
			profile: { create: {} }
		},
		select: {
			id: true,
			email: true,
			username: true,
			displayName: true,
			role: true,
			isGuest: true,
			emailVerifiedAt: true
		}
	});

	return toSessionUser(user);
}

export async function login(input: LoginInput, clientKey: string): Promise<SessionUser> {
	consume('login-ip', clientKey, RATE_LIMITS.loginByIp);
	consume('login-account', input.identifier, RATE_LIMITS.loginByAccount);

	const user = await prisma.user.findFirst({
		where: {
			OR: [{ email: input.identifier }, { username: input.identifier }],
			// A guest's password is random and unknown to anyone; refusing the
			// row outright means a guessed guest handle cannot even be attempted.
			isGuest: false
		},
		select: {
			id: true,
			email: true,
			username: true,
			displayName: true,
			role: true,
			isGuest: true,
			emailVerifiedAt: true,
			passwordHash: true
		}
	});

	if (!user) {
		// Burn the same CPU we would have spent verifying, so response time does
		// not reveal whether the account exists.
		await equalizeLoginTiming(input.password);
		throw new ValidationError('Incorrect email/username or password.', {
			_: 'Incorrect email/username or password.'
		});
	}

	const ok = await verifyPassword(user.passwordHash, input.password);
	if (!ok) {
		throw new ValidationError('Incorrect email/username or password.', {
			_: 'Incorrect email/username or password.'
		});
	}

	reset('login-ip', clientKey);
	reset('login-account', input.identifier);

	// Opportunistic upgrade when hashing parameters have been raised since the
	// password was set.
	const rehash = needsRehash(user.passwordHash)
		? { passwordHash: await hashPassword(input.password) }
		: {};

	await prisma.user.update({
		where: { id: user.id },
		data: { lastLoginAt: new Date(), ...rehash }
	});

	return toSessionUser(user);
}

export async function changePassword(
	userId: string,
	currentPassword: string,
	newPassword: string
): Promise<void> {
	consume('password-change', userId, RATE_LIMITS.passwordChange);

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { passwordHash: true }
	});
	if (!user) throw new ForbiddenError();

	const ok = await verifyPassword(user.passwordHash, currentPassword);
	if (!ok) {
		throw new ValidationError('That is not your current password.', {
			currentPassword: 'That is not your current password.'
		});
	}

	await prisma.user.update({
		where: { id: userId },
		data: { passwordHash: await hashPassword(newPassword) }
	});
}

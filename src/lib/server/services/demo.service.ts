import { randomBytes } from 'node:crypto';
import { prisma } from '../db/client';
import { env } from '../env';
import { hashPassword } from '../auth/password';
import { consume, demoRule, registerRule } from '../auth/rate-limit';
import { ConflictError, ForbiddenError, ValidationError } from '../errors';
import type { RegisterInput } from '$lib/domain/validation';
import type { SessionUser } from '../../../app.d.ts';

/**
 * The demo: one round over the most popular motorcycles, for a visitor who has
 * not signed up.
 *
 * Rather than a second, client-side implementation of swiping, comparing and
 * Elo, the demo is an ordinary round owned by a *guest* account that is
 * created silently. The session cookie makes it resumable for weeks; claiming
 * it (choosing an email and password) turns the guest into a full account with
 * the round intact; discarding it deletes everything. Guests nobody came back
 * for are purged by the hourly housekeeping.
 */

/** Cards in the demo deck. */
export const DEMO_DECK_SIZE = 20;

/**
 * Comparisons a demo asks for before showing the result. A full round
 * suggests n·log2(n), which for twenty liked bikes is close to ninety —
 * fine for a decision, far too many for a taste of the product.
 */
export const DEMO_COMPARISON_TARGET = 6;

export const DEMO_ROUND_NAME = 'Demo: the 20 most popular bikes';
const DEMO_ROUND_GOAL =
	'A taste of MotoSwipe: the motorcycles most often registered new in the Netherlands since 2020, plus the Kawasaki Z900.';

/** The audit's definition of "modern": on sale in or after this year. */
const MODERN_SINCE = 2020;

export interface DemoCandidate {
	id: string;
	familyId: string | null;
	registrationCount: number | null;
	manufacturerName: string;
	model: string;
}

function isZ900(candidate: DemoCandidate): boolean {
	return (
		candidate.manufacturerName.toLowerCase() === 'kawasaki' &&
		/^z\s?900$/i.test(candidate.model.trim())
	);
}

/**
 * Picks the demo deck from candidates already sorted by registrations, most
 * first.
 *
 * One card per model family: the MT-07 has three generations on the modern
 * list and a demo of "the twenty most popular bikes" should not spend three
 * cards on it. Where a family is unknown the generation stands on its own.
 * The Kawasaki Z900 is guaranteed a place when it is a candidate at all — it
 * is the bike this project was started for — but only from the eligible
 * candidates: a Z900 without a trustworthy card is not smuggled in.
 */
export function pickDemoDeck(
	candidates: readonly DemoCandidate[],
	size = DEMO_DECK_SIZE
): DemoCandidate[] {
	const picked: DemoCandidate[] = [];
	const families = new Set<string>();

	for (const candidate of candidates) {
		if (picked.length >= size) break;
		const key = candidate.familyId ?? `id:${candidate.id}`;
		if (families.has(key)) continue;
		families.add(key);
		picked.push(candidate);
	}

	if (!picked.some(isZ900)) {
		const z900 = candidates.find(isZ900);
		if (z900) {
			if (picked.length >= size) picked.pop();
			picked.push(z900);
		}
	}

	return picked;
}

/**
 * Caps the suggested comparison count for a guest. The pair selection and
 * the Elo table are untouched; only the target the progress bar aims at
 * shrinks, so a claimed round simply continues with the full target.
 */
export function demoComparison<T extends { suggested: number } | null>(
	user: { isGuest: boolean },
	comparison: T
): T {
	if (!user.isGuest || !comparison) return comparison;
	return { ...comparison, suggested: Math.min(comparison.suggested, DEMO_COMPARISON_TARGET) };
}

/** The catalogue rows the deck is chosen from, in registration order. */
export async function demoCandidates(): Promise<DemoCandidate[]> {
	const rows = await prisma.motorcycle.findMany({
		where: {
			isActive: true,
			discoveryEligible: true,
			registrationCount: { not: null },
			OR: [
				{ generationTo: { gte: MODERN_SINCE } },
				{ AND: [{ generationTo: null }, { lastRegistrationYear: { gte: MODERN_SINCE } }] }
			]
		},
		orderBy: [{ registrationCount: 'desc' }, { model: 'asc' }],
		// Enough headroom that family de-duplication still fills the deck.
		take: 200,
		select: {
			id: true,
			familyId: true,
			registrationCount: true,
			model: true,
			manufacturer: { select: { name: true } }
		}
	});

	return rows.map((r) => ({
		id: r.id,
		familyId: r.familyId,
		registrationCount: r.registrationCount,
		manufacturerName: r.manufacturer.name,
		model: r.model
	}));
}

export async function demoDeckIds(): Promise<string[]> {
	return pickDemoDeck(await demoCandidates()).map((c) => c.id);
}

function guestHandle(): string {
	return `guest-${randomBytes(6).toString('hex')}`;
}

/**
 * Creates a guest account with its demo round. The caller creates the session.
 */
export async function startDemo(
	clientKey: string
): Promise<{ user: SessionUser; roundId: string }> {
	consume('demo', clientKey, demoRule());

	const deck = await demoDeckIds();
	if (deck.length < 2) {
		throw new ValidationError(
			'The demo needs a catalogue with popular, trustworthy cards, and this instance does not have one yet.'
		);
	}

	const handle = guestHandle();
	// A password nobody knows. Guests cannot sign in with one anyway (login
	// skips them), but the column is required and must never hold a value that
	// verifies against anything guessable.
	const passwordHash = await hashPassword(randomBytes(32).toString('base64url'));

	const user = await prisma.user.create({
		data: {
			email: `${handle}@guest.invalid`,
			username: handle,
			displayName: 'Guest',
			passwordHash,
			isGuest: true,
			lastLoginAt: new Date(),
			profile: { create: {} },
			rounds: {
				create: {
					name: DEMO_ROUND_NAME,
					goal: DEMO_ROUND_GOAL,
					status: 'ACTIVE',
					visibility: 'PRIVATE',
					filters: { motorcycleIds: deck }
				}
			}
		},
		select: {
			id: true,
			email: true,
			username: true,
			displayName: true,
			role: true,
			rounds: { select: { id: true }, take: 1 }
		}
	});

	return {
		user: {
			id: user.id,
			email: user.email,
			username: user.username,
			displayName: user.displayName,
			role: user.role,
			isGuest: true,
			emailVerified: false
		},
		roundId: user.rounds[0].id
	};
}

/** The guest's round, for resuming. Null when the account is not a guest. */
export async function demoRoundFor(userId: string): Promise<{ id: string } | null> {
	return prisma.discoveryRound.findFirst({
		where: { userId, user: { isGuest: true } },
		orderBy: { createdAt: 'asc' },
		select: { id: true }
	});
}

/**
 * Turns a guest into a full account, keeping the round.
 *
 * Applies the same rules as registration — it *is* registration, with the
 * account row already there — including the first-real-account-is-admin rule.
 */
export async function claimGuest(userId: string, input: RegisterInput, clientKey: string) {
	if (!env.allowRegistration) {
		throw new ForbiddenError('Registration is closed on this instance.');
	}
	consume('register', clientKey, registerRule());

	const guest = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, isGuest: true }
	});
	if (!guest?.isGuest) throw new ForbiddenError('This account is not a demo account.');

	const existing = await prisma.user.findFirst({
		where: {
			OR: [{ email: input.email }, { username: input.username }],
			NOT: { id: userId }
		},
		select: { email: true }
	});
	if (existing) {
		throw new ConflictError(
			existing.email === input.email
				? 'An account with that email already exists.'
				: 'That username is already taken.'
		);
	}

	const passwordHash = await hashPassword(input.password);
	const isFirstRealUser = (await prisma.user.count({ where: { isGuest: false } })) === 0;

	const user = await prisma.user.update({
		where: { id: userId },
		data: {
			email: input.email,
			username: input.username,
			displayName: input.displayName,
			passwordHash,
			isGuest: false,
			emailVerifiedAt: null,
			role: isFirstRealUser ? 'ADMIN' : 'USER',
			lastLoginAt: new Date()
		},
		select: { id: true, email: true, username: true, displayName: true, role: true }
	});

	return { ...user, isGuest: false, emailVerified: false } satisfies SessionUser;
}

/**
 * Signing in to an existing account from a demo: the demo round moves to that
 * account and the guest is deleted, so nothing swiped is lost.
 */
export async function adoptGuestInto(guestId: string, userId: string): Promise<number> {
	if (guestId === userId) return 0;
	const guest = await prisma.user.findUnique({
		where: { id: guestId },
		select: { isGuest: true }
	});
	if (!guest?.isGuest) return 0;

	const [moved] = await prisma.$transaction([
		prisma.discoveryRound.updateMany({ where: { userId: guestId }, data: { userId } }),
		prisma.user.delete({ where: { id: guestId } })
	]);
	return moved.count;
}

/** Deletes a guest and everything it owns. A no-op for a real account. */
export async function discardGuest(userId: string): Promise<boolean> {
	const result = await prisma.user.deleteMany({ where: { id: userId, isGuest: true } });
	return result.count > 0;
}

/**
 * Housekeeping: guests with no live session that were created longer ago
 * than the retention window. A guest still swiping has a session, which the
 * sliding expiry keeps alive.
 */
export async function purgeStaleGuests(): Promise<number> {
	const cutoff = new Date(Date.now() - env.guestRetentionDays * 24 * 60 * 60 * 1000);
	const result = await prisma.user.deleteMany({
		where: { isGuest: true, sessions: { none: {} }, createdAt: { lt: cutoff } }
	});
	return result.count;
}

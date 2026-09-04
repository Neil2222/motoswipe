import { prisma } from '../src/lib/server/db/client';
import { hashPassword } from '../src/lib/server/auth/password';
import { sampleProvider } from '../src/lib/server/importers/providers/sample.provider';
import { runImport } from '../src/lib/server/importers/import.service';
import { resetAll } from '../src/lib/server/auth/rate-limit';

/**
 * Shared fixtures for the integration tests.
 *
 * These hit a real Postgres rather than a mock. The interesting behaviour in
 * this application — the unique (roundId, motorcycleId) constraint, cascade
 * rules, groupBy aggregation, transaction boundaries — is behaviour the
 * database provides, and a mocked Prisma would assert nothing about it.
 */

/** Order matters: children before parents, because FKs are Restrict. */
export async function resetDatabase(): Promise<void> {
	await prisma.comparisonVote.deleteMany();
	await prisma.roundMotorcycleRanking.deleteMany();
	await prisma.swipe.deleteMany();
	await prisma.discoveryRound.deleteMany();
	await prisma.favorite.deleteMany();
	await prisma.authSession.deleteMany();
	await prisma.userProfile.deleteMany();
	await prisma.user.deleteMany();
	resetAll();
}

/** Wipes the catalogue too. Only for tests that need an empty one. */
export async function resetEverything(): Promise<void> {
	await resetDatabase();
	await prisma.motorcycleImage.deleteMany();
	await prisma.motorcycle.deleteMany();
	await prisma.manufacturer.deleteMany();
}

let cataloguePromise: Promise<void> | null = null;

/** Imports the sample catalogue once per process. */
export async function ensureCatalogue(): Promise<void> {
	cataloguePromise ??= (async () => {
		const count = await prisma.motorcycle.count();
		if (count === 0) await runImport(sampleProvider);
	})();
	return cataloguePromise;
}

let userSeq = 0;

export async function createUser(
	overrides: Partial<{
		email: string;
		username: string;
		password: string;
		role: 'USER' | 'ADMIN';
	}> = {}
) {
	userSeq++;
	const email = overrides.email ?? `user${userSeq}-${Date.now()}@example.test`;
	const username = overrides.username ?? `user${userSeq}${Date.now().toString(36)}`;
	const password = overrides.password ?? 'correct-horse-battery-staple';

	const user = await prisma.user.create({
		data: {
			email,
			username,
			displayName: `User ${userSeq}`,
			passwordHash: await hashPassword(password),
			role: overrides.role ?? 'USER',
			profile: { create: {} }
		}
	});

	return { user, password };
}

export async function createRoundFor(userId: string, filters: unknown = {}, name = 'Test round') {
	return prisma.discoveryRound.create({
		data: { userId, name, filters: filters as never, status: 'ACTIVE' }
	});
}

/** Ids of `count` catalogue motorcycles, in a stable order. */
export async function someMotorcycleIds(count: number): Promise<string[]> {
	const rows = await prisma.motorcycle.findMany({
		select: { id: true },
		orderBy: { slug: 'asc' },
		take: count
	});
	return rows.map((r) => r.id);
}

export { prisma };

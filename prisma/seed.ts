import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { prisma } from '../src/lib/server/db/client';
import { hashPassword } from '../src/lib/server/auth/password';
import { sampleProvider } from '../src/lib/server/importers/providers/sample.provider';
import { runImport } from '../src/lib/server/importers/import.service';

/**
 * Development seed.
 *
 * Idempotent: safe to run repeatedly. The catalogue goes through the real
 * import pipeline rather than raw inserts, so `db:seed` exercises the same code
 * a production import would.
 *
 * Passwords come from the environment. If they are not set, a random one is
 * generated and printed exactly once — there is no hardcoded default, so a
 * seeded production database cannot ship with a known login.
 */

if (!process.env.DATABASE_URL) {
	console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
	process.exit(1);
}

function resolvePassword(envVar: string, label: string): { password: string; generated: boolean } {
	const fromEnv = process.env[envVar];
	if (fromEnv && fromEnv.length >= 12) return { password: fromEnv, generated: false };

	if (fromEnv && fromEnv.length > 0) {
		console.warn(
			`  ! ${envVar} is shorter than 12 characters; generating a random password for ${label} instead.`
		);
	}
	return { password: randomBytes(12).toString('base64url'), generated: true };
}

async function seedUser(opts: {
	email: string;
	username: string;
	displayName: string;
	role: 'USER' | 'ADMIN';
	passwordEnvVar: string;
	heightCm?: number;
	inseamCm?: number;
}) {
	const existing = await prisma.user.findUnique({
		where: { email: opts.email },
		select: { id: true }
	});

	if (existing) {
		console.log(`  = ${opts.email} already exists (password unchanged)`);
		return { id: existing.id, created: false, password: null as string | null };
	}

	const { password, generated } = resolvePassword(opts.passwordEnvVar, opts.email);

	const user = await prisma.user.create({
		data: {
			email: opts.email,
			username: opts.username,
			displayName: opts.displayName,
			role: opts.role,
			passwordHash: await hashPassword(password),
			profile: {
				create: {
					heightCm: opts.heightCm ?? null,
					inseamCm: opts.inseamCm ?? null,
					countryCode: 'NL',
					preferredCurrency: 'EUR'
				}
			}
		},
		select: { id: true }
	});

	console.log(`  + ${opts.email} created (${opts.role})`);
	return { id: user.id, created: true, password: generated ? password : null };
}

/**
 * Imports the hand-written demo catalogue.
 *
 * Only ever run against a catalogue with no real data in it. Its
 * specifications were written for a walkthrough, not sourced from anywhere, so
 * next to imported data they are twenty-seven plausible-looking motorcycles
 * whose numbers are made up.
 */
async function seedSampleCatalogue() {
	console.log('\n[1/3] Importing the sample catalogue...');
	const before = await prisma.motorcycle.count();

	const result = await runImport(sampleProvider, {
		onProgress: (done, total, label) => {
			if (done === total || done % 10 === 0) {
				process.stdout.write(`      ${done}/${total}  ${label}\n`);
			}
		}
	});

	console.log(
		`      created ${result.created}, updated ${result.updated}, ` +
			`protected ${result.protectedRows}, failed ${result.failed.length} ` +
			`(${result.durationMs} ms)`
	);
	for (const failure of result.failed) {
		console.error(`      ! ${failure.externalId}: ${failure.reason}`);
	}

	const after = await prisma.motorcycle.count();
	console.log(`      catalogue: ${before} -> ${after} motorcycles`);
}

async function main() {
	console.log('\nMotoSwipe seed\n' + '='.repeat(50));

	// --- Catalogue -----------------------------------------------------------
	// A re-seed must never put the demo bikes back among imported ones. This
	// already happened once: `db:seed:docker` runs on every container start, and
	// twenty-seven invented motorcycles turned up in a catalogue of real ones.
	const realCatalogue = await prisma.motorcycle.count({
		where: { source: { not: sampleProvider.source } }
	});

	if (realCatalogue > 0) {
		console.log(
			`\n[1/3] Skipping the sample catalogue — ${realCatalogue} motorcycles are ` +
				'already imported from a real source.'
		);
		console.log('      Run `npm run import:run -- --list` to see what is available.');
	} else {
		await seedSampleCatalogue();
	}

	// --- Development accounts ------------------------------------------------
	console.log('\n[2/3] Development accounts...');
	const admin = await seedUser({
		email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.local',
		username: 'admin',
		displayName: 'Workshop Admin',
		role: 'ADMIN',
		passwordEnvVar: 'SEED_ADMIN_PASSWORD',
		heightCm: 182,
		inseamCm: 84
	});

	const tester = await seedUser({
		email: process.env.SEED_USER_EMAIL ?? 'test@example.local',
		username: 'testrider',
		displayName: 'Test Rider',
		role: 'USER',
		passwordEnvVar: 'SEED_USER_PASSWORD',
		heightCm: 175,
		inseamCm: 78
	});

	// --- A starter round so the dashboard is not empty on first login --------
	console.log('\n[3/3] Example round...');
	const hasRound = await prisma.discoveryRound.findFirst({
		where: { userId: tester.id },
		select: { id: true }
	});

	if (hasRound) {
		console.log('  = test rider already has a round');
	} else {
		await prisma.discoveryRound.create({
			data: {
				userId: tester.id,
				name: 'First motorcycle 2026',
				description:
					'Everything in the catalogue. No filters — react to the bike, not the spec sheet.',
				goal: 'Find a first big bike I actually want to look at in the garage.',
				status: 'ACTIVE',
				visibility: 'PRIVATE',
				filters: {}
			}
		});
		console.log('  + "First motorcycle 2026" created for the test rider');
	}

	// --- Credentials summary -------------------------------------------------
	console.log('\n' + '='.repeat(50));
	if (admin.password || tester.password) {
		console.log('\nGENERATED PASSWORDS — shown once, not stored anywhere:\n');
		if (admin.password)
			console.log(
				`  admin  ${process.env.SEED_ADMIN_EMAIL ?? 'admin@example.local'}  ${admin.password}`
			);
		if (tester.password)
			console.log(
				`  user   ${process.env.SEED_USER_EMAIL ?? 'test@example.local'}  ${tester.password}`
			);
		console.log('\nSet SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD in .env to choose your own.');
	} else {
		console.log('\nAccounts use the passwords from SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD.');
	}

	console.log('\nNOTE: the catalogue is DEMO DATA. Specifications are approximate and');
	console.log('images are generated illustrations, not photographs. Production data');
	console.log('must come from a verified provider — see src/lib/server/importers/README.md\n');
}

main()
	.catch((error) => {
		console.error('\nSeed failed:', error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});

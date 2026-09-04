import 'dotenv/config';
import { prisma } from '../src/lib/server/db/client';
import { buildMatchKey } from '../src/lib/server/importers/match';

/**
 * Backfills `matchKey` on motorcycles imported before cross-source matching
 * existed.
 *
 * Without this every row from a second source looks new, and the swipe deck
 * ends up with two cards for the same motorcycle. Safe to re-run: it only
 * writes rows whose stored key differs from the computed one, so it doubles as
 * the repair step after a change to the normalisation rules.
 *
 *   npm run db:backfill-match-keys -- [--dry-run]
 */
async function main() {
	const dryRun = process.argv.includes('--dry-run');

	const rows = await prisma.motorcycle.findMany({
		select: { id: true, model: true, matchKey: true, manufacturer: { select: { name: true } } }
	});

	let changed = 0;
	let unmatchable = 0;
	const keys = new Map<string, number>();

	for (const row of rows) {
		const key = buildMatchKey(row.manufacturer.name, row.model);
		if (key === null) unmatchable++;
		else keys.set(key, (keys.get(key) ?? 0) + 1);

		if (key === row.matchKey) continue;
		changed++;
		if (!dryRun) {
			await prisma.motorcycle.update({ where: { id: row.id }, data: { matchKey: key } });
		}
	}

	const collisions = [...keys.values()].filter((count) => count > 1).length;

	console.log(`\n  motorcycles        ${rows.length}`);
	console.log(`  ${dryRun ? 'would update      ' : 'updated           '} ${changed}`);
	console.log(`  no usable key      ${unmatchable}`);
	// Two existing rows sharing a key means the catalogue already holds a
	// duplicate, or two genuinely different bikes normalise the same way. Worth
	// seeing rather than silently merging future imports into one of them.
	console.log(`  keys held by >1 row ${collisions}\n`);
}

main()
	.catch((error) => {
		console.error('\nBackfill failed:', error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});

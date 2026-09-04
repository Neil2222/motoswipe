import 'dotenv/config';
import { prisma } from '../src/lib/server/db/client';
import { stripBrandPrefix } from '../src/lib/server/importers/match';

/**
 * Removes a manufacturer name repeated inside a model name on rows that are
 * already in the database.
 *
 * Re-importing does not fix these: a row is found by its source's own id, so
 * "BMW / BMW R1200GSADVENTURE" would simply be updated in place and go on
 * living next to "BMW / R 1200 GS Adventure" forever. The names have to be
 * repaired here, after which the usual pair does the rest:
 *
 *   npm run db:repair-model-names
 *   npm run db:backfill-match-keys    # the repaired names now key correctly
 *   npm run db:dedupe                 # ...so the two rows merge into one
 *
 *   npm run db:repair-model-names -- [--dry-run]
 */
async function main() {
	const dryRun = process.argv.includes('--dry-run');

	const rows = await prisma.motorcycle.findMany({
		select: { id: true, model: true, manufacturer: { select: { name: true } } }
	});

	let changed = 0;
	for (const row of rows) {
		const repaired = stripBrandPrefix(row.manufacturer.name, row.model);
		if (repaired === row.model) continue;

		changed++;
		console.log(`  "${row.manufacturer.name} / ${row.model}"  →  "${repaired}"`);
		if (!dryRun) {
			await prisma.motorcycle.update({ where: { id: row.id }, data: { model: repaired } });
		}
	}

	console.log(`\n  motorcycles        ${rows.length}`);
	console.log(`  ${dryRun ? 'would repair      ' : 'repaired          '} ${changed}\n`);
	if (changed && !dryRun) {
		console.log('  Now run: npm run db:backfill-match-keys && npm run db:dedupe\n');
	}
}

main()
	.catch((error) => {
		console.error('\nRepair failed:', error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});

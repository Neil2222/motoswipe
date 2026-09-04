import 'dotenv/config';
import { prisma } from '../src/lib/server/db/client';
import { normalizeBrand } from '../src/lib/server/importers/match';

/**
 * Merges manufacturers that are one company under different names, and
 * backfills the `matchKey` that stops it happening again.
 *
 * The Dutch registry writes "BMW", Wikipedia writes "BMW Motorrad" and Wikidata
 * writes "BMW Group". Left alone that is three manufacturers holding 105, 33
 * and 41 motorcycles: the manufacturer filter lists BMW three times and none of
 * them has all the BMWs.
 *
 * The survivor is the plainest name — the one a rider would say out loud. Its
 * blanks are filled from the others, every motorcycle is repointed to it, and
 * the duplicates are deleted.
 *
 *   npm run db:dedupe-manufacturers -- [--dry-run]
 */
async function main() {
	const dryRun = process.argv.includes('--dry-run');

	const all = await prisma.manufacturer.findMany({
		include: { _count: { select: { motorcycles: true } } }
	});

	const groups = new Map<string, typeof all>();
	for (const manufacturer of all) {
		const key = normalizeBrand(manufacturer.name);
		if (!key) continue;
		groups.set(key, [...(groups.get(key) ?? []), manufacturer]);
	}

	let mergedGroups = 0;
	let movedBikes = 0;
	let deleted = 0;

	for (const [key, members] of groups) {
		// "BMW" over "BMW Motorrad" over "BMW Group": fewest words wins, then the
		// shortest string, then whichever holds the most motorcycles.
		const ranked = [...members].sort(
			(a, b) =>
				a.name.split(/\s+/).length - b.name.split(/\s+/).length ||
				a.name.length - b.name.length ||
				b._count.motorcycles - a._count.motorcycles
		);
		const [keeper, ...losers] = ranked;

		if (losers.length) {
			mergedGroups++;
			console.log(
				`\n  ${key}  →  "${keeper.name}"` +
					`  (absorbing ${losers.map((l) => `"${l.name}" ×${l._count.motorcycles}`).join(', ')})`
			);
		}

		if (!dryRun) {
			// Claim the key first: it is unique, and a loser may already hold it.
			for (const loser of losers) {
				if (loser.matchKey) {
					await prisma.manufacturer.update({
						where: { id: loser.id },
						data: { matchKey: null }
					});
				}
			}

			await prisma.manufacturer.update({
				where: { id: keeper.id },
				data: {
					matchKey: key,
					// Only fill blanks — the keeper's own facts stand.
					countryCode: keeper.countryCode ?? losers.find((l) => l.countryCode)?.countryCode,
					website: keeper.website ?? losers.find((l) => l.website)?.website
				}
			});
		}

		for (const loser of losers) {
			movedBikes += loser._count.motorcycles;
			if (dryRun) {
				deleted++;
				continue;
			}
			await prisma.motorcycle.updateMany({
				where: { manufacturerId: loser.id },
				data: { manufacturerId: keeper.id }
			});
			await prisma.manufacturer.delete({ where: { id: loser.id } });
			deleted++;
		}
	}

	console.log(`\n  manufacturers      ${all.length}`);
	console.log(`  merged groups      ${mergedGroups}`);
	console.log(`  motorcycles moved  ${movedBikes}`);
	console.log(`  ${dryRun ? 'would delete      ' : 'deleted           '} ${deleted}`);
	console.log(`  remaining          ${all.length - deleted}\n`);
}

main()
	.catch((error) => {
		console.error('\nDedupe failed:', error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});

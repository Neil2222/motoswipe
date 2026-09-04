import 'dotenv/config';
import { prisma } from '../src/lib/server/db/client';
import { identify } from '../src/lib/server/catalog/identity';

/**
 * Moves photographs off retired rows and onto the canonical motorcycle they
 * belong to.
 *
 * The move to canonical identities retired every row the old catalogue had
 * built, and the photographs the Commons search job had found were attached to
 * those rows. No provider claims them — nothing would ever put them back — and
 * they represent hours of searching against somebody else's servers.
 *
 * A retired row is resolved through exactly the same identity rules the
 * canonical catalogue uses, so a photograph only moves when the two rows are
 * demonstrably the same motorcycle. Anything that cannot be resolved is left
 * where it is rather than guessed at.
 *
 * Moving a photograph does not make it the right one: a retired row could hold
 * a picture that never belonged to it. The next `db:rebuild` vets every image
 * on every canonical row against the whole catalogue and removes any that
 * provably shows something else.
 *
 *   npm run db:rescue-photos -- [--dry-run]
 */
async function main() {
	const dryRun = process.argv.includes('--dry-run');

	const canonicalByIdentity = new Map<string, string>();
	for (const row of await prisma.motorcycle.findMany({
		where: { isActive: true, identityKey: { not: null } },
		select: { id: true, identityKey: true }
	})) {
		if (row.identityKey) canonicalByIdentity.set(row.identityKey, row.id);
	}

	const stranded = await prisma.motorcycle.findMany({
		where: { isActive: false, images: { some: {} } },
		select: {
			id: true,
			model: true,
			modelYear: true,
			firstRegistrationYear: true,
			lastRegistrationYear: true,
			manufacturer: { select: { name: true } },
			images: { select: { id: true, url: true, source: true }, orderBy: { sortOrder: 'asc' } }
		}
	});

	let moved = 0;
	let unresolved = 0;
	let alreadyThere = 0;
	const touched = new Set<string>();

	for (const row of stranded) {
		const identity = identify({
			manufacturerName: row.manufacturer.name,
			model: row.model,
			era: {
				from: row.firstRegistrationYear ?? row.modelYear ?? undefined,
				to: row.lastRegistrationYear ?? undefined
			}
		});

		const targetId = identity ? canonicalByIdentity.get(identity.key) : undefined;
		if (!targetId) {
			unresolved += row.images.length;
			continue;
		}

		// Never create a second copy of a photograph the canonical row already has.
		const existing = await prisma.motorcycleImage.findMany({
			where: { motorcycleId: targetId },
			select: { url: true }
		});
		const known = new Set(existing.map((i) => i.url));

		let order = existing.length;
		for (const image of row.images) {
			if (known.has(image.url)) {
				alreadyThere++;
				continue;
			}
			moved++;
			touched.add(targetId);
			if (dryRun) continue;

			await prisma.motorcycleImage.update({
				where: { id: image.id },
				data: {
					motorcycleId: targetId,
					// Labelled as ours, so a future rebuild does not decide that no
					// provider claims it and throw it away again.
					source: 'commons-search',
					isPrimary: false,
					sortOrder: order++
				}
			});
		}
	}

	// Every motorcycle needs exactly one primary image, and the rows that just
	// received their first photograph have none.
	if (!dryRun) {
		for (const motorcycleId of touched) {
			const hasPrimary = await prisma.motorcycleImage.count({
				where: { motorcycleId, isPrimary: true }
			});
			if (hasPrimary > 0) continue;

			const first = await prisma.motorcycleImage.findFirst({
				where: { motorcycleId },
				orderBy: { sortOrder: 'asc' },
				select: { id: true }
			});
			if (first) {
				await prisma.motorcycleImage.update({
					where: { id: first.id },
					data: { isPrimary: true }
				});
			}
		}
	}

	console.log(`\n  retired rows holding photos  ${stranded.length}`);
	console.log(`  ${dryRun ? 'would move' : 'moved     '}                   ${moved}`);
	console.log(`  already on the canonical row ${alreadyThere}`);
	console.log(`  left behind (no match)       ${unresolved}`);
	console.log(`  motorcycles that gained one  ${touched.size}\n`);
}

main()
	.catch((error) => {
		console.error('\nRescue failed:', error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});

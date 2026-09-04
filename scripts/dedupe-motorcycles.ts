import 'dotenv/config';
import { prisma } from '../src/lib/server/db/client';
import { ENRICHABLE_FIELDS, selectEnrichment } from '../src/lib/server/importers/match';

/**
 * Merges motorcycles that are the same machine listed twice.
 *
 * Wikidata has more than one item for some bikes — the Kawasaki Z900 arrived
 * three times, under "Kawasaki", "Kawasaki Motors" and a second "Kawasaki"
 * entity. Three cards for one motorcycle in a swipe deck is the most obvious
 * possible way for the catalogue to look broken, and no amount of import-time
 * matching fixes rows that are already there.
 *
 * The keeper is the row with the most photographs, because a card with no
 * picture is useless in a swipe app. It then absorbs everything the losers knew
 * that it did not, plus their images.
 *
 * Losers are deleted when nothing references them and deactivated otherwise —
 * somebody's shortlist from an earlier round must not vanish, which is exactly
 * why `Swipe` points at `Motorcycle` with `onDelete: Restrict`.
 *
 *   npm run db:dedupe -- [--dry-run]
 */
async function main() {
	const dryRun = process.argv.includes('--dry-run');

	const groups = await prisma.motorcycle.groupBy({
		by: ['matchKey'],
		where: { matchKey: { not: null } },
		_count: { _all: true },
		having: { matchKey: { _count: { gt: 1 } } }
	});

	let merged = 0;
	let deleted = 0;
	let deactivated = 0;
	let imagesMoved = 0;
	let fieldsFilled = 0;

	for (const group of groups) {
		if (!group.matchKey) continue;

		const rows = await prisma.motorcycle.findMany({
			where: { matchKey: group.matchKey },
			include: { images: true }
		});

		// A card without a photograph is worthless here, so pictures decide.
		// Known specifications break the tie, and age breaks that.
		const score = (row: (typeof rows)[number]) =>
			ENRICHABLE_FIELDS.filter(
				(field) => (row as unknown as Record<string, unknown>)[field] != null
			).length;

		const ranked = [...rows].sort(
			(a, b) =>
				b.images.length - a.images.length ||
				score(b) - score(a) ||
				a.createdAt.getTime() - b.createdAt.getTime()
		);

		const [keeper, ...losers] = ranked;
		const keeperUrls = new Set(keeper.images.map((image) => image.url));

		console.log(
			`\n  ${group.matchKey}  →  keeping "${keeper.model}" (${keeper.images.length} images, ${score(keeper)} specs)`
		);

		let patch: Record<string, unknown> = {};
		for (const loser of losers) {
			// Later losers only fill what earlier ones left empty.
			const contribution = selectEnrichment(
				{ ...(keeper as unknown as Record<string, unknown>), ...patch },
				loser as unknown as Record<string, unknown>,
				keeper.protectedFields
			);
			patch = { ...patch, ...contribution };

			const newImages = loser.images.filter((image) => !keeperUrls.has(image.url));
			for (const image of newImages) keeperUrls.add(image.url);

			console.log(
				`    merging "${loser.model}" — ${Object.keys(contribution).length} fields, ${newImages.length} images`
			);

			if (!dryRun && newImages.length) {
				await prisma.motorcycleImage.updateMany({
					where: { id: { in: newImages.map((image) => image.id) } },
					data: {
						motorcycleId: keeper.id,
						// Only one image per motorcycle may be primary, and the keeper
						// already has its own.
						isPrimary: false,
						sortOrder: keeper.images.length + 1
					}
				});
			}
			imagesMoved += newImages.length;
		}

		fieldsFilled += Object.keys(patch).length;
		if (!dryRun && Object.keys(patch).length) {
			await prisma.motorcycle.update({ where: { id: keeper.id }, data: patch });
		}

		for (const loser of losers) {
			const references = await prisma.swipe.count({ where: { motorcycleId: loser.id } });
			const rankings = await prisma.roundMotorcycleRanking.count({
				where: { motorcycleId: loser.id }
			});

			if (references + rankings === 0) {
				if (!dryRun) await prisma.motorcycle.delete({ where: { id: loser.id } });
				deleted++;
			} else {
				// Referenced by somebody's round. Hide it from new decks instead.
				if (!dryRun) {
					await prisma.motorcycle.update({
						where: { id: loser.id },
						data: { isActive: false, retiredAt: new Date(), matchKey: null }
					});
				}
				deactivated++;
			}
		}

		merged++;
	}

	console.log(`\n  duplicate groups   ${merged}`);
	console.log(`  fields filled      ${fieldsFilled}`);
	console.log(`  images moved       ${imagesMoved}`);
	console.log(`  ${dryRun ? 'would delete      ' : 'deleted           '} ${deleted}`);
	console.log(`  deactivated        ${deactivated} (still referenced by a round)\n`);
}

main()
	.catch((error) => {
		console.error('\nDedupe failed:', error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});

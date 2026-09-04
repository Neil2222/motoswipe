import 'dotenv/config';
import { prisma } from '../src/lib/server/db/client';
import { rebuildCatalogue } from '../src/lib/server/catalog/rebuild';

/**
 * Rebuilds the canonical catalogue from the source records already imported.
 *
 * No network. Run this after changing an identity rule, a curated alias or a
 * field priority — the evidence has not changed, only what we make of it.
 *
 *   npm run db:rebuild
 */
const result = await rebuildCatalogue({
	onProgress: (done, total) => {
		if (done % 250 === 0 || done === total) {
			process.stdout.write(`  ${done}/${total}\n`);
		}
	}
});

console.log(`\n  source records     ${result.sourceRecords}`);
console.log(`  model families     ${result.families}`);
console.log(
	`  generations        ${result.generations}  (${result.split.curated} families split by curation, ${result.split.detected} by the registry's own numbers)`
);
console.log(`    created          ${result.created}`);
console.log(`    updated          ${result.updated}`);
console.log(`  collapsed          ${result.collapsed} duplicate source rows merged away`);
console.log(`  retired            ${result.retired}`);
console.log(`  unresolved         ${result.unresolved} (no identity could be decided)`);
console.log(`  duration           ${result.durationMs} ms\n`);

await prisma.$disconnect();

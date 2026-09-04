import 'dotenv/config';
import { prisma } from '../src/lib/server/db/client';
import { getProvider, listProviders } from '../src/lib/server/importers/registry';
import { retireMissing, runImport } from '../src/lib/server/importers/import.service';

/**
 * Import CLI.
 *
 *   npm run import:run -- --list
 *   npm run import:run -- --source sample
 *   npm run import:run -- --source sample --limit 5 --dry-run
 *   npm run import:run -- --source sample --retire-missing
 *
 * Imports are a command, never an HTTP endpoint. A scraper triggered from a
 * web request is a denial-of-service vector against somebody else's website,
 * and it is not something a self-hosted box should do by accident.
 */

interface Args {
	source?: string;
	limit?: number;
	only?: string;
	dryRun: boolean;
	list: boolean;
	retireMissing: boolean;
	overwriteManualEdits: boolean;
	allowNetwork: boolean;
	skipRebuild: boolean;
}

function parseArgs(argv: string[]): Args {
	const args: Args = {
		dryRun: false,
		list: false,
		retireMissing: false,
		overwriteManualEdits: false,
		allowNetwork: false,
		skipRebuild: false
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		switch (arg) {
			case '--list':
				args.list = true;
				break;
			case '--source':
				args.source = argv[++i];
				break;
			case '--limit':
				args.limit = Number(argv[++i]);
				break;
			case '--only':
				args.only = argv[++i];
				break;
			case '--dry-run':
				args.dryRun = true;
				break;
			case '--retire-missing':
				args.retireMissing = true;
				break;
			case '--overwrite-manual-edits':
				args.overwriteManualEdits = true;
				break;
			case '--allow-network':
				args.allowNetwork = true;
				break;
			case '--skip-rebuild':
				args.skipRebuild = true;
				break;
			case '--help':
			case '-h':
				usage();
				process.exit(0);
		}
	}

	return args;
}

function usage(): void {
	console.log(`
MotoSwipe importer

  --list                      Show registered providers and exit
  --source <name>             Provider to run (required unless --list)
  --limit <n>                 Stop after n records
  --only <text>               Only listings whose label or id contains the text (e.g. a maker)
  --skip-rebuild              Record the source data without rebuilding the catalogue
  --dry-run                   Report what would change, write nothing
  --retire-missing            Mark rows this source no longer lists as retired
                              (never deletes: swipe history is preserved)
  --overwrite-manual-edits    Overwrite rows a human has corrected. Off by
                              default, and you should think before using it.
  --allow-network             Required for providers that reach the internet
`);
}

async function main() {
	const args = parseArgs(process.argv.slice(2));

	if (args.list || !args.source) {
		console.log('\nRegistered providers:\n');
		for (const provider of listProviders()) {
			console.log(
				`  ${provider.source.padEnd(16)} ${provider.displayName}` +
					`${provider.requiresNetwork ? '  [needs --allow-network]' : ''}`
			);
		}
		console.log('');
		if (!args.source && !args.list) usage();
		return;
	}

	const provider = getProvider(args.source);
	if (!provider) {
		console.error(`No provider registered as "${args.source}". Run with --list to see them.`);
		process.exit(1);
	}

	if (provider.requiresNetwork && !args.allowNetwork) {
		console.error(
			`Provider "${provider.source}" fetches over the network.\n` +
				'Re-run with --allow-network once you are satisfied that is what you want,\n' +
				"and that you are entitled to fetch that source's data."
		);
		process.exit(1);
	}

	console.log(`\nImporting from ${provider.displayName}`);
	if (args.dryRun) console.log('DRY RUN — nothing will be written.\n');

	const result = await runImport(provider, {
		limit: args.limit,
		only: args.only,
		dryRun: args.dryRun,
		overwriteManualEdits: args.overwriteManualEdits,
		skipRebuild: args.skipRebuild,
		onProgress: (done, total, label) => {
			process.stdout.write(`  [${String(done).padStart(4)}/${total}] ${label}\n`);
		}
	});

	console.log('\nResult');
	console.log(`  created            ${result.created}`);
	console.log(`  updated            ${result.updated}`);
	if (result.enriched) {
		console.log(`  enriched           ${result.enriched} (merged into an existing motorcycle)`);
	}
	console.log(`  protected (manual) ${result.protectedRows}`);
	console.log(`  skipped            ${result.skipped}`);
	console.log(`  failed             ${result.failed.length}`);
	console.log(`  duration           ${result.durationMs} ms`);

	if (result.rebuild) {
		const r = result.rebuild;
		console.log('');
		console.log('Canonical catalogue rebuilt from every source record');
		console.log(`  source records     ${r.sourceRecords}`);
		console.log(`  model families     ${r.families}`);
		console.log(`  generations        ${r.generations}  (${r.created} new, ${r.updated} updated)`);
		console.log(`  collapsed          ${r.collapsed} duplicate source rows merged away`);
		console.log(`  retired            ${r.retired}`);
		console.log(`  unresolved         ${r.unresolved}`);
	}

	for (const failure of result.failed) {
		console.error(`  ! ${failure.externalId}: ${failure.reason}`);
	}

	if (args.retireMissing && !args.dryRun) {
		const retired = await retireMissing(provider.source, result.seenExternalIds);
		console.log(`\n  retired            ${retired} (kept in the database, hidden from new decks)`);
	}

	console.log('');
}

main()
	.catch((error) => {
		console.error('\nImport failed:', error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});

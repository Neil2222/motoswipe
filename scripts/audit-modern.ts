import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { prisma } from '../src/lib/server/db/client';
import { buildMotorcycleWhere } from '../src/lib/server/services/motorcycle.service';
import type { Evidence } from '../src/lib/server/catalog/evidence';

/**
 * The modern-catalogue audit: how trustworthy are the cards somebody shopping
 * now would actually be shown?
 *
 * Counts everything the product promise depends on for generations sold from
 * `SINCE` onward — images and their scope, filter-critical fields and their
 * evidence, eligibility and why not — and lists the most popular families with
 * their actual values, because a non-null field is not a correct one.
 *
 *   npm run db:audit -- [--since 2020] [--top 100] [--json out.json]
 */

const arg = (name: string) => {
	const i = process.argv.indexOf(`--${name}`);
	return i === -1 ? undefined : process.argv[i + 1];
};
const SINCE = Number(arg('since')) || 2020;
const TOP = Number(arg('top')) || 100;
const JSON_OUT = arg('json');

const pct = (n: number, of: number) => (of ? `${((100 * n) / of).toFixed(1)}%` : '—');
const pad = (v: unknown, w: number) => String(v ?? '').padEnd(w);

async function main() {
	// A generation is "modern" when it was on sale in or after SINCE: its own
	// span where known, otherwise the years it was registered in numbers.
	const modern = await prisma.motorcycle.findMany({
		where: {
			isActive: true,
			NOT: { tags: { has: 'non-road' } },
			OR: [
				{ generationTo: { gte: SINCE } },
				{ AND: [{ generationTo: null }, { lastRegistrationYear: { gte: SINCE } }] }
			]
		},
		select: {
			id: true,
			model: true,
			generationLabel: true,
			generationFrom: true,
			generationTo: true,
			boundarySource: true,
			category: true,
			displacementCc: true,
			powerHp: true,
			torqueNm: true,
			wetWeightKg: true,
			seatHeightMm: true,
			ridingPosition: true,
			passengerAllowed: true,
			seatCount: true,
			licenseCategory: true,
			msrpAmount: true,
			msrpYear: true,
			availability: true,
			registrationCount: true,
			imageStatus: true,
			discoveryEligible: true,
			ineligibleReasons: true,
			evidence: true,
			source: true,
			fieldSources: true,
			manufacturer: { select: { name: true } },
			images: {
				where: { isPrimary: true },
				take: 1,
				select: { url: true, scope: true, attribution: true, source: true }
			},
			// What was tried, for the failure report: which sources describe the
			// family, and which photograph jobs have visited it.
			photosSearchedAt: true,
			family: { select: { categorySearchedAt: true } },
			sourceRecords: { select: { source: true } },
			_count: { select: { images: true } }
		},
		// A model the Dutch registry has never seen sorts last, however famous:
		// this is an audit of what someone here could buy.
		orderBy: { registrationCount: { sort: 'desc', nulls: 'last' } }
	});

	const total = modern.length;
	const regs = modern.reduce((s, m) => s + (m.registrationCount ?? 0), 0);
	const count = (f: (m: (typeof modern)[number]) => boolean) => modern.filter(f).length;
	const regsOf = (f: (m: (typeof modern)[number]) => boolean) =>
		modern.filter(f).reduce((s, m) => s + (m.registrationCount ?? 0), 0);

	const lines: string[] = [];
	const say = (l = '') => lines.push(l);

	say(`MODERN CATALOGUE AUDIT — generations on sale ${SINCE} or later`);
	say('='.repeat(78));
	say(`generations           ${total}   (${regs.toLocaleString('en-GB')} registrations)`);
	say();

	say('IMAGES');
	const byImage = ['MODEL_YEAR', 'GENERATION', 'FAMILY_ONLY', 'SUSPICIOUS', 'NONE'] as const;
	for (const status of byImage) {
		const n = count((m) => m.imageStatus === status);
		say(
			`  ${pad(status, 12)} ${pad(n, 6)} ${pad(pct(n, total), 7)} of cards   ${pct(
				regsOf((m) => m.imageStatus === status),
				regs
			)} of registrations`
		);
	}
	const trusted = count((m) => m.imageStatus === 'MODEL_YEAR' || m.imageStatus === 'GENERATION');
	say(
		`  trustworthy primary image: ${trusted} (${pct(trusted, total)} of cards, ${pct(
			regsOf((m) => m.imageStatus === 'MODEL_YEAR' || m.imageStatus === 'GENERATION'),
			regs
		)} of registrations)`
	);
	say();

	say('FIELD COVERAGE   (non-null / by evidence status)');
	const fields: (keyof Evidence['fields'])[] = [
		'category',
		'displacementCc',
		'powerHp',
		'torqueNm',
		'wetWeightKg',
		'seatHeightMm',
		'ridingPosition',
		'passengerAllowed',
		'seatCount',
		'licenseCategory',
		'msrpAmount',
		'availability'
	];
	say(`  ${pad('field', 18)} ${pad('present', 14)} verified  high   inferred  unknown  conflict`);
	for (const field of fields) {
		const statuses = modern.map(
			(m) => (m.evidence as Evidence | null)?.fields?.[field] ?? 'UNKNOWN'
		);
		const c = (s: string) => statuses.filter((x) => x === s).length;
		const present = statuses.filter((x) => x !== 'UNKNOWN').length;
		say(
			`  ${pad(field, 18)} ${pad(`${present} (${pct(present, total)})`, 14)} ${pad(c('VERIFIED'), 9)} ${pad(c('HIGH'), 6)} ${pad(c('INFERRED'), 9)} ${pad(c('UNKNOWN'), 8)} ${c('CONFLICTING')}`
		);
	}
	const catOther = count((m) => m.category === 'OTHER');
	say(`  category = OTHER: ${catOther}`);
	const currentPrice = count((m) => (m.evidence as Evidence | null)?.priceCurrency === 'CURRENT');
	say(
		`  price for a current model year: ${currentPrice}; historical list price: ${count((m) => (m.evidence as Evidence | null)?.priceCurrency === 'HISTORICAL')}`
	);
	say(
		`  availability: NEW ${count((m) => m.availability === 'NEW')}, USED ${count((m) => m.availability === 'USED')}, UNKNOWN ${count((m) => m.availability === 'UNKNOWN')}`
	);
	say();

	say('DISCOVERY ELIGIBILITY');
	const eligible = count((m) => m.discoveryEligible);
	say(
		`  eligible for baseline discovery: ${eligible} (${pct(eligible, total)} of cards, ${pct(
			regsOf((m) => m.discoveryEligible),
			regs
		)} of registrations)`
	);
	const reasons = new Map<string, number>();
	for (const m of modern)
		for (const r of m.ineligibleReasons) reasons.set(r, (reasons.get(r) ?? 0) + 1);
	for (const [reason, n] of [...reasons].sort((a, b) => b[1] - a[1]))
		say(`    ${pad(reason, 36)} ${n}`);
	say();

	// What the eligible deck looks like under the round the user described.
	const rounds: [string, Record<string, unknown>][] = [
		['unfiltered visual round', {}],
		[`from ${SINCE}`, { yearMin: SINCE }],
		[`from ${SINCE}, under €20,000`, { yearMin: SINCE, priceMax: 20000, priceCurrency: 'EUR' }],
		[`from ${SINCE}, NEW`, { yearMin: SINCE, condition: 'NEW' }],
		[
			`from ${SINCE}, ≥100 hp, passenger, NEW`,
			{ yearMin: SINCE, powerHpMin: 100, passengerRequired: true, condition: 'NEW' }
		],
		[`from ${SINCE}, NAKED`, { yearMin: SINCE, categories: ['NAKED'] }]
	];
	say('DECK SIZES FOR TYPICAL ROUNDS');
	for (const [label, filters] of rounds) {
		const n = await prisma.motorcycle.count({ where: buildMotorcycleWhere(filters) });
		say(`  ${pad(label, 42)} ${n}`);
	}
	say();

	say('BY MANUFACTURER   (modern generations: eligible / total, image-trusted)');
	const byMake = new Map<
		string,
		{ total: number; eligible: number; trusted: number; regs: number }
	>();
	for (const m of modern) {
		const e = byMake.get(m.manufacturer.name) ?? { total: 0, eligible: 0, trusted: 0, regs: 0 };
		e.total++;
		if (m.discoveryEligible) e.eligible++;
		if (m.imageStatus === 'MODEL_YEAR' || m.imageStatus === 'GENERATION') e.trusted++;
		e.regs += m.registrationCount ?? 0;
		byMake.set(m.manufacturer.name, e);
	}
	for (const [make, e] of [...byMake].sort((a, b) => b[1].regs - a[1].regs).slice(0, 20)) {
		say(
			`  ${pad(make, 18)} ${pad(`${e.eligible}/${e.total}`, 9)} ${pad(pct(e.eligible, e.total), 7)} image ${pad(pct(e.trusted, e.total), 7)} regs ${e.regs.toLocaleString('en-GB')}`
		);
	}
	say();

	say('BY POPULARITY   (registrations per generation)');
	const bands: [string, (n: number) => boolean][] = [
		['≥ 1000', (n) => n >= 1000],
		['300–999', (n) => n >= 300 && n < 1000],
		['100–299', (n) => n >= 100 && n < 300],
		['30–99', (n) => n >= 30 && n < 100],
		['< 30', (n) => n < 30]
	];
	for (const [label, test] of bands) {
		const inBand = modern.filter((m) => test(m.registrationCount ?? 0));
		const el = inBand.filter((m) => m.discoveryEligible).length;
		say(
			`  ${pad(label, 10)} ${pad(inBand.length, 6)} eligible ${pad(el, 5)} ${pct(el, inBand.length)}`
		);
	}
	say();

	say(`TOP ${TOP} MODERN GENERATIONS BY REGISTRATIONS`);
	say(
		'  ' +
			[
				pad('#', 3),
				pad('motorcycle', 40),
				pad('years', 10),
				pad('gen', 8),
				pad('regs', 6),
				pad('avail', 7),
				pad('cat', 13),
				pad('cc', 5),
				pad('hp', 6),
				pad('kg', 5),
				pad('seat', 5),
				pad('pax', 4),
				pad('price', 8),
				pad('pyr', 5),
				pad('image', 12),
				'eligible / reasons'
			].join(' ')
	);
	const top = modern.slice(0, TOP);
	top.forEach((m, i) => {
		const ev = m.evidence as Evidence | null;
		say(
			'  ' +
				[
					pad(i + 1, 3),
					pad(`${m.manufacturer.name} ${m.model}`.slice(0, 40), 40),
					pad(m.generationLabel ?? '?', 10),
					pad(m.boundarySource.slice(0, 8), 8),
					pad(m.registrationCount, 6),
					pad(m.availability, 7),
					pad(m.category.slice(0, 13), 13),
					pad(m.displacementCc, 5),
					pad(m.powerHp, 6),
					pad(m.wetWeightKg, 5),
					pad(m.seatHeightMm ?? '—', 5),
					pad(m.passengerAllowed === true ? 'yes' : m.passengerAllowed === false ? 'no' : '—', 4),
					pad(m.msrpAmount ?? '—', 8),
					pad(m.msrpYear ?? '—', 5),
					pad(m.imageStatus, 12),
					m.discoveryEligible ? 'YES' : `no: ${m.ineligibleReasons.join(', ')}`,
					ev?.fields.powerHp === 'CONFLICTING' ? ' [power conflict]' : ''
				].join(' ')
		);
	});

	const text = lines.join('\n');
	console.log(text);
	if (JSON_OUT) {
		writeFileSync(JSON_OUT, JSON.stringify({ since: SINCE, total, regs, top, text }, null, 2));
	}
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());

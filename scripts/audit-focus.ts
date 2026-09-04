import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { prisma } from '../src/lib/server/db/client';
import type { Evidence } from '../src/lib/server/catalog/evidence';

/**
 * The focused report: every generation from 2020 onward of a named set of
 * families, with each field's value and the evidence behind it.
 *
 *   npm run db:audit:focus -- [--json out.json]
 */

const FOCUS: [string, string][] = [
	['kawasaki', 'Z900'],
	['kawasaki', 'Z650'],
	['yamaha', 'MT-07'],
	['yamaha', 'MT-09'],
	['yamaha', 'Tracer 9'],
	['yamaha', 'Ténéré 700'],
	['kawasaki', 'Ninja 650'],
	['kawasaki', 'Versys 650'],
	['honda', 'NC750X'],
	['honda', 'CB750 Hornet'],
	['honda', 'CRF1100L Africa Twin'],
	['honda', 'CB1000 Hornet'],
	['bmw', 'R 1300 GS'],
	['bmw', 'R 1300 GS Adventure'],
	['bmw', 'F 900 GS'],
	['bmw', 'S 1000 RR'],
	['bmw', 'S 1000 XR'],
	['suzuki', 'GSX-8S'],
	['suzuki', 'V-Strom 800DE'],
	['triumph', 'Street Triple 765'],
	['triumph', 'Tiger 900'],
	['cfmoto', '450MT'],
	['cfmoto', '800MT']
];

const arg = (name: string) => {
	const i = process.argv.indexOf(`--${name}`);
	return i === -1 ? undefined : process.argv[i + 1];
};

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

async function main() {
	const out: unknown[] = [];
	const lines: string[] = [];

	for (const [brand, family] of FOCUS) {
		const rows = await prisma.motorcycle.findMany({
			where: {
				isActive: true,
				manufacturer: { matchKey: brand },
				OR: [
					{ generationTo: { gte: 2020 } },
					{ AND: [{ generationTo: null }, { lastRegistrationYear: { gte: 2020 } }] }
				]
			},
			include: {
				manufacturer: { select: { name: true } },
				images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 3 }
			},
			orderBy: { generationFrom: 'asc' }
		});
		const mine = rows.filter((r) => key(r.model) === key(family));

		lines.push(`\n${'═'.repeat(90)}\n${brand.toUpperCase()} ${family}`);
		if (!mine.length) {
			lines.push('  (no generation from 2020 onward in the catalogue)');
			out.push({ brand, family, generations: [] });
			continue;
		}

		const gens = mine.map((m) => {
			const ev = m.evidence as Evidence | null;
			const f = ev?.fields ?? ({} as Evidence['fields']);
			const primary = m.images[0];
			const g = {
				id: m.id,
				eligible: m.discoveryEligible,
				reasons: m.ineligibleReasons,
				years: m.generationLabel,
				boundary: m.boundarySource,
				image: primary
					? {
							status: m.imageStatus,
							scope: primary.scope,
							modelYear: primary.modelYear,
							source: primary.source,
							license: primary.license,
							evidence: primary.evidence,
							url: primary.url
						}
					: null,
				displacementCc: [m.displacementCc, f.displacementCc],
				powerHp: [m.powerHp, f.powerHp],
				torqueNm: [m.torqueNm, f.torqueNm],
				wetWeightKg: [m.wetWeightKg, f.wetWeightKg],
				seatHeightMm: [m.seatHeightMm, f.seatHeightMm],
				passengerAllowed: [m.passengerAllowed, f.passengerAllowed],
				price: [m.msrpAmount, m.msrpYear, f.msrpAmount, ev?.priceCurrency],
				category: [m.category, f.category],
				availability: [m.availability, f.availability],
				registrations: m.registrationCount,
				fieldSources: m.fieldSources
			};
			const v = (pair: unknown[]) => `${pair[0] ?? '—'} (${pair[1] ?? 'UNKNOWN'})`;
			lines.push(
				`  ${(m.generationLabel ?? '?').padEnd(10)} ${m.boundarySource.padEnd(8)} ${m.discoveryEligible ? 'DECK' : 'no: ' + m.ineligibleReasons.join(',')}`
			);
			lines.push(
				`    image ${m.imageStatus}${primary ? ` · ${primary.scope}${primary.modelYear ? ' ' + primary.modelYear : ''} · ${primary.source} · ${primary.license ?? '?'} · ${primary.evidence ?? ''}` : ''}`
			);
			lines.push(
				`    cc ${v(g.displacementCc)} · hp ${v(g.powerHp)} · Nm ${v(g.torqueNm)} · kg ${v(g.wetWeightKg)} · seat ${v(g.seatHeightMm)} · pax ${v(g.passengerAllowed)}`
			);
			lines.push(
				`    price ${m.msrpAmount ? `€${m.msrpAmount} (${m.msrpYear ?? '?'}, ${f.msrpAmount}, ${ev?.priceCurrency})` : '— (UNKNOWN)'} · category ${v(g.category)} · ${m.availability} (${f.availability}) · regs ${m.registrationCount ?? '—'}`
			);
			return g;
		});
		out.push({ brand, family, generations: gens });
	}

	console.log(lines.join('\n'));
	const json = arg('json');
	if (json) writeFileSync(json, JSON.stringify(out, null, 2));
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());

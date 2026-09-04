import { prisma } from '$lib/server/db/client';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async (event) => {
	const page = Math.max(Number(event.url.searchParams.get('page') ?? 1), 1);
	const query = (event.url.searchParams.get('q') ?? '').trim();
	const source = event.url.searchParams.get('source') ?? '';

	const where = {
		...(query
			? {
					OR: [
						{ model: { contains: query, mode: 'insensitive' as const } },
						{ variant: { contains: query, mode: 'insensitive' as const } },
						{ manufacturer: { name: { contains: query, mode: 'insensitive' as const } } }
					]
				}
			: {}),
		...(source ? { source } : {})
	};

	const [rows, total, sources] = await Promise.all([
		prisma.motorcycle.findMany({
			where,
			orderBy: [{ manufacturer: { name: 'asc' } }, { model: 'asc' }],
			skip: (page - 1) * PAGE_SIZE,
			take: PAGE_SIZE,
			select: {
				id: true,
				model: true,
				variant: true,
				modelYear: true,
				category: true,
				source: true,
				externalId: true,
				importedAt: true,
				isActive: true,
				manuallyEdited: true,
				displacementCc: true,
				powerHp: true,
				generationLabel: true,
				imageStatus: true,
				discoveryEligible: true,
				ineligibleReasons: true,
				availability: true,
				manufacturer: { select: { name: true } },
				_count: { select: { images: true, swipes: true } }
			}
		}),
		prisma.motorcycle.count({ where }),
		prisma.motorcycle.groupBy({ by: ['source'], _count: { _all: true } })
	]);

	return {
		rows,
		total,
		page,
		pageSize: PAGE_SIZE,
		pages: Math.max(Math.ceil(total / PAGE_SIZE), 1),
		query,
		source,
		sources: sources.map((s) => ({ source: s.source, count: s._count._all }))
	};
};

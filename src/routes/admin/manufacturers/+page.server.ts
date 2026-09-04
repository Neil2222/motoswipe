import { prisma } from '$lib/server/db/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const manufacturers = await prisma.manufacturer.findMany({
		orderBy: { name: 'asc' },
		select: {
			id: true,
			name: true,
			slug: true,
			countryCode: true,
			website: true,
			createdAt: true,
			_count: { select: { motorcycles: true } }
		}
	});

	// Retired counts per manufacturer, so a source going quiet is visible here.
	const retired = await prisma.motorcycle.groupBy({
		by: ['manufacturerId'],
		where: { isActive: false },
		_count: { _all: true }
	});
	const retiredBy = new Map(retired.map((r) => [r.manufacturerId, r._count._all]));

	return {
		manufacturers: manufacturers.map((m) => ({
			...m,
			retired: retiredBy.get(m.id) ?? 0
		}))
	};
};

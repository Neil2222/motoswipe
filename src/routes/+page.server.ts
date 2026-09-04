import { prisma } from '$lib/server/db/client';
import type { PageServerLoad } from './$types';

/**
 * Landing page. Counts are real rather than marketing numbers — on a
 * self-hosted instance they tell the visitor how much catalogue is actually
 * loaded, which is genuinely useful before signing up.
 */
export const load: PageServerLoad = async ({ url }) => {
	const [motorcycleCount, manufacturerCount, withPhoto, bySource] = await Promise.all([
		prisma.motorcycle.count({ where: { isActive: true } }),
		prisma.manufacturer.count(),
		prisma.motorcycle.count({
			where: { isActive: true, images: { some: { imageType: 'PHOTO' } } }
		}),
		prisma.motorcycle.groupBy({ by: ['source'], _count: { _all: true } })
	]);

	// The honesty note on the landing page depends on what is actually loaded:
	// an instance running only the sample catalogue should say so, and one with
	// real imported data should not.
	const demoOnly = bySource.length > 0 && bySource.every((s) => s.source === 'sample');

	return {
		motorcycleCount,
		manufacturerCount,
		withPhoto,
		demoOnly,
		discarded: url.searchParams.get('discarded') === '1'
	};
};

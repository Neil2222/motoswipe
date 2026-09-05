import { catalogueHealth } from '$lib/server/catalog/health';
import type { PageServerLoad } from './$types';

/** The audit numbers, live. Read-only like the rest of the admin section. */
export const load: PageServerLoad = async () => {
	return { health: await catalogueHealth(2020) };
};

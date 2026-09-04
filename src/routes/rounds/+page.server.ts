import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * `/rounds` and `/dashboard` would be the same list, so this redirects rather
 * than duplicating it. The route exists because it is the obvious URL to try.
 */
export const load: PageServerLoad = async () => {
	redirect(308, '/dashboard');
};

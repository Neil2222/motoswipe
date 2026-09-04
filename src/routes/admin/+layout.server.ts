import { requireAdmin } from '$lib/server/guards';
import type { LayoutServerLoad } from './$types';

/**
 * Single admin gate.
 *
 * Every `/admin/*` page inherits this, so no individual admin route can forget
 * the check. `requireAdmin` answers 404 rather than 403 for a non-admin — an
 * ordinary user has no business learning the route exists.
 */
export const load: LayoutServerLoad = async (event) => {
	const user = requireAdmin(event);
	return { admin: { id: user.id, displayName: user.displayName } };
};

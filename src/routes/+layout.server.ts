import type { LayoutServerLoad } from './$types';

/**
 * The signed-in user, available to every page.
 *
 * `locals.user` is already the trimmed SessionUser — no password hash, no
 * session token — so it can be handed to the client as-is.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	return { user: locals.user };
};

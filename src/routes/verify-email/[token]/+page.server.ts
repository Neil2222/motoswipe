import { verifyEmail } from '$lib/server/services/account.service';
import type { PageServerLoad } from './$types';

/**
 * The page a verification link lands on.
 *
 * Consuming on GET is deliberate: the link has to work from an email client
 * with a single tap, and the worst a link-prefetching mail scanner can do is
 * confirm the address slightly early. Nothing else changes.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const userId = await verifyEmail(params.token);

	// The layout's `user` was resolved before this ran; tell the page whether
	// the flag flipped for the person currently signed in.
	if (userId && locals.user?.id === userId) {
		locals.user = { ...locals.user, emailVerified: true };
	}

	return {
		verified: userId !== null,
		signedInAsVerified: userId !== null && locals.user?.id === userId
	};
};

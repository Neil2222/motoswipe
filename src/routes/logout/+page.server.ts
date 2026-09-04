import { redirect } from '@sveltejs/kit';
import { clearSessionCookie, revokeSession } from '$lib/server/auth/session';
import type { Actions, PageServerLoad } from './$types';

/**
 * Sign-out is POST only.
 *
 * A GET /logout link can be triggered by any third-party page embedding an
 * image — harmless but irritating, and the kind of thing that makes a session
 * vanish mid-swipe.
 */
export const load: PageServerLoad = async () => {
	redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ locals, cookies }) => {
		if (locals.sessionId) {
			// Revoke server-side as well as clearing the cookie: a copied cookie
			// must not outlive the sign-out.
			await revokeSession(locals.sessionId);
		}
		clearSessionCookie(cookies);
		locals.user = null;
		locals.sessionId = null;

		redirect(303, '/');
	}
};

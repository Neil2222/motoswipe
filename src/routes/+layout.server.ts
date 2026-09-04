import { getMailer } from '$lib/server/mail/mailer';
import { demoRoundFor } from '$lib/server/services/demo.service';
import type { LayoutServerLoad } from './$types';

/**
 * The signed-in user, available to every page.
 *
 * `locals.user` is already the trimmed SessionUser — no password hash, no
 * session token — so it can be handed to the client as-is. A guest also gets
 * the id of their demo round, which is where every "back" leads for them.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const demoRound = locals.user?.isGuest ? await demoRoundFor(locals.user.id) : null;

	return {
		user: locals.user,
		demoRoundId: demoRound?.id ?? null,
		// Decides whether the "confirm your address" nudge makes sense at all.
		mailEnabled: getMailer().enabled
	};
};

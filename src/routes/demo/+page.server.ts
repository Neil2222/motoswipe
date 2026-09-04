import { fail, redirect } from '@sveltejs/kit';
import {
	clearSessionCookie,
	createSession,
	revokeSession,
	setSessionCookie
} from '$lib/server/auth/session';
import { clientKey } from '$lib/server/guards';
import {
	DEMO_COMPARISON_TARGET,
	DEMO_DECK_SIZE,
	demoRoundFor,
	discardGuest,
	startDemo
} from '$lib/server/services/demo.service';
import { isDomainError } from '$lib/server/errors';
import { formError, type FormErrors } from '$lib/domain/validation';
import type { Actions, PageServerLoad } from './$types';

/**
 * The demo entrance.
 *
 * GET explains what is about to happen; POST creates the guest account and its
 * round and drops the visitor straight into the deck. A visitor who already
 * holds a guest session is sent back to their round rather than given a new
 * one, which is what makes the demo resumable.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user?.isGuest) {
		const round = await demoRoundFor(locals.user.id);
		if (round) redirect(303, `/rounds/${round.id}/swipe`);
	} else if (locals.user) {
		redirect(303, '/dashboard');
	}

	return { deckSize: DEMO_DECK_SIZE, comparisons: DEMO_COMPARISON_TARGET };
};

export const actions: Actions = {
	/** Start (or resume) the demo. */
	start: async (event) => {
		const { locals, cookies, request } = event;

		if (locals.user?.isGuest) {
			const round = await demoRoundFor(locals.user.id);
			if (round) redirect(303, `/rounds/${round.id}/swipe`);
		} else if (locals.user) {
			redirect(303, '/dashboard');
		}

		let roundId: string;
		try {
			const started = await startDemo(clientKey(event));
			const session = await createSession(started.user.id, request.headers.get('user-agent'));
			setSessionCookie(cookies, session.token, session.expiresAt);
			roundId = started.roundId;
		} catch (error) {
			if (isDomainError(error)) {
				const errors: FormErrors = formError(error.message);
				return fail(error.status, { errors });
			}
			throw error;
		}

		redirect(303, `/rounds/${roundId}/swipe`);
	},

	/** Throw the demo away: the guest account and everything in it. */
	discard: async ({ locals, cookies }) => {
		if (locals.user?.isGuest) {
			if (locals.sessionId) await revokeSession(locals.sessionId);
			await discardGuest(locals.user.id);
			clearSessionCookie(cookies);
			locals.user = null;
			locals.sessionId = null;
		}
		redirect(303, '/?discarded=1');
	}
};

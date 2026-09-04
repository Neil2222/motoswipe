import { error, fail, redirect } from '@sveltejs/kit';
import { registerSchema, fieldErrors, formError, type FormErrors } from '$lib/domain/validation';
import { register } from '$lib/server/services/auth.service';
import { claimGuest, demoRoundFor } from '$lib/server/services/demo.service';
import { sendVerificationEmail } from '$lib/server/services/account.service';
import { createSession, setSessionCookie } from '$lib/server/auth/session';
import { clientKey } from '$lib/server/guards';
import { isDomainError } from '$lib/server/errors';
import { env } from '$lib/server/env';
import type { Actions, PageServerLoad } from './$types';

/**
 * Sign-up, and — for a guest — claiming the demo.
 *
 * A guest arriving here is not redirected away like a signed-in user would
 * be: this is where their guest account gets an email and a password and
 * stops being a guest, with the demo round intact.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user && !locals.user.isGuest) redirect(303, '/dashboard');
	if (!env.allowRegistration) {
		error(403, { message: 'Registration is closed on this instance.' });
	}

	const guest = locals.user?.isGuest ? locals.user : null;
	const demoRound = guest ? await demoRoundFor(guest.id) : null;

	return { claim: guest !== null, demoRoundId: demoRound?.id ?? null };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const raw = {
			email: String(form.get('email') ?? ''),
			username: String(form.get('username') ?? ''),
			displayName: String(form.get('displayName') ?? ''),
			password: String(form.get('password') ?? '')
		};

		const values = { email: raw.email, username: raw.username, displayName: raw.displayName };

		const parsed = registerSchema.safeParse(raw);
		if (!parsed.success) {
			const errors: FormErrors = fieldErrors(parsed.error);
			return fail(422, { values, errors });
		}

		const guest = event.locals.user?.isGuest ? event.locals.user : null;
		// A new account goes to the profile: height and inseam are what make the
		// fit hints work. A claimed demo goes back to the result it just saved.
		let destination = '/profile?welcome=1';

		try {
			if (guest) {
				// Look the round up first: once claimed, the account is no longer
				// a guest and the demo lookup would answer nothing.
				const round = await demoRoundFor(guest.id);
				// The guest row becomes the account; the existing session stays
				// valid because the user id does not change.
				const user = await claimGuest(guest.id, parsed.data, clientKey(event));
				event.locals.user = user;
				if (round) destination = `/rounds/${round.id}/results?saved=1`;
				await sendVerificationEmail(user, event.url.origin);
			} else {
				const user = await register(parsed.data, clientKey(event));
				const session = await createSession(user.id, event.request.headers.get('user-agent'));
				setSessionCookie(event.cookies, session.token, session.expiresAt);
				await sendVerificationEmail(user, event.url.origin);
			}
		} catch (err) {
			if (isDomainError(err)) {
				const errors: FormErrors = formError(err.message);
				return fail(err.status, { values, errors });
			}
			throw err;
		}

		redirect(303, destination);
	}
};

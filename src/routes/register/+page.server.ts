import { error, fail, redirect } from '@sveltejs/kit';
import { registerSchema, fieldErrors, formError, type FormErrors } from '$lib/domain/validation';
import { register } from '$lib/server/services/auth.service';
import { createSession, setSessionCookie } from '$lib/server/auth/session';
import { clientKey } from '$lib/server/guards';
import { isDomainError } from '$lib/server/errors';
import { env } from '$lib/server/env';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(303, '/dashboard');
	if (!env.allowRegistration) {
		error(403, { message: 'Registration is closed on this instance.' });
	}
	return {};
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

		try {
			const user = await register(parsed.data, clientKey(event));
			const session = await createSession(user.id, event.request.headers.get('user-agent'));
			setSessionCookie(event.cookies, session.token, session.expiresAt);
		} catch (err) {
			if (isDomainError(err)) {
				const errors: FormErrors = formError(err.message);
				return fail(err.status, { values, errors });
			}
			throw err;
		}

		// Straight to the profile: height and inseam are what make the fit hints
		// work, and asking now is far more effective than a banner later.
		redirect(303, '/profile?welcome=1');
	}
};

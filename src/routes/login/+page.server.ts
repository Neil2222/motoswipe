import { fail, redirect } from '@sveltejs/kit';
import { loginSchema, fieldErrors, type FormErrors } from '$lib/domain/validation';
import { login } from '$lib/server/services/auth.service';
import { adoptGuestInto } from '$lib/server/services/demo.service';
import { createSession, revokeSession, setSessionCookie } from '$lib/server/auth/session';
import { getMailer } from '$lib/server/mail/mailer';
import { clientKey } from '$lib/server/guards';
import { isDomainError } from '$lib/server/errors';
import { env } from '$lib/server/env';
import type { Actions, PageServerLoad } from './$types';

/**
 * `redirectTo` is validated as a same-site absolute path before use. Taking it
 * verbatim would turn the login page into an open redirect — a classic
 * phishing primitive.
 */
function safeRedirect(target: string | null): string {
	if (!target) return '/dashboard';
	if (!target.startsWith('/') || target.startsWith('//')) return '/dashboard';
	return target;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	// A guest may sign in to an existing account; their demo round comes along.
	if (locals.user && !locals.user.isGuest) {
		redirect(303, safeRedirect(url.searchParams.get('redirectTo')));
	}
	return {
		redirectTo: safeRedirect(url.searchParams.get('redirectTo')),
		allowRegistration: env.allowRegistration,
		fromDemo: Boolean(locals.user?.isGuest),
		canReset: getMailer().enabled,
		justReset: url.searchParams.get('reset') === '1'
	};
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const raw = {
			identifier: String(form.get('identifier') ?? ''),
			password: String(form.get('password') ?? '')
		};

		const parsed = loginSchema.safeParse(raw);
		if (!parsed.success) {
			const errors: FormErrors = fieldErrors(parsed.error);
			return fail(422, { identifier: raw.identifier, errors });
		}

		try {
			const user = await login(parsed.data, clientKey(event));

			// Signing in from a demo: the demo round becomes this account's, and
			// the guest — session included — is deleted.
			const guest = event.locals.user?.isGuest ? event.locals.user : null;
			if (guest) {
				await adoptGuestInto(guest.id, user.id);
				if (event.locals.sessionId) await revokeSession(event.locals.sessionId);
			}

			const session = await createSession(user.id, event.request.headers.get('user-agent'));
			setSessionCookie(event.cookies, session.token, session.expiresAt);
		} catch (error) {
			if (isDomainError(error)) {
				const errors: FormErrors = error.toFormErrors();
				return fail(error.status, { identifier: raw.identifier, errors });
			}
			throw error;
		}

		const target = safeRedirect(String(form.get('redirectTo') ?? ''));
		redirect(303, target);
	}
};

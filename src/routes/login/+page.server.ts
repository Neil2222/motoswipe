import { fail, redirect } from '@sveltejs/kit';
import { loginSchema, fieldErrors, type FormErrors } from '$lib/domain/validation';
import { login } from '$lib/server/services/auth.service';
import { createSession, setSessionCookie } from '$lib/server/auth/session';
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
	if (locals.user) redirect(303, safeRedirect(url.searchParams.get('redirectTo')));
	return {
		redirectTo: safeRedirect(url.searchParams.get('redirectTo')),
		allowRegistration: env.allowRegistration
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

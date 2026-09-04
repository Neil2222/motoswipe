import { fail, redirect } from '@sveltejs/kit';
import { emailSchema, fieldErrors, formError, type FormErrors } from '$lib/domain/validation';
import { requestPasswordReset } from '$lib/server/services/account.service';
import { getMailer } from '$lib/server/mail/mailer';
import { clientKey } from '$lib/server/guards';
import { isDomainError } from '$lib/server/errors';
import type { Actions, PageServerLoad } from './$types';

/**
 * "Forgot your password?"
 *
 * The response never says whether the address exists. Whatever happens
 * server-side — no such account, mail failure, a guest address — the page
 * shows the same confirmation, and the detail goes to the server log.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user && !locals.user.isGuest) redirect(303, '/profile');
	return { enabled: getMailer().enabled };
};

export const actions: Actions = {
	default: async (event) => {
		if (!getMailer().enabled) {
			const errors: FormErrors = formError(
				'This instance has no email configured, so passwords cannot be reset by link. Ask whoever runs it.'
			);
			return fail(503, { errors });
		}

		const form = await event.request.formData();
		const raw = String(form.get('email') ?? '');

		const parsed = emailSchema.safeParse(raw);
		if (!parsed.success) {
			const issues = fieldErrors(parsed.error);
			const errors: FormErrors = {
				email: issues._ ?? issues.email ?? 'Enter a valid email address'
			};
			return fail(422, { email: raw, errors });
		}

		try {
			const outcome = await requestPasswordReset(parsed.data, clientKey(event), event.url.origin);
			if (!outcome.sent) {
				console.log(`[motoswipe] password reset not sent: ${outcome.reason}`);
			}
		} catch (error) {
			// Only rate limiting surfaces: it is about this client, not the account.
			if (isDomainError(error) && error.status === 429) {
				const errors: FormErrors = formError(error.message);
				return fail(429, { email: raw, errors });
			}
			throw error;
		}

		return { sent: true, email: parsed.data };
	}
};

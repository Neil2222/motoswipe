import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { fieldErrors, passwordSchema, type FormErrors } from '$lib/domain/validation';
import { isResetTokenLive, resetPassword } from '$lib/server/services/account.service';
import { clearSessionCookie } from '$lib/server/auth/session';
import type { Actions, PageServerLoad } from './$types';

const resetSchema = z
	.object({
		password: passwordSchema,
		confirmPassword: z.string()
	})
	.refine((d) => d.password === d.confirmPassword, {
		message: 'The two passwords do not match',
		path: ['confirmPassword']
	});

/**
 * The page a reset link lands on. The token is checked up front so a dead
 * link says so immediately instead of after the user has typed a password.
 */
export const load: PageServerLoad = async ({ params }) => {
	return { live: await isResetTokenLive(params.token) };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const parsed = resetSchema.safeParse({
			password: String(form.get('password') ?? ''),
			confirmPassword: String(form.get('confirmPassword') ?? '')
		});
		if (!parsed.success) {
			const errors: FormErrors = fieldErrors(parsed.error);
			return fail(422, { errors });
		}

		const userId = await resetPassword(event.params.token, parsed.data.password);
		if (!userId) {
			return fail(410, { expired: true });
		}

		// Every session was revoked, including any this browser holds.
		clearSessionCookie(event.cookies);
		event.locals.user = null;
		event.locals.sessionId = null;

		redirect(303, '/login?reset=1');
	}
};

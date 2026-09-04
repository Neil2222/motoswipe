import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db/client';
import { requireFullUser } from '$lib/server/guards';
import {
	fieldErrors,
	passwordChangeSchema,
	profileSchema,
	type FormErrors
} from '$lib/domain/validation';
import { changePassword } from '$lib/server/services/auth.service';
import { resendVerificationEmail } from '$lib/server/services/account.service';
import { getMailer } from '$lib/server/mail/mailer';
import { revokeAllSessionsForUser } from '$lib/server/auth/session';
import { isDomainError } from '$lib/server/errors';
import { assessFit } from '$lib/server/fit/fit';
import { FIT_DISCLAIMER } from '$lib/domain/fit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireFullUser(event);

	const profile = await prisma.userProfile.findUnique({
		where: { userId: user.id },
		select: {
			heightCm: true,
			inseamCm: true,
			countryCode: true,
			preferredCurrency: true,
			profileVisibility: true
		}
	});

	const [roundCount, swipeCount, superlikeCount] = await Promise.all([
		prisma.discoveryRound.count({ where: { userId: user.id } }),
		prisma.swipe.count({ where: { round: { userId: user.id } } }),
		prisma.swipe.count({ where: { round: { userId: user.id }, decision: 'SUPERLIKE' } })
	]);

	/**
	 * Three reference seat heights so the fit estimate is legible before the
	 * user has swiped anything: a low cruiser, a typical naked, a tall ADV.
	 */
	const examples = [
		{ label: 'Low cruiser', seatHeightMm: 690, wetWeightKg: 250 },
		{ label: 'Typical naked', seatHeightMm: 810, wetWeightKg: 200 },
		{ label: 'Tall adventure', seatHeightMm: 875, wetWeightKg: 230 }
	].map((example) => ({
		label: example.label,
		seatHeightMm: example.seatHeightMm,
		fit: assessFit(
			{ heightCm: profile?.heightCm ?? null, inseamCm: profile?.inseamCm ?? null },
			{ seatHeightMm: example.seatHeightMm, wetWeightKg: example.wetWeightKg, seatWidthMm: null }
		)
	}));

	return {
		mailEnabled: getMailer().enabled,
		profile: profile ?? {
			heightCm: null,
			inseamCm: null,
			countryCode: null,
			preferredCurrency: null,
			profileVisibility: 'PRIVATE' as const
		},
		stats: { roundCount, swipeCount, superlikeCount },
		examples,
		fitDisclaimer: FIT_DISCLAIMER
	};
};

export const actions: Actions = {
	profile: async (event) => {
		const user = requireFullUser(event);
		const form = await event.request.formData();

		const parsed = profileSchema.safeParse({
			displayName: String(form.get('displayName') ?? ''),
			heightCm: String(form.get('heightCm') ?? ''),
			inseamCm: String(form.get('inseamCm') ?? ''),
			countryCode: String(form.get('countryCode') ?? ''),
			preferredCurrency: String(form.get('preferredCurrency') ?? '')
		});

		if (!parsed.success) {
			const errors: FormErrors = fieldErrors(parsed.error);
			return fail(422, { section: 'profile' as const, errors });
		}

		const { displayName, ...profileFields } = parsed.data;

		await prisma.$transaction([
			prisma.user.update({ where: { id: user.id }, data: { displayName } }),
			prisma.userProfile.upsert({
				where: { userId: user.id },
				create: { userId: user.id, ...profileFields },
				update: profileFields
			})
		]);

		return { section: 'profile' as const, saved: true, revoked: 0 };
	},

	resendVerification: async (event) => {
		const user = requireFullUser(event);
		try {
			const outcome = await resendVerificationEmail(user.id, event.url.origin);
			if (!outcome.sent) {
				const errors: FormErrors = { _: outcome.reason ?? 'Nothing was sent.' };
				return fail(400, { section: 'email' as const, errors });
			}
		} catch (error) {
			if (isDomainError(error)) {
				const errors: FormErrors = error.toFormErrors();
				return fail(error.status, { section: 'email' as const, errors });
			}
			throw error;
		}
		return { section: 'email' as const, saved: true, revoked: 0 };
	},

	password: async (event) => {
		const user = requireFullUser(event);
		const form = await event.request.formData();

		const parsed = passwordChangeSchema.safeParse({
			currentPassword: String(form.get('currentPassword') ?? ''),
			newPassword: String(form.get('newPassword') ?? ''),
			confirmPassword: String(form.get('confirmPassword') ?? '')
		});

		if (!parsed.success) {
			const errors: FormErrors = fieldErrors(parsed.error);
			return fail(422, { section: 'password' as const, errors });
		}

		try {
			await changePassword(user.id, parsed.data.currentPassword, parsed.data.newPassword);
		} catch (error) {
			if (isDomainError(error)) {
				const errors: FormErrors = error.toFormErrors();
				return fail(error.status, { section: 'password' as const, errors });
			}
			throw error;
		}

		// Every other device is signed out. A password change is usually a
		// response to "someone may have my password", and leaving those sessions
		// live would defeat the point.
		const revoked = await revokeAllSessionsForUser(user.id, event.locals.sessionId ?? undefined);

		return { section: 'password' as const, saved: true, revoked };
	}
};

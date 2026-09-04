import { fail, redirect } from '@sveltejs/kit';
import { requireOwnedRound } from '$lib/server/guards';
import { getRoundProgress, renameRound, setRoundStatus } from '$lib/server/services/round.service';
import { comparisonCount } from '$lib/server/services/ranking.service';
import { completeRound, lastSwipe } from '$lib/server/services/swipe.service';
import { prisma } from '$lib/server/db/client';
import { isDomainError } from '$lib/server/errors';
import { formError, type FormErrors } from '$lib/domain/validation';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { round } = await requireOwnedRound(event, event.params.id);

	const [progress, comparisons, last, manufacturers] = await Promise.all([
		getRoundProgress(round.id, round.filters),
		comparisonCount(round.id),
		lastSwipe(round.id),
		prisma.manufacturer.findMany({ select: { id: true, name: true } })
	]);

	return {
		round: {
			id: round.id,
			name: round.name,
			description: round.description,
			goal: round.goal,
			status: round.status,
			filters: round.filters,
			createdAt: round.createdAt,
			completedAt: round.completedAt
		},
		progress,
		comparisons,
		lastSwipe: last,
		manufacturers
	};
};

export const actions: Actions = {
	rename: async (event) => {
		const { user, round } = await requireOwnedRound(event, event.params.id);
		const form = await event.request.formData();

		const name = String(form.get('name') ?? '').trim();
		if (!name) {
			const errors: FormErrors = formError('A round needs a name.');
			return fail(422, { errors });
		}

		await renameRound(user.id, round.id, {
			name: name.slice(0, 80),
			description:
				String(form.get('description') ?? '')
					.trim()
					.slice(0, 500) || null,
			goal:
				String(form.get('goal') ?? '')
					.trim()
					.slice(0, 200) || null
		});

		return { renamed: true };
	},

	complete: async (event) => {
		const { round } = await requireOwnedRound(event, event.params.id);
		const form = await event.request.formData();
		const force = form.get('force') === '1';

		try {
			await completeRound(round.id, round.filters, force);
		} catch (error) {
			if (isDomainError(error)) {
				const errors: FormErrors = formError(error.message);
				return fail(error.status, { errors });
			}
			throw error;
		}

		redirect(303, `/rounds/${round.id}/results`);
	},

	reopen: async (event) => {
		const { user, round } = await requireOwnedRound(event, event.params.id);
		await setRoundStatus(user.id, round.id, 'ACTIVE');
		return { reopened: true };
	}
};

import { fail, redirect } from '@sveltejs/kit';
import { requireFullUser } from '$lib/server/guards';
import { createRound } from '$lib/server/services/round.service';
import { fieldErrors, roundCreateSchema, type FormErrors } from '$lib/domain/validation';
import { RoundFiltersSchema, normalizeFilters } from '$lib/domain/filters';
import { readFilterForm } from '$lib/server/services/filter-form';
import {
	catalogueBounds,
	categoryCounts,
	countCandidates,
	listManufacturers
} from '$lib/server/services/motorcycle.service';
import { isDomainError } from '$lib/server/errors';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	requireFullUser(event);

	const [manufacturers, categories, bounds, catalogueSize] = await Promise.all([
		listManufacturers(),
		categoryCounts(),
		catalogueBounds(),
		countCandidates({})
	]);

	return { manufacturers, categories, bounds, catalogueSize };
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireFullUser(event);
		const form = await event.request.formData();

		const filtersParsed = RoundFiltersSchema.safeParse(readFilterForm(form));
		if (!filtersParsed.success) {
			const errors: FormErrors = fieldErrors(filtersParsed.error);
			return fail(422, { errors });
		}

		const parsed = roundCreateSchema.safeParse({
			name: String(form.get('name') ?? ''),
			description: String(form.get('description') ?? ''),
			goal: String(form.get('goal') ?? ''),
			visibility: 'PRIVATE',
			filters: normalizeFilters(filtersParsed.data)
		});

		if (!parsed.success) {
			const errors: FormErrors = fieldErrors(parsed.error);
			return fail(422, { errors });
		}

		let roundId: string;
		try {
			const round = await createRound(user.id, parsed.data);
			roundId = round.id;
		} catch (error) {
			if (isDomainError(error)) {
				const errors: FormErrors = error.toFormErrors();
				return fail(error.status, { errors });
			}
			throw error;
		}

		// Straight into the deck: the round exists to be swiped.
		redirect(303, `/rounds/${roundId}/swipe`);
	}
};

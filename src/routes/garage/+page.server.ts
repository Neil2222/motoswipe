import { fail, redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { listFavorites } from '$lib/server/services/favorite.service';
import { createRound } from '$lib/server/services/round.service';
import { ConflictError, ValidationError } from '$lib/server/errors';
import type { Actions, PageServerLoad } from './$types';

/**
 * The garage: everything this user has hearted.
 *
 * Scoped by `userId` in the query itself, like every other personal list in
 * this app — there is no code path here that could return somebody else's.
 */
export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	return { saved: await listFavorites(user.id) };
};

export const actions: Actions = {
	/**
	 * Turns the garage into a round.
	 *
	 * Hearting bikes and then having nowhere to take them would make the garage
	 * a dead end. This is the way back into the product: swipe your own saved
	 * bikes as a second pass, then compare the survivors head to head — which is
	 * exactly the question "I like all of these, but which one do I actually
	 * want" that a garage full of motorcycles eventually poses.
	 */
	startRound: async (event) => {
		const user = requireUser(event);
		const saved = await listFavorites(user.id);

		if (saved.length < 2) {
			return fail(400, { error: 'Save at least two motorcycles first.' });
		}

		const form = await event.request.formData();
		const name = String(form.get('name') ?? '').trim() || 'From my garage';

		let round;
		try {
			round = await createRound(user.id, {
				name: name.slice(0, 80),
				// Private, like every round. Visibility exists in the model; social
				// features do not.
				visibility: 'PRIVATE',
				goal: 'Which of the bikes I have saved do I actually want?',
				// The deck is named outright rather than described by a rule,
				// because a hand-picked set is not a property of a motorcycle.
				filters: { motorcycleIds: saved.map((entry) => entry.bike.id) }
			});
		} catch (error) {
			if (error instanceof ValidationError || error instanceof ConflictError) {
				return fail(400, { error: error.message });
			}
			throw error;
		}

		redirect(303, `/rounds/${round.id}/swipe`);
	}
};

import { json } from '@sveltejs/kit';
import { requireUserApi } from '$lib/server/guards';
import { parseFilterForm } from '$lib/server/services/filter-form';
import { countCandidates } from '$lib/server/services/motorcycle.service';
import type { RequestHandler } from './$types';

/**
 * Live deck-size preview for the round form.
 *
 * A separate endpoint rather than a form action: an action response is
 * devalue-encoded and would have to be decoded by hand on the client, which is
 * a lot of fragility for one integer.
 */
export const POST: RequestHandler = async (event) => {
	requireUserApi(event);

	const form = await event.request.formData();
	const filters = parseFilterForm(form);

	if (!filters) {
		return json({ count: null, error: 'Those filter values are not valid.' }, { status: 422 });
	}

	return json({ count: await countCandidates(filters), filters });
};
